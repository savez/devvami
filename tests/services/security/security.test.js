import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFile, unlink, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// We mock shell.js before importing security.js
vi.mock('../../../src/services/shell.js', () => ({
  which: vi.fn(),
  exec: vi.fn(),
  execOrThrow: vi.fn(),
}))

import { checkToolStatus, appendToShellProfile, deriveOverallStatus } from '../../../src/services/security.js'
import { which, exec } from '../../../src/services/shell.js'

beforeEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// checkToolStatus — macOS
// ---------------------------------------------------------------------------
describe('checkToolStatus() — macOS', () => {
  it('returns n/a for gpg, pass, gcm on macOS', async () => {
    which.mockResolvedValue(null)
    exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 })

    const tools = await checkToolStatus('macos')
    const ids = tools.map((t) => t.id)
    const gpg = tools.find((t) => t.id === 'gpg')
    const pass = tools.find((t) => t.id === 'pass')
    const gcm = tools.find((t) => t.id === 'gcm')

    expect(gpg?.status).toBe('n/a')
    expect(pass?.status).toBe('n/a')
    expect(gcm?.status).toBe('n/a')
    expect(ids).toContain('aws-vault')
    expect(ids).toContain('osxkeychain')
  })

  it('aws-vault installed on macOS returns installed', async () => {
    which.mockImplementation((cmd) => (cmd === 'aws-vault' ? '/usr/local/bin/aws-vault' : null))
    exec.mockImplementation((cmd, _args) => {
      if (cmd === 'aws-vault') return Promise.resolve({ stdout: 'v6.6.2', stderr: '', exitCode: 0 })
      if (cmd === 'git') return Promise.resolve({ stdout: 'osxkeychain', stderr: '', exitCode: 0 })
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
    })

    const tools = await checkToolStatus('macos')
    const awsVault = tools.find((t) => t.id === 'aws-vault')
    expect(awsVault?.status).toBe('installed')
    expect(awsVault?.version).toBe('6.6.2')
  })

  it('aws-vault not installed returns not-installed', async () => {
    which.mockResolvedValue(null)
    exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 })

    const tools = await checkToolStatus('macos')
    const awsVault = tools.find((t) => t.id === 'aws-vault')
    expect(awsVault?.status).toBe('not-installed')
  })

  it('osxkeychain configured returns installed', async () => {
    which.mockResolvedValue(null)
    exec.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.includes('credential.helper')) {
        return Promise.resolve({ stdout: 'osxkeychain', stderr: '', exitCode: 0 })
      }
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 1 })
    })

    const tools = await checkToolStatus('macos')
    const ks = tools.find((t) => t.id === 'osxkeychain')
    expect(ks?.status).toBe('installed')
  })

  it('osxkeychain not configured returns not-installed', async () => {
    which.mockResolvedValue(null)
    exec.mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.includes('credential.helper')) {
        return Promise.resolve({ stdout: 'store', stderr: '', exitCode: 0 })
      }
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 1 })
    })

    const tools = await checkToolStatus('macos')
    const ks = tools.find((t) => t.id === 'osxkeychain')
    expect(ks?.status).toBe('not-installed')
  })
})

// ---------------------------------------------------------------------------
// checkToolStatus — Linux
// ---------------------------------------------------------------------------
describe('checkToolStatus() — Linux', () => {
  it('returns n/a for osxkeychain on Linux', async () => {
    which.mockResolvedValue(null)
    exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 })

    const tools = await checkToolStatus('linux')
    const ks = tools.find((t) => t.id === 'osxkeychain')
    expect(ks?.status).toBe('n/a')
  })

  it('aws-vault misconfigured when AWS_VAULT_BACKEND != pass', async () => {
    const originalEnv = process.env.AWS_VAULT_BACKEND
    delete process.env.AWS_VAULT_BACKEND

    which.mockImplementation((cmd) => (cmd === 'aws-vault' ? '/usr/local/bin/aws-vault' : null))
    exec.mockImplementation((cmd) => {
      if (cmd === 'aws-vault') return Promise.resolve({ stdout: 'v6.6.2', stderr: '', exitCode: 0 })
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 1 })
    })

    const tools = await checkToolStatus('linux')
    const awsVault = tools.find((t) => t.id === 'aws-vault')
    expect(awsVault?.status).toBe('misconfigured')

    if (originalEnv !== undefined) process.env.AWS_VAULT_BACKEND = originalEnv
  })

  it('aws-vault installed when AWS_VAULT_BACKEND=pass', async () => {
    process.env.AWS_VAULT_BACKEND = 'pass'

    which.mockImplementation((cmd) => (cmd === 'aws-vault' ? '/usr/local/bin/aws-vault' : null))
    exec.mockImplementation((cmd) => {
      if (cmd === 'aws-vault') return Promise.resolve({ stdout: 'v6.6.2', stderr: '', exitCode: 0 })
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
    })

    const tools = await checkToolStatus('linux')
    const awsVault = tools.find((t) => t.id === 'aws-vault')
    expect(awsVault?.status).toBe('installed')

    delete process.env.AWS_VAULT_BACKEND
  })

  it('gcm misconfigured when credential.credentialStore != gpg', async () => {
    which.mockImplementation((cmd) => (cmd === 'git-credential-manager' ? '/usr/bin/git-credential-manager' : null))
    exec.mockImplementation((cmd, args) => {
      if (cmd === 'git-credential-manager') return Promise.resolve({ stdout: '2.4.1', stderr: '', exitCode: 0 })
      if (cmd === 'git' && args?.includes('credential.credentialStore')) {
        return Promise.resolve({ stdout: 'plaintext', stderr: '', exitCode: 0 })
      }
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 1 })
    })

    const tools = await checkToolStatus('linux')
    const gcm = tools.find((t) => t.id === 'gcm')
    expect(gcm?.status).toBe('misconfigured')
  })
})

// ---------------------------------------------------------------------------
// appendToShellProfile
// ---------------------------------------------------------------------------
describe('appendToShellProfile()', () => {
  let tmpDir
  let profilePath

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dvmi-test-'))
    profilePath = join(tmpDir, '.bashrc')
    vi.stubEnv('SHELL', '/bin/bash')
    vi.stubEnv('HOME', tmpDir)
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    try {
      await unlink(profilePath)
    } catch {
      // ignore
    }
  })

  it('appends line to shell profile', async () => {
    await writeFile(profilePath, '# existing\n')
    await appendToShellProfile('export AWS_VAULT_BACKEND=pass')

    const { readFile } = await import('node:fs/promises')
    const contents = await readFile(profilePath, 'utf8')
    expect(contents).toContain('export AWS_VAULT_BACKEND=pass')
  })

  it('is idempotent — does not append the same line twice', async () => {
    await writeFile(profilePath, '# existing\n')
    await appendToShellProfile('export AWS_VAULT_BACKEND=pass')
    await appendToShellProfile('export AWS_VAULT_BACKEND=pass')

    const { readFile } = await import('node:fs/promises')
    const contents = await readFile(profilePath, 'utf8')
    const count = (contents.match(/export AWS_VAULT_BACKEND=pass/g) ?? []).length
    expect(count).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// deriveOverallStatus
// ---------------------------------------------------------------------------
describe('deriveOverallStatus()', () => {
  it('returns success when all applicable tools are installed', () => {
    const tools = [
      { id: 'aws-vault', displayName: 'aws-vault', status: 'installed', version: '6.6.2', hint: null },
      { id: 'gcm', displayName: 'GCM', status: 'n/a', version: null, hint: null },
      { id: 'osxkeychain', displayName: 'Keychain', status: 'installed', version: null, hint: null },
    ]
    expect(deriveOverallStatus(tools)).toBe('success')
  })

  it('returns partial when some tools are installed and some are not', () => {
    const tools = [
      { id: 'aws-vault', displayName: 'aws-vault', status: 'installed', version: '6.6.2', hint: null },
      { id: 'osxkeychain', displayName: 'Keychain', status: 'not-installed', version: null, hint: null },
    ]
    expect(deriveOverallStatus(tools)).toBe('partial')
  })

  it('returns not-configured when no applicable tools are installed', () => {
    const tools = [
      { id: 'aws-vault', displayName: 'aws-vault', status: 'not-installed', version: null, hint: null },
      { id: 'osxkeychain', displayName: 'Keychain', status: 'not-installed', version: null, hint: null },
    ]
    expect(deriveOverallStatus(tools)).toBe('not-configured')
  })

  it('returns not-configured when all tools are n/a', () => {
    const tools = [
      { id: 'gcm', displayName: 'GCM', status: 'n/a', version: null, hint: null },
    ]
    expect(deriveOverallStatus(tools)).toBe('not-configured')
  })

  it('treats misconfigured as not-installed for partial calculation', () => {
    const tools = [
      { id: 'aws-vault', displayName: 'aws-vault', status: 'misconfigured', version: null, hint: null },
      { id: 'osxkeychain', displayName: 'Keychain', status: 'installed', version: null, hint: null },
    ]
    expect(deriveOverallStatus(tools)).toBe('partial')
  })
})

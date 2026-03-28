import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/services/shell.js', () => ({
  which: vi.fn(),
  exec: vi.fn(),
  execOrThrow: vi.fn(),
}))

vi.mock('../../../src/services/config.js', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
}))

import {
  isChezmoiInstalled,
  getChezmoiConfig,
  getManagedFiles,
  isPathSensitive,
  isWSLWindowsPath,
  getDefaultFileList,
  getSensitivePatterns,
  SENSITIVE_PATTERNS,
  getChezmoiRemote,
  hasLocalChanges,
} from '../../../src/services/dotfiles.js'
import { which, exec } from '../../../src/services/shell.js'

beforeEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// isChezmoiInstalled
// ---------------------------------------------------------------------------
describe('isChezmoiInstalled()', () => {
  it('returns true when chezmoi is in PATH', async () => {
    which.mockResolvedValue('/usr/local/bin/chezmoi')
    expect(await isChezmoiInstalled()).toBe(true)
  })

  it('returns false when chezmoi is not in PATH', async () => {
    which.mockResolvedValue(null)
    expect(await isChezmoiInstalled()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getChezmoiConfig
// ---------------------------------------------------------------------------
describe('getChezmoiConfig()', () => {
  it('returns parsed object when chezmoi dump-config succeeds', async () => {
    const mockConfig = { encryption: { tool: 'age' }, sourceDir: '/home/user/.local/share/chezmoi' }
    exec.mockResolvedValue({ stdout: JSON.stringify(mockConfig), stderr: '', exitCode: 0 })
    const result = await getChezmoiConfig()
    expect(result).toEqual(mockConfig)
    expect(exec).toHaveBeenCalledWith('chezmoi', ['dump-config', '--format', 'json'])
  })

  it('returns null when chezmoi exits non-zero', async () => {
    exec.mockResolvedValue({ stdout: '', stderr: 'not initialized', exitCode: 1 })
    expect(await getChezmoiConfig()).toBeNull()
  })

  it('returns null when output is empty', async () => {
    exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    expect(await getChezmoiConfig()).toBeNull()
  })

  it('returns null when output is invalid JSON', async () => {
    exec.mockResolvedValue({ stdout: 'not json', stderr: '', exitCode: 0 })
    expect(await getChezmoiConfig()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getManagedFiles
// ---------------------------------------------------------------------------
describe('getManagedFiles()', () => {
  it('returns empty array when chezmoi managed exits non-zero', async () => {
    exec.mockResolvedValue({ stdout: '', stderr: 'error', exitCode: 1 })
    expect(await getManagedFiles()).toEqual([])
  })

  it('parses managed files with plaintext source paths', async () => {
    const raw = [
      { targetPath: '/home/user/.zshrc', sourcePath: '/home/user/.local/share/chezmoi/dot_zshrc', type: 'file' },
      { targetPath: '/home/user/.gitconfig', sourcePath: '/home/user/.local/share/chezmoi/dot_gitconfig', type: 'file' },
    ]
    exec.mockResolvedValue({ stdout: JSON.stringify(raw), stderr: '', exitCode: 0 })
    const files = await getManagedFiles()
    expect(files).toHaveLength(2)
    expect(files[0].path).toBe('/home/user/.zshrc')
    expect(files[0].encrypted).toBe(false)
    expect(files[0].type).toBe('file')
  })

  it('detects encrypted files from source path basename', async () => {
    const raw = [
      { targetPath: '/home/user/.ssh/id_ed25519', sourcePath: '/home/user/.local/share/chezmoi/private_dot_ssh/encrypted_id_ed25519.age', type: 'file' },
    ]
    exec.mockResolvedValue({ stdout: JSON.stringify(raw), stderr: '', exitCode: 0 })
    const files = await getManagedFiles()
    expect(files[0].encrypted).toBe(true)
  })

  it('detects encrypted files from source path parent dir', async () => {
    const raw = [
      { targetPath: '/home/user/.netrc', sourcePath: '/home/user/.local/share/chezmoi/encrypted_dot_netrc.age', type: 'file' },
    ]
    exec.mockResolvedValue({ stdout: JSON.stringify(raw), stderr: '', exitCode: 0 })
    const files = await getManagedFiles()
    expect(files[0].encrypted).toBe(true)
  })

  it('returns empty array when JSON parse fails', async () => {
    exec.mockResolvedValue({ stdout: 'bad json', stderr: '', exitCode: 0 })
    expect(await getManagedFiles()).toEqual([])
  })

  it('returns empty array when chezmoi returns non-array JSON', async () => {
    exec.mockResolvedValue({ stdout: '{}', stderr: '', exitCode: 0 })
    expect(await getManagedFiles()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// isPathSensitive
// ---------------------------------------------------------------------------
describe('isPathSensitive()', () => {
  it('returns true for SSH private key matching ~/.ssh/id_*', () => {
    expect(isPathSensitive('~/.ssh/id_ed25519', SENSITIVE_PATTERNS)).toBe(true)
  })

  it('returns true for ~/.ssh/id_rsa', () => {
    expect(isPathSensitive('~/.ssh/id_rsa', SENSITIVE_PATTERNS)).toBe(true)
  })

  it('returns false for ~/.zshrc (not sensitive)', () => {
    expect(isPathSensitive('~/.zshrc', SENSITIVE_PATTERNS)).toBe(false)
  })

  it('returns true for file matching *secret* pattern', () => {
    expect(isPathSensitive('~/.my-secret-file', SENSITIVE_PATTERNS)).toBe(true)
  })

  it('returns true for file matching *token* pattern', () => {
    expect(isPathSensitive('~/.github-token', SENSITIVE_PATTERNS)).toBe(true)
  })

  it('returns true for file matching *password* pattern', () => {
    expect(isPathSensitive('~/.my-password', SENSITIVE_PATTERNS)).toBe(true)
  })

  it('returns true for ~/.netrc', () => {
    expect(isPathSensitive('~/.netrc', SENSITIVE_PATTERNS)).toBe(true)
  })

  it('returns true for ~/.aws/credentials', () => {
    expect(isPathSensitive('~/.aws/credentials', SENSITIVE_PATTERNS)).toBe(true)
  })

  it('returns false for ~/.gitconfig', () => {
    expect(isPathSensitive('~/.gitconfig', SENSITIVE_PATTERNS)).toBe(false)
  })

  it('respects custom patterns', () => {
    expect(isPathSensitive('~/.company-api-key', [...SENSITIVE_PATTERNS, '**/.*api*'])).toBe(true)
    expect(isPathSensitive('~/.company-api-key', SENSITIVE_PATTERNS)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isWSLWindowsPath
// ---------------------------------------------------------------------------
describe('isWSLWindowsPath()', () => {
  it('returns true for /mnt/c/ paths', () => {
    expect(isWSLWindowsPath('/mnt/c/Users/dev/.gitconfig')).toBe(true)
  })

  it('returns true for /mnt/d/ paths', () => {
    expect(isWSLWindowsPath('/mnt/d/Projects/code')).toBe(true)
  })

  it('returns false for Linux home paths', () => {
    expect(isWSLWindowsPath('/home/dev/.gitconfig')).toBe(false)
  })

  it('returns false for tilde paths', () => {
    expect(isWSLWindowsPath('~/.gitconfig')).toBe(false)
  })

  it('returns false for /mnt/ without drive letter', () => {
    expect(isWSLWindowsPath('/mnt/nfs/share')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getDefaultFileList
// ---------------------------------------------------------------------------
describe('getDefaultFileList()', () => {
  it('includes macOS-specific files for macos platform', () => {
    const files = getDefaultFileList('macos')
    const paths = files.map((f) => f.path)
    expect(paths).toContain('~/.Brewfile')
  })

  it('excludes macOS-specific files for linux platform', () => {
    const files = getDefaultFileList('linux')
    const paths = files.map((f) => f.path)
    expect(paths).not.toContain('~/.Brewfile')
  })

  it('includes Linux shell files for linux platform', () => {
    const files = getDefaultFileList('linux')
    const paths = files.map((f) => f.path)
    expect(paths).toContain('~/.bashrc')
  })

  it('includes wsl2-compatible files for wsl2 platform', () => {
    const files = getDefaultFileList('wsl2')
    const paths = files.map((f) => f.path)
    expect(paths).toContain('~/.zshrc')
    expect(paths).toContain('~/.gitconfig')
  })

  it('all returned files have required fields', () => {
    const files = getDefaultFileList('macos')
    for (const f of files) {
      expect(typeof f.path).toBe('string')
      expect(typeof f.category).toBe('string')
      expect(Array.isArray(f.platforms)).toBe(true)
      expect(typeof f.autoEncrypt).toBe('boolean')
      expect(typeof f.description).toBe('string')
    }
  })
})

// ---------------------------------------------------------------------------
// getSensitivePatterns
// ---------------------------------------------------------------------------
describe('getSensitivePatterns()', () => {
  it('returns default SENSITIVE_PATTERNS when no custom patterns set', () => {
    const config = { org: 'acme', awsProfile: 'dev' }
    const patterns = getSensitivePatterns(config)
    expect(patterns).toEqual(SENSITIVE_PATTERNS)
  })

  it('merges custom patterns with defaults', () => {
    const config = { org: 'acme', awsProfile: 'dev', dotfiles: { enabled: true, customSensitivePatterns: ['~/.my-vault'] } }
    const patterns = getSensitivePatterns(config)
    expect(patterns).toContain('~/.my-vault')
    expect(patterns).toContain('~/.netrc') // still has defaults
    expect(patterns.length).toBe(SENSITIVE_PATTERNS.length + 1)
  })

  it('returns defaults when dotfiles config has no customSensitivePatterns', () => {
    const config = { org: 'acme', awsProfile: 'dev', dotfiles: { enabled: true } }
    const patterns = getSensitivePatterns(config)
    expect(patterns).toEqual(SENSITIVE_PATTERNS)
  })
})

// ---------------------------------------------------------------------------
// getChezmoiRemote
// ---------------------------------------------------------------------------
describe('getChezmoiRemote()', () => {
  it('returns URL when remote is configured', async () => {
    exec.mockResolvedValue({ stdout: 'git@github.com:user/dotfiles.git', stderr: '', exitCode: 0 })
    const remote = await getChezmoiRemote()
    expect(remote).toBe('git@github.com:user/dotfiles.git')
    expect(exec).toHaveBeenCalledWith('chezmoi', ['git', '--', 'remote', 'get-url', 'origin'])
  })

  it('returns null when no remote configured', async () => {
    exec.mockResolvedValue({ stdout: '', stderr: 'fatal: no such remote', exitCode: 128 })
    expect(await getChezmoiRemote()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// hasLocalChanges
// ---------------------------------------------------------------------------
describe('hasLocalChanges()', () => {
  it('returns true when there are local changes', async () => {
    exec.mockResolvedValue({ stdout: ' M dot_zshrc\n M dot_gitconfig', stderr: '', exitCode: 0 })
    expect(await hasLocalChanges()).toBe(true)
  })

  it('returns false when working tree is clean', async () => {
    exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    expect(await hasLocalChanges()).toBe(false)
  })

  it('returns false when chezmoi git status fails', async () => {
    exec.mockResolvedValue({ stdout: '', stderr: 'not a git repo', exitCode: 128 })
    expect(await hasLocalChanges()).toBe(false)
  })
})

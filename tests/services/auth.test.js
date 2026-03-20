import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock shell service
vi.mock('../../src/services/shell.js', () => ({
  exec: vi.fn(),
  which: vi.fn(),
  execOrThrow: vi.fn(),
}))

vi.mock('../../src/services/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({ org: 'acme', awsProfile: 'dev', awsRegion: 'eu-west-1' }),
  saveConfig: vi.fn(),
  configExists: vi.fn().mockReturnValue(true),
  CONFIG_PATH: '/tmp/dvmi-test/config.json',
}))

describe('checkGitHubAuth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns authenticated when gh auth status succeeds', async () => {
    const { exec } = await import('../../src/services/shell.js')
    vi.mocked(exec).mockResolvedValue({
      stdout: '',
      stderr: 'Logged in to github.com as testdev (oauth token)',
      exitCode: 0,
    })
    const { checkGitHubAuth } = await import('../../src/services/auth.js')
    const result = await checkGitHubAuth()
    expect(result.authenticated).toBe(true)
    expect(result.username).toBe('testdev')
  })

  it('returns not authenticated when gh auth status fails', async () => {
    const { exec } = await import('../../src/services/shell.js')
    vi.mocked(exec).mockResolvedValue({
      stdout: '',
      stderr: 'You are not logged into any GitHub hosts',
      exitCode: 1,
    })
    const { checkGitHubAuth } = await import('../../src/services/auth.js')
    const result = await checkGitHubAuth()
    expect(result.authenticated).toBe(false)
  })
})

describe('checkAWSAuth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns authenticated with account info on success', async () => {
    const { exec } = await import('../../src/services/shell.js')
    vi.mocked(exec).mockResolvedValue({
      stdout: JSON.stringify({ Account: '123456789012', Arn: 'arn:aws:sts::123456789012:assumed-role/dev/user', UserId: 'X' }),
      stderr: '',
      exitCode: 0,
    })
    const { checkAWSAuth } = await import('../../src/services/auth.js')
    const result = await checkAWSAuth()
    expect(result.authenticated).toBe(true)
    expect(result.account).toBe('123456789012')
    expect(result.role).toBe('user')
  })

  it('returns not authenticated when session expired', async () => {
    const { exec } = await import('../../src/services/shell.js')
    vi.mocked(exec).mockResolvedValue({ stdout: '', stderr: 'ExpiredToken', exitCode: 1 })
    const { checkAWSAuth } = await import('../../src/services/auth.js')
    const result = await checkAWSAuth()
    expect(result.authenticated).toBe(false)
  })
})

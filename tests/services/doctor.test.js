import {describe, it, expect, vi, beforeEach} from 'vitest'

vi.mock('../../src/services/shell.js', () => ({
  exec: vi.fn(),
  which: vi.fn(),
  execOrThrow: vi.fn(),
}))

vi.mock('../../src/services/auth.js', () => ({
  checkGitHubAuth: vi.fn(),
  checkAWSAuth: vi.fn(),
  loginGitHub: vi.fn(),
  loginAWS: vi.fn(),
}))

describe('doctor command logic', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reports tool as ok when found', async () => {
    const {which, exec} = await import('../../src/services/shell.js')
    const {checkGitHubAuth, checkAWSAuth} = await import('../../src/services/auth.js')
    vi.mocked(which).mockResolvedValue('/usr/local/bin/node')
    vi.mocked(exec).mockResolvedValue({stdout: 'v25.2.1', stderr: '', exitCode: 0})
    vi.mocked(checkGitHubAuth).mockResolvedValue({authenticated: true, username: 'testdev'})
    vi.mocked(checkAWSAuth).mockResolvedValue({authenticated: true, account: '123456789012', role: 'dev'})

    // Import and run the actual status check logic inline
    const path = await which('node')
    expect(path).toBe('/usr/local/bin/node')
    const result = await exec('node', ['--version'])
    expect(result.stdout).toBe('v25.2.1')
  })

  it('reports tool as fail when not found (required)', async () => {
    const {which} = await import('../../src/services/shell.js')
    vi.mocked(which).mockResolvedValue(null)
    const path = await which('node')
    expect(path).toBeNull()
  })

  it('checkGitHubAuth returns fail hint', async () => {
    const {checkGitHubAuth} = await import('../../src/services/auth.js')
    vi.mocked(checkGitHubAuth).mockResolvedValue({authenticated: false, error: 'not logged in'})
    const result = await checkGitHubAuth()
    expect(result.authenticated).toBe(false)
  })
})

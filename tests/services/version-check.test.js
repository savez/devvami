import {describe, it, expect, vi, beforeEach} from 'vitest'

vi.mock('../../src/services/config.js', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  configExists: vi.fn().mockReturnValue(true),
  CONFIG_PATH: '/tmp/dvmi-test/config.json',
}))

vi.mock('../../src/services/shell.js', () => ({
  exec: vi.fn(),
  which: vi.fn(),
  execOrThrow: vi.fn(),
}))

describe('checkForUpdate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns hasUpdate true when newer version available', async () => {
    const {loadConfig} = await import('../../src/services/config.js')
    const {exec} = await import('../../src/services/shell.js')

    vi.mocked(loadConfig).mockResolvedValue({
      org: 'acme',
      awsProfile: 'dev',
      awsRegion: 'eu-west-1',
      lastVersionCheck: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    })
    vi.mocked(exec).mockResolvedValue({exitCode: 0, stdout: 'v9.9.9', stderr: ''})

    const {checkForUpdate} = await import('../../src/services/version-check.js')
    const {hasUpdate, latest} = await checkForUpdate({force: true})
    expect(latest).toBe('9.9.9') // il prefisso "v" viene rimosso
    expect(hasUpdate).toBe(true)
  })

  it('uses cached version when check is within 24h', async () => {
    const {loadConfig} = await import('../../src/services/config.js')
    const {exec} = await import('../../src/services/shell.js')
    const {getCurrentVersion} = await import('../../src/services/version-check.js')
    const currentVersion = await getCurrentVersion()

    vi.mocked(loadConfig).mockResolvedValue({
      org: 'acme',
      awsProfile: 'dev',
      awsRegion: 'eu-west-1',
      lastVersionCheck: new Date().toISOString(),
      latestVersion: currentVersion, // stessa versione installata → nessun aggiornamento
    })

    const {checkForUpdate} = await import('../../src/services/version-check.js')
    const {hasUpdate} = await checkForUpdate()
    expect(vi.mocked(exec)).not.toHaveBeenCalled()
    expect(hasUpdate).toBe(false)
  })

  it('returns hasUpdate false when registry unreachable', async () => {
    const {loadConfig} = await import('../../src/services/config.js')
    const {exec} = await import('../../src/services/shell.js')

    vi.mocked(loadConfig).mockResolvedValue({
      org: 'acme',
      awsProfile: 'dev',
      awsRegion: 'eu-west-1',
    })
    vi.mocked(exec).mockRejectedValue(new Error('network error'))

    const {checkForUpdate} = await import('../../src/services/version-check.js')
    const {hasUpdate} = await checkForUpdate({force: true})
    expect(hasUpdate).toBe(false)
  })
})

import {describe, it, expect} from 'vitest'
import {runCli} from '../helpers.js'

describe('dvmi security setup', () => {
  // ---------------------------------------------------------------------------
  // --help
  // ---------------------------------------------------------------------------
  it('--help exits 0 and mentions credential protection', async () => {
    const {stdout, exitCode} = await runCli(['security', 'setup', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout.toLowerCase()).toContain('credential')
  })

  it('--help includes expected flags', async () => {
    const {stdout} = await runCli(['security', 'setup', '--help'])
    expect(stdout).toContain('--help')
    expect(stdout).toContain('--json')
  })

  // ---------------------------------------------------------------------------
  // --json
  // ---------------------------------------------------------------------------
  it('--json exits 0 and returns valid JSON', async () => {
    const {stdout, exitCode} = await runCli(['security', 'setup', '--json'])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data).toHaveProperty('platform')
    expect(data).toHaveProperty('tools')
    expect(data).toHaveProperty('overallStatus')
  })

  it('--json tools array includes entries with required fields', async () => {
    const {stdout} = await runCli(['security', 'setup', '--json'])
    const data = JSON.parse(stdout)
    expect(Array.isArray(data.tools)).toBe(true)
    expect(data.tools.length).toBeGreaterThan(0)
    for (const tool of data.tools) {
      expect(tool).toHaveProperty('id')
      expect(tool).toHaveProperty('displayName')
      expect(tool).toHaveProperty('status')
    }
  })

  it('--json platform field matches a supported platform', async () => {
    const {stdout} = await runCli(['security', 'setup', '--json'])
    const data = JSON.parse(stdout)
    expect(['macos', 'linux', 'wsl2']).toContain(data.platform)
  })

  it('--json overallStatus is one of the expected values', async () => {
    const {stdout} = await runCli(['security', 'setup', '--json'])
    const data = JSON.parse(stdout)
    expect(['success', 'partial', 'not-configured']).toContain(data.overallStatus)
  })

  it('--json selection is null when run as health-check', async () => {
    const {stdout} = await runCli(['security', 'setup', '--json'])
    const data = JSON.parse(stdout)
    expect(data.selection).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // CI=true non-interactive exit
  // ---------------------------------------------------------------------------
  it('CI=true without --json exits non-zero with descriptive error', async () => {
    const {stderr, exitCode} = await runCli(['security', 'setup'], {CI: 'true'})
    expect(exitCode).not.toBe(0)
    expect(stderr.toLowerCase()).toMatch(/interactive|terminal|tty/)
  })

  // ---------------------------------------------------------------------------
  // n/a for non-applicable tools
  // ---------------------------------------------------------------------------
  it('--json tools array marks non-applicable tools as n/a for detected platform', async () => {
    const {stdout} = await runCli(['security', 'setup', '--json'])
    const data = JSON.parse(stdout)
    const platform = data.platform

    if (platform === 'macos') {
      const gcm = data.tools.find((t) => t.id === 'gcm')
      const pass = data.tools.find((t) => t.id === 'pass')
      if (gcm) expect(gcm.status).toBe('n/a')
      if (pass) expect(pass.status).toBe('n/a')
    } else {
      const keychain = data.tools.find((t) => t.id === 'osxkeychain')
      if (keychain) expect(keychain.status).toBe('n/a')
    }
  })
})

import { describe, it, expect } from 'vitest'
import { runCli } from '../helpers.js'

describe('dvmi dotfiles status', () => {
  // ---------------------------------------------------------------------------
  // --help
  // ---------------------------------------------------------------------------
  it('--help exits 0 and mentions dotfiles or status', async () => {
    const { stdout, exitCode } = await runCli(['dotfiles', 'status', '--help'])
    expect(exitCode).toBe(0)
    const lower = stdout.toLowerCase()
    expect(lower.match(/dotfile|status|chezmoi|managed/)).toBeTruthy()
  })

  it('--help includes expected flags', async () => {
    const { stdout } = await runCli(['dotfiles', 'status', '--help'])
    expect(stdout).toContain('--help')
    expect(stdout).toContain('--json')
  })

  it('--help includes examples', async () => {
    const { stdout } = await runCli(['dotfiles', 'status', '--help'])
    expect(stdout).toContain('dotfiles status')
  })

  // ---------------------------------------------------------------------------
  // --json — not-configured state is valid (not an error)
  // ---------------------------------------------------------------------------
  it('--json exits 0 in not-configured state', async () => {
    const { stdout, exitCode } = await runCli(['dotfiles', 'status', '--json'])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data).toHaveProperty('platform')
    expect(data).toHaveProperty('enabled')
    expect(data).toHaveProperty('chezmoiInstalled')
    expect(data).toHaveProperty('encryptionConfigured')
    expect(data).toHaveProperty('files')
    expect(data).toHaveProperty('summary')
  })

  it('--json enabled is boolean', async () => {
    const { stdout } = await runCli(['dotfiles', 'status', '--json'])
    const data = JSON.parse(stdout)
    expect(typeof data.enabled).toBe('boolean')
  })

  it('--json files is an array', async () => {
    const { stdout } = await runCli(['dotfiles', 'status', '--json'])
    const data = JSON.parse(stdout)
    expect(Array.isArray(data.files)).toBe(true)
  })

  it('--json summary has required numeric fields', async () => {
    const { stdout } = await runCli(['dotfiles', 'status', '--json'])
    const data = JSON.parse(stdout)
    expect(typeof data.summary.total).toBe('number')
    expect(typeof data.summary.encrypted).toBe('number')
    expect(typeof data.summary.plaintext).toBe('number')
  })

  it('--json platform is a valid platform string', async () => {
    const { stdout } = await runCli(['dotfiles', 'status', '--json'])
    const data = JSON.parse(stdout)
    expect(['macos', 'linux', 'wsl2']).toContain(data.platform)
  })
})

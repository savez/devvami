import {describe, it, expect} from 'vitest'
import {runCli} from '../helpers.js'

describe('dvmi dotfiles setup', () => {
  // ---------------------------------------------------------------------------
  // --help
  // ---------------------------------------------------------------------------
  it('--help exits 0 and mentions encryption or chezmoi', async () => {
    const {stdout, exitCode} = await runCli(['dotfiles', 'setup', '--help'])
    expect(exitCode).toBe(0)
    const lower = stdout.toLowerCase()
    expect(lower.match(/chezmoi|dotfile|encrypt/)).toBeTruthy()
  })

  it('--help includes expected flags', async () => {
    const {stdout} = await runCli(['dotfiles', 'setup', '--help'])
    expect(stdout).toContain('--help')
    expect(stdout).toContain('--json')
  })

  it('--help includes examples', async () => {
    const {stdout} = await runCli(['dotfiles', 'setup', '--help'])
    expect(stdout).toContain('dotfiles setup')
  })

  // ---------------------------------------------------------------------------
  // --json
  // ---------------------------------------------------------------------------
  it('--json exits 0 and returns valid JSON', async () => {
    const {stdout, exitCode} = await runCli(['dotfiles', 'setup', '--json'])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data).toHaveProperty('platform')
    expect(data).toHaveProperty('chezmoiInstalled')
    expect(data).toHaveProperty('encryptionConfigured')
    expect(data).toHaveProperty('status')
  })

  it('--json platform is a valid platform string', async () => {
    const {stdout} = await runCli(['dotfiles', 'setup', '--json'])
    const data = JSON.parse(stdout)
    expect(['macos', 'linux', 'wsl2']).toContain(data.platform)
  })

  it('--json status is one of the expected values', async () => {
    const {stdout} = await runCli(['dotfiles', 'setup', '--json'])
    const data = JSON.parse(stdout)
    expect(['success', 'skipped', 'failed']).toContain(data.status)
  })

  it('--json chezmoiInstalled is a boolean', async () => {
    const {stdout} = await runCli(['dotfiles', 'setup', '--json'])
    const data = JSON.parse(stdout)
    expect(typeof data.chezmoiInstalled).toBe('boolean')
  })

  it('--json encryptionConfigured is a boolean', async () => {
    const {stdout} = await runCli(['dotfiles', 'setup', '--json'])
    const data = JSON.parse(stdout)
    expect(typeof data.encryptionConfigured).toBe('boolean')
  })

  // ---------------------------------------------------------------------------
  // CI / non-interactive exit
  // ---------------------------------------------------------------------------
  it('CI=true without --json exits non-zero with TTY error', async () => {
    const {stderr, exitCode} = await runCli(['dotfiles', 'setup'], {CI: 'true'})
    expect(exitCode).not.toBe(0)
    expect(stderr.toLowerCase()).toMatch(/interactive|terminal|tty/)
  })
})

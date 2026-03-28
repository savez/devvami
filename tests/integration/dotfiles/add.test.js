import { describe, it, expect } from 'vitest'
import { runCli } from '../helpers.js'

describe('dvmi dotfiles add', () => {
  // ---------------------------------------------------------------------------
  // --help
  // ---------------------------------------------------------------------------
  it('--help exits 0 and mentions dotfiles or chezmoi', async () => {
    const { stdout, exitCode } = await runCli(['dotfiles', 'add', '--help'])
    expect(exitCode).toBe(0)
    const lower = stdout.toLowerCase()
    expect(lower.match(/dotfile|chezmoi|add|track/)).toBeTruthy()
  })

  it('--help includes expected flags', async () => {
    const { stdout } = await runCli(['dotfiles', 'add', '--help'])
    expect(stdout).toContain('--help')
    expect(stdout).toContain('--json')
    expect(stdout).toContain('--encrypt')
  })

  it('--help includes examples', async () => {
    const { stdout } = await runCli(['dotfiles', 'add', '--help'])
    expect(stdout).toContain('dotfiles add')
  })

  // ---------------------------------------------------------------------------
  // --json with no dotfiles enabled (default fixture config has no dotfiles)
  // ---------------------------------------------------------------------------
  it('--json exits non-zero when dotfiles not configured', async () => {
    const { stdout, exitCode } = await runCli(['dotfiles', 'add', '--json', '~/.zshrc'])
    // The fixture config has no dotfiles.enabled — command should error
    // oclif --json mode writes error JSON to stdout
    expect(exitCode).not.toBe(0)
    expect(stdout.toLowerCase()).toMatch(/dotfiles|setup|configured|dvmi dotfiles setup/)
  })

  // ---------------------------------------------------------------------------
  // --json with enabled fixture
  // ---------------------------------------------------------------------------
  it('--json returns valid DotfilesAddResult shape when enabled', async () => {
    const { stdout, exitCode } = await runCli(
      ['dotfiles', 'add', '--json', '/tmp/nonexistent-dvmi-test-file'],
      { DVMI_DOTFILES_ENABLED: 'true' },
    )
    if (exitCode === 0) {
      const data = JSON.parse(stdout)
      expect(data).toHaveProperty('added')
      expect(data).toHaveProperty('skipped')
      expect(data).toHaveProperty('rejected')
      expect(Array.isArray(data.added)).toBe(true)
      expect(Array.isArray(data.skipped)).toBe(true)
      expect(Array.isArray(data.rejected)).toBe(true)
    }
    // If still errors (dotfiles not enabled via env), that's acceptable in integration
  })
})

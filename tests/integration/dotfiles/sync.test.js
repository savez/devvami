import {describe, it, expect} from 'vitest'
import {runCli} from '../helpers.js'

describe('dvmi dotfiles sync', () => {
  // ---------------------------------------------------------------------------
  // --help
  // ---------------------------------------------------------------------------
  it('--help exits 0 and mentions sync or remote', async () => {
    const {stdout, exitCode} = await runCli(['dotfiles', 'sync', '--help'])
    expect(exitCode).toBe(0)
    const lower = stdout.toLowerCase()
    expect(lower.match(/sync|remote|push|pull|dotfile/)).toBeTruthy()
  })

  it('--help includes expected flags', async () => {
    const {stdout} = await runCli(['dotfiles', 'sync', '--help'])
    expect(stdout).toContain('--help')
    expect(stdout).toContain('--json')
    expect(stdout).toContain('--push')
    expect(stdout).toContain('--pull')
    expect(stdout).toContain('--dry-run')
  })

  it('--help includes examples', async () => {
    const {stdout} = await runCli(['dotfiles', 'sync', '--help'])
    expect(stdout).toContain('dotfiles sync')
  })

  // ---------------------------------------------------------------------------
  // --json — errors when dotfiles not configured
  // ---------------------------------------------------------------------------
  it('--json exits non-zero when dotfiles not configured', async () => {
    const {stdout, exitCode} = await runCli(['dotfiles', 'sync', '--json'])
    // oclif --json mode writes error JSON to stdout
    expect(exitCode).not.toBe(0)
    expect(stdout.toLowerCase()).toMatch(/dotfiles|setup|configured|dvmi dotfiles setup/)
  })

  // ---------------------------------------------------------------------------
  // Flag validation
  // ---------------------------------------------------------------------------
  it('--push and --pull together exits non-zero with mutual exclusion error', async () => {
    const {stdout, exitCode} = await runCli(['dotfiles', 'sync', '--push', '--pull', '--json'])
    // oclif --json mode writes error JSON to stdout
    expect(exitCode).not.toBe(0)
    expect(stdout.toLowerCase()).toMatch(/push.*pull|cannot|together|mutually|exclus/)
  })

  // ---------------------------------------------------------------------------
  // CI / non-interactive exit
  // ---------------------------------------------------------------------------
  it('CI=true without --json exits non-zero with TTY error', async () => {
    const {stderr, exitCode} = await runCli(['dotfiles', 'sync'], {CI: 'true'})
    expect(exitCode).not.toBe(0)
    expect(stderr.toLowerCase()).toMatch(/interactive|terminal|tty/)
  })
})

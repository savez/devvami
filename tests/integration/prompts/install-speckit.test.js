import { describe, it, expect } from 'vitest'
import { runCli } from '../helpers.js'

/**
 * Run `dvmi prompts install-speckit` with optional extra args.
 * The fake `uv` and `specify` stubs in tests/fixtures/bin are injected
 * via the PATH manipulation done by runCli(), so no real tools are needed.
 *
 * @param {string[]} extraArgs
 * @param {Record<string, string>} [env]
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
function run(extraArgs = [], env = {}) {
  return runCli(['prompts', 'install-speckit', ...extraArgs], env)
}

describe('dvmi prompts install-speckit', () => {
  it('--help exits 0 and shows usage', async () => {
    const { stdout, exitCode } = await run(['--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('USAGE')
    expect(stdout).toContain('install-speckit')
  })

  it('--help shows --force flag', async () => {
    const { stdout } = await run(['--help'])
    expect(stdout).toContain('--force')
  })

  it('--help shows --ai flag', async () => {
    const { stdout } = await run(['--help'])
    expect(stdout).toContain('--ai')
  })

  it('--help shows --reinstall flag', async () => {
    const { stdout } = await run(['--help'])
    expect(stdout).toContain('--reinstall')
  })

  it('exits non-zero with actionable message when uv is not installed', async () => {
    // Provide a PATH that contains no `uv` binary so isUvInstalled() returns false.
    const { stderr, exitCode } = await run([], { PATH: '/dev/null' })
    expect(exitCode).not.toBe(0)
    const combined = stderr
    expect(combined.toLowerCase()).toContain('uv')
  })

  it('succeeds (exit 0) when uv and specify stubs are in PATH', async () => {
    const { exitCode } = await run()
    expect(exitCode).toBe(0)
  })

  it('passes --force through to specify init', async () => {
    const { stdout, exitCode } = await run(['--force'])
    expect(exitCode).toBe(0)
    // The fake specify stub echoes its args; --force must be forwarded
    expect(stdout).toContain('--force')
  })

  it('passes --ai flag through to specify init', async () => {
    const { stdout, exitCode } = await run(['--ai', 'opencode'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--ai')
    expect(stdout).toContain('opencode')
  })
})

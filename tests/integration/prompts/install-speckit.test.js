import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runCli } from '../helpers.js'

/** @type {string} */
let tmpDir

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'dvmi-speckit-test-'))
})

afterAll(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true })
})

/**
 * Run install-speckit with --dir pointing to our temp directory.
 * @param {string[]} extraArgs
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function run(extraArgs = []) {
  return runCli(['prompts', 'install-speckit', '--dir', tmpDir, ...extraArgs])
}

describe('dvmi prompts install-speckit', () => {
  it('--help exits 0 and shows usage', async () => {
    const { stdout, exitCode } = await runCli(['prompts', 'install-speckit', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('USAGE')
    expect(stdout).toContain('install-speckit')
  })

  it('--help shows --force flag', async () => {
    const { stdout } = await runCli(['prompts', 'install-speckit', '--help'])
    expect(stdout).toContain('--force')
  })

  it('--json installs and returns created array', async () => {
    const { stdout, exitCode } = await run(['--json'])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data).toHaveProperty('created')
    expect(data).toHaveProperty('skipped', false)
    expect(Array.isArray(data.created)).toBe(true)
    expect(data.created.length).toBeGreaterThan(0)
    // All paths should be inside the target directory
    for (const path of data.created) {
      expect(path).toContain('.specify')
    }
  })

  it('--json re-install without --force returns skipped:true', async () => {
    // First install
    await run(['--json'])

    // Second install (should detect existing and skip in --json mode)
    const { stdout, exitCode } = await run(['--json'])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data.skipped).toBe(true)
  })

  it('--json --force re-install overwrites and returns created array', async () => {
    // First install
    await run(['--json'])

    // Force reinstall
    const { stdout, exitCode } = await run(['--force', '--json'])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data.skipped).toBe(false)
    expect(data.created.length).toBeGreaterThan(0)
  })
})

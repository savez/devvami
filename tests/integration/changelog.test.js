import {describe, it, expect} from 'vitest'
import {runCli} from './helpers.js'

describe('dvmi changelog', () => {
  it('--help exits 0', async () => {
    const {stdout, exitCode} = await runCli(['changelog', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('USAGE')
    expect(stdout).toContain('--from')
    expect(stdout).toContain('--output')
  })

  it('--json returns sections object', async () => {
    const {stdout, exitCode} = await runCli(['changelog', '--json'])
    // Works in any git repo
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data).toHaveProperty('sections')
    expect(data.sections).toHaveProperty('feat')
    expect(data.sections).toHaveProperty('fix')
    expect(data.sections).toHaveProperty('chore')
  })
})

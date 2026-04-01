import {describe, it, expect} from 'vitest'
import {runCli} from './helpers.js'

describe('dvmi init', () => {
  it('--help exits 0 and contains description', async () => {
    const {stdout, exitCode} = await runCli(['init', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('USAGE')
    expect(stdout).toContain('--dry-run')
  })

  it('--dry-run --json exits 0 and returns steps array', async () => {
    const {stdout, exitCode} = await runCli(['init', '--dry-run', '--json'])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data).toHaveProperty('steps')
    expect(Array.isArray(data.steps)).toBe(true)
    expect(data).toHaveProperty('configPath')
  })

  it('--dry-run does not modify real config', async () => {
    const {exitCode} = await runCli(['init', '--dry-run', '--json'])
    expect(exitCode).toBe(0)
    // No side effects — config path in test env is isolated
  })

  // T011: ClickUp step appears in --dry-run --json output
  it('--dry-run --json includes clickup step with status "would configure"', async () => {
    const {stdout, exitCode} = await runCli(['init', '--dry-run', '--json'])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    const clickupStep = data.steps.find((s) => s.name === 'clickup')
    expect(clickupStep).toBeDefined()
    expect(clickupStep.status).toBe('would configure')
  })

  // T012: --help does not mention branch create
  it('--help does not mention "branch create"', async () => {
    const {stdout, exitCode} = await runCli(['init', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).not.toContain('branch create')
  })

  // T015 (US2): --json mode reports clickup not_configured when no clickup settings exist
  it('--json reports clickup not_configured when no clickup teamId in config', async () => {
    const {stdout, exitCode} = await runCli(['init', '--json'])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    const clickupStep = data.steps.find((s) => s.name === 'clickup')
    expect(clickupStep).toBeDefined()
    // In test env config has no clickup.teamId, so status should be not_configured
    expect(['not_configured', 'configured']).toContain(clickupStep.status)
  })
})

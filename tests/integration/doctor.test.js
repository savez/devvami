import {describe, it, expect} from 'vitest'
import {runCli} from './helpers.js'

describe('dvmi doctor', () => {
  it('exits 0 and returns checks', async () => {
    const {stdout, exitCode} = await runCli(['doctor', '--json'])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data.checks.length).toBeGreaterThan(0)
    // Each check has required fields
    for (const check of data.checks) {
      expect(check).toHaveProperty('name')
      expect(check).toHaveProperty('status')
      expect(['ok', 'warn', 'fail']).toContain(check.status)
    }
  })

  it('includes Node.js check', async () => {
    const {stdout} = await runCli(['doctor', '--json'])
    const data = JSON.parse(stdout)
    const nodeCheck = data.checks.find((c) => c.name === 'Node.js')
    expect(nodeCheck).toBeDefined()
    expect(nodeCheck.status).toBe('ok') // Node is installed since we're running
  })

  it('summary counts match checks', async () => {
    const {stdout} = await runCli(['doctor', '--json'])
    const data = JSON.parse(stdout)
    const expected = data.checks.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1
      return acc
    }, {})
    expect(data.summary.ok).toBe(expected.ok ?? 0)
    expect(data.summary.warn).toBe(expected.warn ?? 0)
    expect(data.summary.fail).toBe(expected.fail ?? 0)
  })
})

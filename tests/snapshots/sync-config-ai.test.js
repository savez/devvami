import {describe, it, expect} from 'vitest'
import {runCli} from '../integration/helpers.js'

describe('dvmi sync-config-ai snapshots', () => {
  it('--help exits 0 and contains key sections', async () => {
    const {stdout, exitCode} = await runCli(['sync-config-ai', '--help'])
    expect(exitCode).toBe(0)

    // Description section
    expect(stdout.toLowerCase()).toMatch(/sync|ai|config/)

    // Usage section
    expect(stdout.toLowerCase()).toMatch(/usage/)

    // Examples section
    expect(stdout.toLowerCase()).toMatch(/example/)

    expect(stdout).toMatchSnapshot()
  })
})

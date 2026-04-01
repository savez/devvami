import {describe, it, expect} from 'vitest'
import {runCli} from '../integration/helpers.js'

describe('dvmi sync-config-ai snapshots', () => {
  it('--help output matches snapshot', async () => {
    const {stdout, exitCode} = await runCli(['sync-config-ai', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toMatchSnapshot()
  })
})

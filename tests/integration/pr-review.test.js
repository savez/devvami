import {describe, it, expect} from 'vitest'
import {runCli} from './helpers.js'

describe('pr review', () => {
  it('exits non-zero when org is not configured', async () => {
    // DVMI_CONFIG_PATH points to a non-existent file → empty config → non-zero exit
    const {exitCode} = await runCli(['pr', 'review'])
    expect(exitCode).not.toBe(0)
  })
})

describe('pr detail', () => {
  it('exits non-zero when --repo is not in owner/repo format', async () => {
    const {exitCode, stderr} = await runCli(['pr', 'detail', '42', '--repo', 'repo-without-owner'])
    expect(exitCode).not.toBe(0)
    expect(stderr).toContain('owner/repo')
  })

  it('exits non-zero when PR number is missing', async () => {
    const {exitCode} = await runCli(['pr', 'detail'])
    expect(exitCode).not.toBe(0)
  })
})

import {describe, it, expect} from 'vitest'
import {runCli} from './helpers.js'

// AWS-calling tests require real credentials — skip in CI or when no creds are configured
const hasAwsCreds = Boolean(
  process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE || process.env.AWS_VAULT || process.env.AWS_SESSION_TOKEN,
)
const skipAws = Boolean(process.env.CI) || !hasAwsCreds

describe('dvmi costs get', () => {
  it('shows help', async () => {
    const {stdout, exitCode} = await runCli(['costs', 'get', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--group-by')
    expect(stdout).toContain('--tag-key')
    expect(stdout).toContain('--period')
  })

  it('exits 1 with message when --group-by tag but no tag key available', async () => {
    // Fixture config has no projectTags, so without --tag-key this must fail
    const {stderr, exitCode} = await runCli(['costs', 'get', '--group-by', 'tag'])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/No tag key available|tag-key/)
  })

  it('exits 1 with message when --group-by both but no tag key available', async () => {
    const {stderr, exitCode} = await runCli(['costs', 'get', '--group-by', 'both'])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/No tag key available|tag-key/)
  })

  it.skipIf(skipAws)('renders grouped table for --group-by service', async () => {
    const {stdout, exitCode} = await runCli(['costs', 'get', '--group-by', 'service'])
    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/Costs for:|No costs found/)
  })

  it.skipIf(skipAws)('renders tag-grouped table for --group-by tag --tag-key env', async () => {
    const {stdout, exitCode} = await runCli(['costs', 'get', '--group-by', 'tag', '--tag-key', 'env'])
    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/Costs for:|No costs found/)
  })

  it.skipIf(skipAws)('renders service+tag rows for --group-by both --tag-key env', async () => {
    const {stdout, exitCode} = await runCli(['costs', 'get', '--group-by', 'both', '--tag-key', 'env'])
    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/Costs for:|No costs found/)
  })

  it.skipIf(skipAws)('--json output includes groupBy and tagKey fields', async () => {
    const {stdout, exitCode} = await runCli(['costs', 'get', '--group-by', 'tag', '--tag-key', 'env', '--json'])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data).toHaveProperty('groupBy', 'tag')
    expect(data).toHaveProperty('tagKey', 'env')
    expect(data).toHaveProperty('items')
    expect(Array.isArray(data.items)).toBe(true)
  })
})

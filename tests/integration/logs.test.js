import {describe, it, expect} from 'vitest'
import {runCli} from './helpers.js'

// AWS-calling tests require real credentials — skip in CI or when no creds are configured
const hasAwsCreds = Boolean(
  process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE || process.env.AWS_VAULT || process.env.AWS_SESSION_TOKEN,
)
const skipAws = Boolean(process.env.CI) || !hasAwsCreds

describe('dvmi logs', () => {
  it('shows help', async () => {
    const {stdout, exitCode} = await runCli(['logs', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--group')
    expect(stdout).toContain('--filter')
    expect(stdout).toContain('--since')
    expect(stdout).toContain('--limit')
    expect(stdout).toContain('--region')
  })

  it('exits 1 for --limit 0', async () => {
    const {stderr, exitCode} = await runCli(['logs', '--group', '/aws/lambda/fn', '--limit', '0'])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/--limit must be between 1 and 10000/)
  })

  it('exits 1 for --limit 99999', async () => {
    const {stderr, exitCode} = await runCli(['logs', '--group', '/aws/lambda/fn', '--limit', '99999'])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/--limit must be between 1 and 10000/)
  })

  it('exits 1 for invalid --since value', async () => {
    const {stderr, exitCode} = await runCli(['logs', '--group', '/aws/lambda/fn', '--since', '2d'])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/--since must be one of: 1h, 24h, 7d/)
  })

  it.skipIf(skipAws)('renders event table for a valid log group', async () => {
    const {stdout, exitCode} = await runCli(['logs', '--group', '/aws/lambda/fn'])
    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/Log Group:|No log groups found/)
  })

  it.skipIf(skipAws)('--json outputs NDJSON to stdout', async () => {
    const {stdout, exitCode} = await runCli(['logs', '--group', '/aws/lambda/fn', '--json'])
    expect(exitCode).toBe(0)
    // Each line should be parseable JSON or empty
    for (const line of stdout.split('\n').filter(Boolean)) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
  })

  it.skipIf(skipAws)('--limit 5 shows truncation notice when events fill the limit', async () => {
    const {stdout} = await runCli(['logs', '--group', '/aws/lambda/fn', '--limit', '5'])
    // If 5 events returned, truncation notice should appear (or 0 events)
    expect(stdout).toMatch(/events shown|No log groups found/)
  })

  it.skipIf(skipAws)('--since 7d uses correct time window', async () => {
    const {exitCode} = await runCli(['logs', '--group', '/aws/lambda/fn', '--since', '7d'])
    // Should exit cleanly (0 or 1 for not found, never 2)
    expect(exitCode).not.toBe(2)
  })

  it.skipIf(skipAws)('exits with error for non-existent group', async () => {
    const {stderr, exitCode} = await runCli(['logs', '--group', '/not/found/group/xyz'])
    expect(exitCode).toBeGreaterThan(0)
    expect(stderr).toMatch(/Log group not found|Access denied|No AWS credentials/)
  })
})

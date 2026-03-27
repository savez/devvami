import { describe, it, expect } from 'vitest'
import { runCli } from './helpers.js'

// AWS-calling tests require real credentials — skip in CI or when no creds are configured
const hasAwsCreds = Boolean(
  process.env.AWS_ACCESS_KEY_ID ||
  process.env.AWS_PROFILE ||
  process.env.AWS_VAULT ||
  process.env.AWS_SESSION_TOKEN,
)
const skipAws = Boolean(process.env.CI) || !hasAwsCreds

describe('dvmi costs trend', () => {
  it('shows help', async () => {
    const { stdout, exitCode } = await runCli(['costs', 'trend', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--group-by')
    expect(stdout).toContain('--tag-key')
    expect(stdout).toContain('--line')
  })

  it('exits 1 with message when --group-by tag but no tag key available', async () => {
    const { stderr, exitCode } = await runCli(['costs', 'trend', '--group-by', 'tag'])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/No tag key available|tag-key/)
  })

  it.skipIf(skipAws)('renders a bar chart by default', async () => {
    const { stdout, exitCode } = await runCli(['costs', 'trend'])
    expect(exitCode).toBe(0)
    // Title must appear
    expect(stdout).toMatch(/AWS Cost Trend|No cost data found/)
  })

  it.skipIf(skipAws)('renders a line chart with --line flag', async () => {
    const { stdout, exitCode } = await runCli(['costs', 'trend', '--line'])
    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/AWS Cost Trend|No cost data found/)
  })

  it.skipIf(skipAws)('--json outputs valid JSON with series array', async () => {
    const { stdout, exitCode } = await runCli(['costs', 'trend', '--json'])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data).toHaveProperty('groupBy')
    expect(data).toHaveProperty('period')
    expect(data).toHaveProperty('series')
    expect(Array.isArray(data.series)).toBe(true)
  })

  it.skipIf(skipAws)('--group-by tag --tag-key env renders multi-series chart', async () => {
    const { stdout, exitCode } = await runCli([
      'costs', 'trend', '--group-by', 'tag', '--tag-key', 'env',
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/AWS Cost Trend|No cost data found/)
  })
})

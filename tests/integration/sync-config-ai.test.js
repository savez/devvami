import {describe, it, expect} from 'vitest'
import {runCli, runCliJson} from './helpers.js'

describe('dvmi sync-config-ai', () => {
  // T023: --help exits 0 and mentions AI/config/sync
  it('--help exits 0 and mentions AI environments or config', async () => {
    const {stdout, exitCode} = await runCli(['sync-config-ai', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout.toLowerCase()).toMatch(/ai|config|sync|environment/)
  })

  // T047: --json exits 0 and outputs valid JSON with environments and categories
  it('--json exits 0 and outputs valid JSON with environments and categories keys', async () => {
    const result = await runCliJson(['sync-config-ai'])
    expect(result).toHaveProperty('environments')
    expect(result).toHaveProperty('categories')
    expect(Array.isArray(result.environments)).toBe(true)
    expect(result.categories).toHaveProperty('mcp')
    expect(result.categories).toHaveProperty('command')
    expect(result.categories).toHaveProperty('skill')
    expect(result.categories).toHaveProperty('agent')
    expect(Array.isArray(result.categories.mcp)).toBe(true)
    expect(Array.isArray(result.categories.command)).toBe(true)
  })
})

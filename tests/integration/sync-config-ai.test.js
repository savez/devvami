import {describe, it, expect} from 'vitest'
import {runCli, runCliJson} from './helpers.js'

describe('dvmi sync-config-ai', () => {
  // T023: --help exits 0 and mentions AI/config/sync
  it('--help exits 0 and mentions AI environments or config', async () => {
    const {stdout, exitCode} = await runCli(['sync-config-ai', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout.toLowerCase()).toMatch(/ai|config|sync|environment/)
  })

  // T023: --json exits 0 and outputs complete structured JSON per cli-schema.md
  it('--json exits 0 and outputs valid JSON with environments, categories (5 types), and nativeEntries', async () => {
    const result = await runCliJson(['sync-config-ai'])
    // Top-level keys
    expect(result).toHaveProperty('environments')
    expect(result).toHaveProperty('categories')
    expect(result).toHaveProperty('nativeEntries')
    // Environments is an array
    expect(Array.isArray(result.environments)).toBe(true)
    // Categories has all 5 types (including rule)
    expect(result.categories).toHaveProperty('mcp')
    expect(result.categories).toHaveProperty('command')
    expect(result.categories).toHaveProperty('rule')
    expect(result.categories).toHaveProperty('skill')
    expect(result.categories).toHaveProperty('agent')
    for (const type of ['mcp', 'command', 'rule', 'skill', 'agent']) {
      expect(Array.isArray(result.categories[type])).toBe(true)
      // Each managed entry has a drifted boolean
      for (const entry of result.categories[type]) {
        expect(typeof entry.drifted).toBe('boolean')
      }
    }
    // nativeEntries has all 5 types
    expect(result.nativeEntries).toHaveProperty('mcp')
    expect(result.nativeEntries).toHaveProperty('command')
    expect(result.nativeEntries).toHaveProperty('rule')
    expect(result.nativeEntries).toHaveProperty('skill')
    expect(result.nativeEntries).toHaveProperty('agent')
    for (const type of ['mcp', 'command', 'rule', 'skill', 'agent']) {
      expect(Array.isArray(result.nativeEntries[type])).toBe(true)
    }
  })
})

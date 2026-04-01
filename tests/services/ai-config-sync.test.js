/**
 * Service-level integration test: full AI config sync flow.
 *
 * Creates a real temp directory, seeds fixture files to make a claude-code
 * environment detectable, then exercises the full create → deploy → deactivate
 * → undeploy → activate → redeploy lifecycle using the real store and deployer.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {readFile, mkdir, writeFile, rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {randomUUID} from 'node:crypto'

import {scanEnvironments} from '../../src/services/ai-env-scanner.js'
import {
  loadAIConfig,
  addEntry,
  deactivateEntry,
  activateEntry,
  deleteEntry,
} from '../../src/services/ai-config-store.js'
import {deployEntry, undeployEntry} from '../../src/services/ai-env-deployer.js'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeTmpDir() {
  return join(tmpdir(), `dvmi-sync-test-${Date.now()}-${randomUUID().slice(0, 8)}`)
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

// ──────────────────────────────────────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────────────────────────────────────

describe('AI config sync — full flow', () => {
  let tmpDir
  let configPath
  let originalEnv

  beforeEach(async () => {
    tmpDir = makeTmpDir()
    configPath = join(tmpDir, 'ai-config.json')
    await mkdir(tmpDir, {recursive: true})

    // Seed CLAUDE.md so claude-code environment is detected
    await writeFile(join(tmpDir, 'CLAUDE.md'), '# Test project\n', 'utf8')

    // Override the store path via env var
    originalEnv = process.env.DVMI_AI_CONFIG_PATH
    process.env.DVMI_AI_CONFIG_PATH = configPath
  })

  afterEach(async () => {
    process.env.DVMI_AI_CONFIG_PATH = originalEnv
    await rm(tmpDir, {recursive: true, force: true})
  })

  it('detects claude-code environment after seeding CLAUDE.md', () => {
    const envs = scanEnvironments(tmpDir)
    const claudeEnv = envs.find((e) => e.id === 'claude-code')
    expect(claudeEnv).toBeDefined()
    expect(claudeEnv.detected).toBe(true)
  })

  it('create → deploy: writes MCP entry to .mcp.json', async () => {
    const detectedEnvs = scanEnvironments(tmpDir)

    const entry = await addEntry({
      name: 'my-test-server',
      type: 'mcp',
      environments: ['claude-code'],
      params: {transport: 'stdio', command: 'npx', args: ['-y', 'my-test-pkg'], env: {}},
    })

    expect(entry.id).toBeTruthy()
    expect(entry.active).toBe(true)
    expect(entry.name).toBe('my-test-server')

    await deployEntry(entry, detectedEnvs, tmpDir)

    const mcpJson = join(tmpDir, '.mcp.json')
    expect(existsSync(mcpJson)).toBe(true)

    const parsed = await readJson(mcpJson)
    expect(parsed.mcpServers?.['my-test-server']).toBeDefined()
    expect(parsed.mcpServers['my-test-server'].command).toBe('npx')
    expect(parsed.mcpServers['my-test-server'].args).toEqual(['-y', 'my-test-pkg'])
  })

  it('deactivate → undeploy: removes entry from .mcp.json', async () => {
    const detectedEnvs = scanEnvironments(tmpDir)

    const entry = await addEntry({
      name: 'removable-server',
      type: 'mcp',
      environments: ['claude-code'],
      params: {transport: 'stdio', command: 'node', args: ['server.js'], env: {}},
    })

    await deployEntry(entry, detectedEnvs, tmpDir)

    // Verify deployed
    const mcpJson = join(tmpDir, '.mcp.json')
    const before = await readJson(mcpJson)
    expect(before.mcpServers?.['removable-server']).toBeDefined()

    // Deactivate
    const deactivated = await deactivateEntry(entry.id)
    expect(deactivated.active).toBe(false)

    // Undeploy
    await undeployEntry(deactivated, detectedEnvs, tmpDir)

    // Verify removed
    const after = await readJson(mcpJson)
    expect(after.mcpServers?.['removable-server']).toBeUndefined()
  })

  it('activate → redeploy: restores entry in .mcp.json', async () => {
    const detectedEnvs = scanEnvironments(tmpDir)

    const entry = await addEntry({
      name: 'restorable-server',
      type: 'mcp',
      environments: ['claude-code'],
      params: {transport: 'stdio', command: 'python', args: ['-m', 'srv'], env: {}},
    })

    // Deploy → undeploy → redeploy
    await deployEntry(entry, detectedEnvs, tmpDir)

    const deactivated = await deactivateEntry(entry.id)
    await undeployEntry(deactivated, detectedEnvs, tmpDir)

    const mcpJson = join(tmpDir, '.mcp.json')
    const afterUndeploy = await readJson(mcpJson)
    expect(afterUndeploy.mcpServers?.['restorable-server']).toBeUndefined()

    // Re-activate
    const reactivated = await activateEntry(entry.id)
    expect(reactivated.active).toBe(true)

    // Redeploy
    await deployEntry(reactivated, detectedEnvs, tmpDir)

    const afterRedeploy = await readJson(mcpJson)
    expect(afterRedeploy.mcpServers?.['restorable-server']).toBeDefined()
    expect(afterRedeploy.mcpServers['restorable-server'].command).toBe('python')
  })

  it('delete → undeploy: permanently removes entry from store and filesystem', async () => {
    const detectedEnvs = scanEnvironments(tmpDir)

    const entry = await addEntry({
      name: 'deletable-server',
      type: 'mcp',
      environments: ['claude-code'],
      params: {transport: 'stdio', command: 'deno', args: ['run', 'server.ts'], env: {}},
    })

    await deployEntry(entry, detectedEnvs, tmpDir)

    const mcpJson = join(tmpDir, '.mcp.json')
    const before = await readJson(mcpJson)
    expect(before.mcpServers?.['deletable-server']).toBeDefined()

    // Undeploy first (simulating delete flow in the command)
    await undeployEntry(entry, detectedEnvs, tmpDir)
    await deleteEntry(entry.id)

    // Entry removed from .mcp.json
    const after = await readJson(mcpJson)
    expect(after.mcpServers?.['deletable-server']).toBeUndefined()

    // Entry removed from store
    const store = await loadAIConfig()
    const found = store.entries.find((e) => e.id === entry.id)
    expect(found).toBeUndefined()
  })

  it('deploy command entry: writes markdown file to .claude/commands/', async () => {
    const detectedEnvs = scanEnvironments(tmpDir)

    const entry = await addEntry({
      name: 'my-command',
      type: 'command',
      environments: ['claude-code'],
      params: {
        description: 'A test command',
        content: 'Do something useful.',
      },
    })

    await deployEntry(entry, detectedEnvs, tmpDir)

    const cmdFile = join(tmpDir, '.claude', 'commands', 'my-command.md')
    expect(existsSync(cmdFile)).toBe(true)

    const content = await readFile(cmdFile, 'utf8')
    // deployer writes params.content directly (not the description)
    expect(content).toContain('Do something useful.')
  })

  it('undeploy command entry: removes the markdown file', async () => {
    const detectedEnvs = scanEnvironments(tmpDir)

    const entry = await addEntry({
      name: 'removable-command',
      type: 'command',
      environments: ['claude-code'],
      params: {description: 'Temp command', content: 'Content here.'},
    })

    await deployEntry(entry, detectedEnvs, tmpDir)

    const cmdFile = join(tmpDir, '.claude', 'commands', 'removable-command.md')
    expect(existsSync(cmdFile)).toBe(true)

    const deactivated = await deactivateEntry(entry.id)
    await undeployEntry(deactivated, detectedEnvs, tmpDir)

    expect(existsSync(cmdFile)).toBe(false)
  })

  it('store persists multiple entries across reloads', async () => {
    await addEntry({
      name: 'server-a',
      type: 'mcp',
      environments: ['claude-code'],
      params: {transport: 'stdio', command: 'node', args: ['a.js'], env: {}},
    })

    await addEntry({
      name: 'server-b',
      type: 'mcp',
      environments: ['claude-code'],
      params: {transport: 'stdio', command: 'node', args: ['b.js'], env: {}},
    })

    const store = await loadAIConfig()
    expect(store.entries).toHaveLength(2)
    expect(store.entries.map((e) => e.name)).toContain('server-a')
    expect(store.entries.map((e) => e.name)).toContain('server-b')
  })
})

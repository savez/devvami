/**
 * Service-level integration test: full AI config sync flow (T024).
 *
 * Covers:
 *  1. Full scan → detect → deploy flow with a seeded .mcp.json
 *  2. Import native: parseNativeEntries returns correct type/name/environmentId
 *  3. Modify and deploy: addEntry + deployEntry updates the file on disk
 *  4. Drift detection: manual file edit triggers detectDrift
 *  5. Re-deploy: deployEntry restores the expected state after drift
 *
 * Also retains the original create → deploy → deactivate → undeploy →
 * activate → redeploy lifecycle tests from the initial integration suite.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {readFile, mkdir, writeFile, rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {randomUUID} from 'node:crypto'

import {scanEnvironments, parseNativeEntries, detectDrift, ENVIRONMENTS} from '../../src/services/ai-env-scanner.js'
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
// T024-1: Full scan → detect → deploy with seeded .mcp.json
// ──────────────────────────────────────────────────────────────────────────────

describe('T024-1: scan → detect → deploy flow with .mcp.json', () => {
  let tmpDir
  let configPath
  let originalEnv

  beforeEach(async () => {
    tmpDir = makeTmpDir()
    configPath = join(tmpDir, 'ai-config.json')
    await mkdir(tmpDir, {recursive: true})

    // Seed a .mcp.json in claude-code format so the environment is detectable
    await writeFile(
      join(tmpDir, '.mcp.json'),
      JSON.stringify({mcpServers: {}}),
      'utf8',
    )

    originalEnv = process.env.DVMI_AI_CONFIG_PATH
    process.env.DVMI_AI_CONFIG_PATH = configPath
  })

  afterEach(async () => {
    process.env.DVMI_AI_CONFIG_PATH = originalEnv
    await rm(tmpDir, {recursive: true, force: true})
  })

  it('detects claude-code when .mcp.json is present', () => {
    const envs = scanEnvironments(tmpDir)
    const claudeEnv = envs.find((e) => e.id === 'claude-code')
    expect(claudeEnv).toBeDefined()
    expect(claudeEnv.detected).toBe(true)
  })

  it('scan → detect → deploy writes new server into existing .mcp.json', async () => {
    const detectedEnvs = scanEnvironments(tmpDir)
    const claudeEnv = detectedEnvs.find((e) => e.id === 'claude-code')
    expect(claudeEnv).toBeDefined()

    const entry = await addEntry({
      name: 'scan-deploy-server',
      type: 'mcp',
      environments: ['claude-code'],
      params: {transport: 'stdio', command: 'node', args: ['index.js']},
    })

    await deployEntry(entry, detectedEnvs, tmpDir)

    const mcpJson = join(tmpDir, '.mcp.json')
    expect(existsSync(mcpJson)).toBe(true)

    const parsed = await readJson(mcpJson)
    expect(parsed.mcpServers?.['scan-deploy-server']).toBeDefined()
    expect(parsed.mcpServers['scan-deploy-server'].command).toBe('node')
    expect(parsed.mcpServers['scan-deploy-server'].args).toEqual(['index.js'])
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// T024-2: Import native entries
// ──────────────────────────────────────────────────────────────────────────────

describe('T024-2: parseNativeEntries — import native MCP entries', () => {
  let tmpDir

  beforeEach(async () => {
    tmpDir = makeTmpDir()
    await mkdir(tmpDir, {recursive: true})
  })

  afterEach(async () => {
    await rm(tmpDir, {recursive: true, force: true})
  })

  it('returns native MCP entries from .mcp.json that are not managed', async () => {
    // Seed a .mcp.json with two unmanaged servers
    await writeFile(
      join(tmpDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'native-server-a': {command: 'npx', args: ['-y', 'pkg-a']},
          'native-server-b': {command: 'node', args: ['server.js']},
        },
      }),
      'utf8',
    )

    const claudeCodeDef = ENVIRONMENTS.find((e) => e.id === 'claude-code')
    expect(claudeCodeDef).toBeDefined()

    // No managed entries — all should be returned as native
    const natives = parseNativeEntries(claudeCodeDef, tmpDir, [])

    const mcpNatives = natives.filter((n) => n.type === 'mcp')
    expect(mcpNatives.length).toBeGreaterThanOrEqual(2)

    const serverA = mcpNatives.find((n) => n.name === 'native-server-a')
    expect(serverA).toBeDefined()
    expect(serverA.type).toBe('mcp')
    expect(serverA.environmentId).toBe('claude-code')

    const serverB = mcpNatives.find((n) => n.name === 'native-server-b')
    expect(serverB).toBeDefined()
    expect(serverB.type).toBe('mcp')
    expect(serverB.environmentId).toBe('claude-code')
  })

  it('excludes managed entries from native results', async () => {
    await writeFile(
      join(tmpDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'managed-server': {command: 'node', args: ['managed.js']},
          'unmanaged-server': {command: 'node', args: ['free.js']},
        },
      }),
      'utf8',
    )

    const claudeCodeDef = ENVIRONMENTS.find((e) => e.id === 'claude-code')

    // Simulate one managed entry
    const managedEntries = [
      {
        id: randomUUID(),
        name: 'managed-server',
        type: 'mcp',
        active: true,
        environments: ['claude-code'],
        params: {transport: 'stdio', command: 'node', args: ['managed.js']},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]

    const natives = parseNativeEntries(claudeCodeDef, tmpDir, managedEntries)
    const mcpNatives = natives.filter((n) => n.type === 'mcp')

    expect(mcpNatives.find((n) => n.name === 'managed-server')).toBeUndefined()
    expect(mcpNatives.find((n) => n.name === 'unmanaged-server')).toBeDefined()
  })

  it('returns native rule entry from CLAUDE.md', async () => {
    await writeFile(join(tmpDir, 'CLAUDE.md'), '# Project rules\n', 'utf8')

    const claudeCodeDef = ENVIRONMENTS.find((e) => e.id === 'claude-code')
    const natives = parseNativeEntries(claudeCodeDef, tmpDir, [])

    const ruleEntry = natives.find((n) => n.name === 'CLAUDE' && n.type === 'rule')
    expect(ruleEntry).toBeDefined()
    expect(ruleEntry.environmentId).toBe('claude-code')
    expect(ruleEntry.level).toBe('project')
  })

  it('returns native command entries from .claude/commands/', async () => {
    const commandsDir = join(tmpDir, '.claude', 'commands')
    await mkdir(commandsDir, {recursive: true})
    await writeFile(join(commandsDir, 'my-cmd.md'), '# My command\n', 'utf8')
    await writeFile(join(commandsDir, 'another-cmd.md'), '# Another\n', 'utf8')

    const claudeCodeDef = ENVIRONMENTS.find((e) => e.id === 'claude-code')
    const natives = parseNativeEntries(claudeCodeDef, tmpDir, [])

    const commandNatives = natives.filter((n) => n.type === 'command')
    expect(commandNatives.length).toBeGreaterThanOrEqual(2)

    const myCmd = commandNatives.find((n) => n.name === 'my-cmd')
    expect(myCmd).toBeDefined()
    expect(myCmd.environmentId).toBe('claude-code')
    expect(myCmd.type).toBe('command')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// T024-3 / T024-4 / T024-5: Modify → deploy → drift detect → re-deploy
// ──────────────────────────────────────────────────────────────────────────────

describe('T024-3-5: modify → deploy → drift → re-deploy', () => {
  let tmpDir
  let configPath
  let originalEnv

  beforeEach(async () => {
    tmpDir = makeTmpDir()
    configPath = join(tmpDir, 'ai-config.json')
    await mkdir(tmpDir, {recursive: true})

    // Seed CLAUDE.md so claude-code is detected
    await writeFile(join(tmpDir, 'CLAUDE.md'), '# Test project\n', 'utf8')

    originalEnv = process.env.DVMI_AI_CONFIG_PATH
    process.env.DVMI_AI_CONFIG_PATH = configPath
  })

  afterEach(async () => {
    process.env.DVMI_AI_CONFIG_PATH = originalEnv
    await rm(tmpDir, {recursive: true, force: true})
  })

  it('T024-3: addEntry → deployEntry writes the entry to .mcp.json', async () => {
    const detectedEnvs = scanEnvironments(tmpDir)

    const entry = await addEntry({
      name: 'modify-deploy-server',
      type: 'mcp',
      environments: ['claude-code'],
      params: {transport: 'stdio', command: 'npx', args: ['-y', 'test-pkg'], env: {MY_VAR: 'hello'}},
    })

    expect(entry.name).toBe('modify-deploy-server')
    expect(entry.active).toBe(true)

    await deployEntry(entry, detectedEnvs, tmpDir)

    const mcpJson = join(tmpDir, '.mcp.json')
    expect(existsSync(mcpJson)).toBe(true)

    const parsed = await readJson(mcpJson)
    const server = parsed.mcpServers?.['modify-deploy-server']
    expect(server).toBeDefined()
    expect(server.command).toBe('npx')
    expect(server.args).toEqual(['-y', 'test-pkg'])
    expect(server.env).toEqual({MY_VAR: 'hello'})
  })

  it('T024-4: drift is detected after manually modifying the deployed file', async () => {
    const detectedEnvs = scanEnvironments(tmpDir)

    const entry = await addEntry({
      name: 'drifting-server',
      type: 'mcp',
      environments: ['claude-code'],
      params: {transport: 'stdio', command: 'node', args: ['original.js']},
    })

    await deployEntry(entry, detectedEnvs, tmpDir)

    // Manually tamper with the deployed file to introduce drift
    const mcpJsonPath = join(tmpDir, '.mcp.json')
    const deployed = await readJson(mcpJsonPath)
    deployed.mcpServers['drifting-server'].command = 'deno'
    deployed.mcpServers['drifting-server'].args = ['tampered.ts']
    await writeFile(mcpJsonPath, JSON.stringify(deployed, null, 2), 'utf8')

    // Reload store to get the managed entries
    const store = await loadAIConfig(configPath)

    const drifts = detectDrift(detectedEnvs, store.entries, tmpDir)

    const drift = drifts.find((d) => d.entryId === entry.id)
    expect(drift).toBeDefined()
    expect(drift.environmentId).toBe('claude-code')
    expect(drift.expected.command).toBe('node')
    expect(drift.actual.command).toBe('deno')
  })

  it('T024-5: re-deploying after drift restores the expected state', async () => {
    const detectedEnvs = scanEnvironments(tmpDir)

    const entry = await addEntry({
      name: 'redeploy-after-drift',
      type: 'mcp',
      environments: ['claude-code'],
      params: {transport: 'stdio', command: 'python', args: ['-m', 'srv']},
    })

    await deployEntry(entry, detectedEnvs, tmpDir)

    // Introduce drift
    const mcpJsonPath = join(tmpDir, '.mcp.json')
    const deployed = await readJson(mcpJsonPath)
    deployed.mcpServers['redeploy-after-drift'].command = 'ruby'
    await writeFile(mcpJsonPath, JSON.stringify(deployed, null, 2), 'utf8')

    // Confirm drift
    const store = await loadAIConfig(configPath)
    const driftsBefore = detectDrift(detectedEnvs, store.entries, tmpDir)
    expect(driftsBefore.find((d) => d.entryId === entry.id)).toBeDefined()

    // Re-deploy to fix drift
    await deployEntry(entry, detectedEnvs, tmpDir)

    // Verify the file now matches expected state
    const restored = await readJson(mcpJsonPath)
    const server = restored.mcpServers?.['redeploy-after-drift']
    expect(server).toBeDefined()
    expect(server.command).toBe('python')
    expect(server.args).toEqual(['-m', 'srv'])

    // Drift should be gone
    const driftsAfter = detectDrift(detectedEnvs, store.entries, tmpDir)
    expect(driftsAfter.find((d) => d.entryId === entry.id)).toBeUndefined()
  })

  it('drift detection for file-based entries (command) works correctly', async () => {
    const detectedEnvs = scanEnvironments(tmpDir)

    const entry = await addEntry({
      name: 'drift-cmd',
      type: 'command',
      environments: ['claude-code'],
      params: {description: 'A driftable command', content: 'Original content.'},
    })

    await deployEntry(entry, detectedEnvs, tmpDir)

    const cmdFile = join(tmpDir, '.claude', 'commands', 'drift-cmd.md')
    expect(existsSync(cmdFile)).toBe(true)

    // Introduce drift by changing the file content
    await writeFile(cmdFile, 'Tampered content.', 'utf8')

    const store = await loadAIConfig(configPath)
    const drifts = detectDrift(detectedEnvs, store.entries, tmpDir)

    const drift = drifts.find((d) => d.entryId === entry.id)
    expect(drift).toBeDefined()
    expect(drift.expected.content).toBe('Original content.')
    expect(drift.actual.content).toBe('Tampered content.')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Original lifecycle tests (retained from initial integration suite)
// ──────────────────────────────────────────────────────────────────────────────

describe('AI config sync — full lifecycle', () => {
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

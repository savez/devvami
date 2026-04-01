import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {readFile, mkdir, writeFile, rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {randomUUID} from 'node:crypto'

import {
  deployMCPEntry,
  undeployMCPEntry,
  deployFileEntry,
  undeployFileEntry,
  deployEntry,
  undeployEntry,
  reconcileOnScan,
} from '../../../src/services/ai-env-deployer.js'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Create a unique temporary directory per test.
 * @returns {string}
 */
function makeTmpDir() {
  return join(tmpdir(), `dvmi-deployer-test-${Date.now()}-${randomUUID().slice(0, 8)}`)
}

/**
 * Read and parse a JSON file from disk.
 * @param {string} filePath
 * @returns {Promise<Record<string, unknown>>}
 */
async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

/**
 * Build a minimal CategoryEntry for MCP type.
 * @param {Partial<import('../../../src/types.js').CategoryEntry>} [overrides]
 * @returns {import('../../../src/types.js').CategoryEntry}
 */
function makeMCPEntry(overrides = {}) {
  return {
    id: randomUUID(),
    name: 'test-server',
    type: 'mcp',
    active: true,
    environments: ['claude-code'],
    params: {transport: 'stdio', command: 'npx', args: ['-y', 'test-pkg'], env: {}},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Build a minimal CategoryEntry for command type.
 * @param {Partial<import('../../../src/types.js').CategoryEntry>} [overrides]
 * @returns {import('../../../src/types.js').CategoryEntry}
 */
function makeCommandEntry(overrides = {}) {
  return {
    id: randomUUID(),
    name: 'my-command',
    type: 'command',
    active: true,
    environments: ['claude-code'],
    params: {content: '# My Command\nDo something useful.', description: 'A test command'},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Build a minimal DetectedEnvironment stub.
 * @param {import('../../../src/types.js').EnvironmentId} id
 * @param {string[]} [unreadable]
 * @returns {import('../../../src/types.js').DetectedEnvironment}
 */
function makeDetected(id, unreadable = []) {
  return {
    id,
    name: id,
    detected: true,
    projectPaths: [],
    globalPaths: [],
    unreadable,
    supportedCategories: ['mcp', 'command', 'skill', 'agent'],
    counts: {mcp: 0, command: 0, skill: 0, agent: 0},
    scope: 'project',
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Test lifecycle
// ──────────────────────────────────────────────────────────────────────────────

let cwd

beforeEach(async () => {
  cwd = makeTmpDir()
  await mkdir(cwd, {recursive: true})
})

afterEach(async () => {
  if (existsSync(cwd)) {
    await rm(cwd, {recursive: true, force: true})
  }
})

// ──────────────────────────────────────────────────────────────────────────────
// deployMCPEntry
// ──────────────────────────────────────────────────────────────────────────────

describe('deployMCPEntry', () => {
  it('creates a new JSON file with the mcpServers entry when file does not exist', async () => {
    const entry = makeMCPEntry({name: 'my-mcp', environments: ['claude-code']})

    await deployMCPEntry(entry, 'claude-code', cwd)

    const filePath = join(cwd, '.mcp.json')
    expect(existsSync(filePath)).toBe(true)

    const json = await readJson(filePath)
    expect(json).toHaveProperty('mcpServers')
    expect(json.mcpServers).toHaveProperty('my-mcp')
    expect(json.mcpServers['my-mcp']).toMatchObject({command: 'npx'})
  })

  it('merges into an existing JSON file, preserving other entries', async () => {
    const filePath = join(cwd, '.mcp.json')
    const existing = {
      mcpServers: {
        'existing-server': {command: 'node', args: ['server.js'], env: {}},
      },
    }
    await mkdir(join(cwd), {recursive: true})
    await writeFile(filePath, JSON.stringify(existing), 'utf8')

    const entry = makeMCPEntry({name: 'new-server', environments: ['claude-code']})
    await deployMCPEntry(entry, 'claude-code', cwd)

    const json = await readJson(filePath)
    expect(json.mcpServers).toHaveProperty('existing-server')
    expect(json.mcpServers).toHaveProperty('new-server')
  })

  it('handles vscode-copilot: writes to .vscode/mcp.json with "servers" key', async () => {
    const entry = makeMCPEntry({name: 'vscode-mcp', environments: ['vscode-copilot']})

    await deployMCPEntry(entry, 'vscode-copilot', cwd)

    const filePath = join(cwd, '.vscode', 'mcp.json')
    expect(existsSync(filePath)).toBe(true)

    const json = await readJson(filePath)
    expect(json).toHaveProperty('servers')
    expect(json).not.toHaveProperty('mcpServers')
    expect(json.servers).toHaveProperty('vscode-mcp')
  })

  it('handles claude-code: writes to .mcp.json with "mcpServers" key', async () => {
    const entry = makeMCPEntry({name: 'claude-mcp', environments: ['claude-code']})

    await deployMCPEntry(entry, 'claude-code', cwd)

    const json = await readJson(join(cwd, '.mcp.json'))
    expect(json).toHaveProperty('mcpServers')
    expect(json.mcpServers).toHaveProperty('claude-mcp')
  })

  it('handles opencode: writes to opencode.json with "mcpServers" key', async () => {
    const entry = makeMCPEntry({name: 'oc-mcp', environments: ['opencode']})

    await deployMCPEntry(entry, 'opencode', cwd)

    const json = await readJson(join(cwd, 'opencode.json'))
    expect(json).toHaveProperty('mcpServers')
    expect(json.mcpServers).toHaveProperty('oc-mcp')
  })

  it('handles gemini-cli: writes to ~/.gemini/settings.json with "mcpServers" key', async () => {
    // We cannot write to real homedir in tests; we verify the path structure by
    // pre-creating the directory under a unique path then checking the written file
    const {homedir} = await import('node:os')
    const geminiSettingsPath = join(homedir(), '.gemini', 'settings.json')

    // Read current state (may not exist) so we can restore it
    const hadExistingFile = existsSync(geminiSettingsPath)
    let originalContent = null
    if (hadExistingFile) {
      originalContent = await readFile(geminiSettingsPath, 'utf8')
    }

    try {
      const entry = makeMCPEntry({name: 'gemini-mcp', environments: ['gemini-cli']})
      await deployMCPEntry(entry, 'gemini-cli', cwd)

      expect(existsSync(geminiSettingsPath)).toBe(true)
      const json = await readJson(geminiSettingsPath)
      expect(json).toHaveProperty('mcpServers')
      expect(json.mcpServers).toHaveProperty('gemini-mcp')
    } finally {
      // Restore previous state
      if (hadExistingFile && originalContent !== null) {
        await writeFile(geminiSettingsPath, originalContent, 'utf8')
      } else if (existsSync(geminiSettingsPath)) {
        await rm(geminiSettingsPath, {force: true})
      }
    }
  })

  it('handles copilot-cli: writes to ~/.copilot/mcp-config.json with "mcpServers" key', async () => {
    const {homedir} = await import('node:os')
    const copilotMcpPath = join(homedir(), '.copilot', 'mcp-config.json')

    const hadExistingFile = existsSync(copilotMcpPath)
    let originalContent = null
    if (hadExistingFile) {
      originalContent = await readFile(copilotMcpPath, 'utf8')
    }

    try {
      const entry = makeMCPEntry({name: 'copilot-mcp', environments: ['copilot-cli']})
      await deployMCPEntry(entry, 'copilot-cli', cwd)

      expect(existsSync(copilotMcpPath)).toBe(true)
      const json = await readJson(copilotMcpPath)
      expect(json).toHaveProperty('mcpServers')
      expect(json.mcpServers).toHaveProperty('copilot-mcp')
    } finally {
      if (hadExistingFile && originalContent !== null) {
        await writeFile(copilotMcpPath, originalContent, 'utf8')
      } else if (existsSync(copilotMcpPath)) {
        await rm(copilotMcpPath, {force: true})
      }
    }
  })

  it('is a no-op when entry type is not mcp', async () => {
    const entry = makeCommandEntry()

    // Should not throw and should not create any file
    await expect(deployMCPEntry(entry, 'claude-code', cwd)).resolves.toBeUndefined()
    expect(existsSync(join(cwd, '.mcp.json'))).toBe(false)
  })

  it('is a no-op when entry is null', async () => {
    await expect(deployMCPEntry(null, 'claude-code', cwd)).resolves.toBeUndefined()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// undeployMCPEntry
// ──────────────────────────────────────────────────────────────────────────────

describe('undeployMCPEntry', () => {
  it('removes an entry by name while preserving other entries', async () => {
    const filePath = join(cwd, '.mcp.json')
    const initial = {
      mcpServers: {
        'server-a': {command: 'node', args: [], env: {}},
        'server-b': {command: 'npx', args: ['-y', 'pkg'], env: {}},
      },
    }
    await writeFile(filePath, JSON.stringify(initial), 'utf8')

    await undeployMCPEntry('server-a', 'claude-code', cwd)

    const json = await readJson(filePath)
    expect(json.mcpServers).not.toHaveProperty('server-a')
    expect(json.mcpServers).toHaveProperty('server-b')
  })

  it('leaves an empty mcpServers object when the last entry is removed', async () => {
    const filePath = join(cwd, '.mcp.json')
    const initial = {
      mcpServers: {
        'only-server': {command: 'node', args: [], env: {}},
      },
    }
    await writeFile(filePath, JSON.stringify(initial), 'utf8')

    await undeployMCPEntry('only-server', 'claude-code', cwd)

    const json = await readJson(filePath)
    expect(json).toHaveProperty('mcpServers')
    expect(Object.keys(json.mcpServers)).toHaveLength(0)
  })

  it('is a no-op when the target file does not exist', async () => {
    // Should not throw
    await expect(undeployMCPEntry('nonexistent', 'claude-code', cwd)).resolves.toBeUndefined()
    expect(existsSync(join(cwd, '.mcp.json'))).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// deployFileEntry
// ──────────────────────────────────────────────────────────────────────────────

describe('deployFileEntry', () => {
  it('creates a markdown file at the correct path for a claude-code command', async () => {
    const entry = makeCommandEntry({
      name: 'refactor',
      environments: ['claude-code'],
      params: {content: '# Refactor\nRefactor the selected code.', description: 'Refactor'},
    })

    await deployFileEntry(entry, 'claude-code', cwd)

    const filePath = join(cwd, '.claude', 'commands', 'refactor.md')
    expect(existsSync(filePath)).toBe(true)
    const content = await readFile(filePath, 'utf8')
    expect(content).toBe('# Refactor\nRefactor the selected code.')
  })

  it('creates a TOML file for a gemini-cli command', async () => {
    const entry = makeCommandEntry({
      name: 'summarise',
      environments: ['gemini-cli'],
      params: {content: 'Summarise the current file.', description: 'Summarise'},
    })

    // Use a real temp dir for the gemini path; we capture the expected path and
    // clean it up afterwards.
    const {homedir} = await import('node:os')
    const tomlPath = join(homedir(), '.gemini', 'commands', 'summarise.toml')

    const hadExistingFile = existsSync(tomlPath)
    let originalContent = null
    if (hadExistingFile) {
      originalContent = await readFile(tomlPath, 'utf8')
    }

    try {
      await deployFileEntry(entry, 'gemini-cli', cwd)

      expect(existsSync(tomlPath)).toBe(true)
      const raw = await readFile(tomlPath, 'utf8')
      expect(raw).toContain('description = "Summarise"')
      expect(raw).toContain('[prompt]')
      expect(raw).toContain('Summarise the current file.')
    } finally {
      if (hadExistingFile && originalContent !== null) {
        await writeFile(tomlPath, originalContent, 'utf8')
      } else if (existsSync(tomlPath)) {
        await rm(tomlPath, {force: true})
      }
    }
  })

  it('creates nested directory structure {name}/SKILL.md for vscode-copilot skills', async () => {
    const entry = {
      id: randomUUID(),
      name: 'my-skill',
      type: /** @type {import('../../../src/types.js').CategoryType} */ ('skill'),
      active: true,
      environments: /** @type {import('../../../src/types.js').EnvironmentId[]} */ (['vscode-copilot']),
      params: {content: '# My Skill\nThis is a skill definition.'},
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    await deployFileEntry(entry, 'vscode-copilot', cwd)

    const skillDir = join(cwd, '.github', 'skills', 'my-skill')
    const skillFile = join(skillDir, 'SKILL.md')

    expect(existsSync(skillDir)).toBe(true)
    expect(existsSync(skillFile)).toBe(true)

    const content = await readFile(skillFile, 'utf8')
    expect(content).toBe('# My Skill\nThis is a skill definition.')
  })

  it('creates a markdown file for an opencode command', async () => {
    const entry = makeCommandEntry({
      name: 'generate-tests',
      environments: ['opencode'],
    })

    await deployFileEntry(entry, 'opencode', cwd)

    const filePath = join(cwd, '.opencode', 'commands', 'generate-tests.md')
    expect(existsSync(filePath)).toBe(true)
  })

  it('creates a markdown file for a vscode-copilot command (prompt.md)', async () => {
    const entry = makeCommandEntry({
      name: 'fix-types',
      environments: ['vscode-copilot'],
    })

    await deployFileEntry(entry, 'vscode-copilot', cwd)

    const filePath = join(cwd, '.github', 'prompts', 'fix-types.prompt.md')
    expect(existsSync(filePath)).toBe(true)
  })

  it('creates a markdown file for a claude-code agent using instructions field', async () => {
    const entry = {
      id: randomUUID(),
      name: 'code-reviewer',
      type: /** @type {import('../../../src/types.js').CategoryType} */ ('agent'),
      active: true,
      environments: /** @type {import('../../../src/types.js').EnvironmentId[]} */ (['claude-code']),
      params: {instructions: 'Review code for quality and security.'},
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    await deployFileEntry(entry, 'claude-code', cwd)

    const filePath = join(cwd, '.claude', 'agents', 'code-reviewer.md')
    expect(existsSync(filePath)).toBe(true)
    const content = await readFile(filePath, 'utf8')
    expect(content).toBe('Review code for quality and security.')
  })

  it('is a no-op when entry is null', async () => {
    await expect(deployFileEntry(null, 'claude-code', cwd)).resolves.toBeUndefined()
  })

  it('is a no-op when entry type is mcp', async () => {
    const entry = makeMCPEntry()
    await expect(deployFileEntry(entry, 'claude-code', cwd)).resolves.toBeUndefined()
    expect(existsSync(join(cwd, '.claude', 'commands'))).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// undeployFileEntry
// ──────────────────────────────────────────────────────────────────────────────

describe('undeployFileEntry', () => {
  it('removes the file at the target path', async () => {
    // First deploy so the file exists
    const entry = makeCommandEntry({name: 'to-remove', environments: ['claude-code']})
    await deployFileEntry(entry, 'claude-code', cwd)

    const filePath = join(cwd, '.claude', 'commands', 'to-remove.md')
    expect(existsSync(filePath)).toBe(true)

    await undeployFileEntry('to-remove', 'command', 'claude-code', cwd)

    expect(existsSync(filePath)).toBe(false)
  })

  it('is a no-op when the file does not exist', async () => {
    await expect(undeployFileEntry('nonexistent', 'command', 'claude-code', cwd)).resolves.toBeUndefined()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// deployEntry
// ──────────────────────────────────────────────────────────────────────────────

describe('deployEntry', () => {
  it('only deploys to environments that are in detectedEnvs', async () => {
    const entry = makeMCPEntry({
      name: 'multi-env-mcp',
      environments: ['claude-code', 'vscode-copilot'],
    })

    // Only claude-code is detected
    const detectedEnvs = [makeDetected('claude-code')]

    await deployEntry(entry, detectedEnvs, cwd)

    // claude-code file should exist
    expect(existsSync(join(cwd, '.mcp.json'))).toBe(true)
    // vscode-copilot file should NOT exist (not detected)
    expect(existsSync(join(cwd, '.vscode', 'mcp.json'))).toBe(false)
  })

  it('deploys to all detected environments listed in entry.environments', async () => {
    const entry = makeMCPEntry({
      name: 'both-env-mcp',
      environments: ['claude-code', 'vscode-copilot'],
    })

    const detectedEnvs = [makeDetected('claude-code'), makeDetected('vscode-copilot')]

    await deployEntry(entry, detectedEnvs, cwd)

    expect(existsSync(join(cwd, '.mcp.json'))).toBe(true)
    expect(existsSync(join(cwd, '.vscode', 'mcp.json'))).toBe(true)
  })

  it('skips environments whose target MCP JSON file is marked as unreadable', async () => {
    const mcpPath = join(cwd, '.mcp.json')
    // Write a corrupt JSON file so it is "unreadable"
    await writeFile(mcpPath, 'NOT VALID JSON }{', 'utf8')

    const entry = makeMCPEntry({name: 'skip-unreadable', environments: ['claude-code']})

    // The detected env has the target file in its unreadable list
    const detectedEnvs = [makeDetected('claude-code', [mcpPath])]

    const originalStat = await readFile(mcpPath, 'utf8')
    await deployEntry(entry, detectedEnvs, cwd)
    const afterStat = await readFile(mcpPath, 'utf8')

    // The corrupt file must NOT have been overwritten
    expect(afterStat).toBe(originalStat)
  })

  it('is a no-op for an empty detectedEnvs array', async () => {
    const entry = makeMCPEntry({environments: ['claude-code']})

    await deployEntry(entry, [], cwd)

    expect(existsSync(join(cwd, '.mcp.json'))).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// undeployEntry
// ──────────────────────────────────────────────────────────────────────────────

describe('undeployEntry', () => {
  it('removes deployed files for all detected environments', async () => {
    const entry = makeCommandEntry({
      name: 'cleanup-cmd',
      environments: ['claude-code', 'vscode-copilot'],
    })

    const detectedEnvs = [makeDetected('claude-code'), makeDetected('vscode-copilot')]

    // Deploy first
    await deployEntry(entry, detectedEnvs, cwd)
    expect(existsSync(join(cwd, '.claude', 'commands', 'cleanup-cmd.md'))).toBe(true)
    expect(existsSync(join(cwd, '.github', 'prompts', 'cleanup-cmd.prompt.md'))).toBe(true)

    await undeployEntry(entry, detectedEnvs, cwd)

    expect(existsSync(join(cwd, '.claude', 'commands', 'cleanup-cmd.md'))).toBe(false)
    expect(existsSync(join(cwd, '.github', 'prompts', 'cleanup-cmd.prompt.md'))).toBe(false)
  })

  it('is a no-op when entry is null', async () => {
    await expect(undeployEntry(null, [makeDetected('claude-code')], cwd)).resolves.toBeUndefined()
  })

  it('is a no-op when entry is undefined', async () => {
    await expect(undeployEntry(undefined, [makeDetected('claude-code')], cwd)).resolves.toBeUndefined()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// reconcileOnScan
// ──────────────────────────────────────────────────────────────────────────────

describe('reconcileOnScan', () => {
  it('deploys active entries to detected environments', async () => {
    const entries = [
      makeMCPEntry({name: 'active-mcp', environments: ['claude-code'], active: true}),
      makeCommandEntry({name: 'active-cmd', environments: ['claude-code'], active: true}),
    ]

    const detectedEnvs = [makeDetected('claude-code')]

    await reconcileOnScan(entries, detectedEnvs, cwd)

    expect(existsSync(join(cwd, '.mcp.json'))).toBe(true)
    const json = await readJson(join(cwd, '.mcp.json'))
    expect(json.mcpServers).toHaveProperty('active-mcp')

    expect(existsSync(join(cwd, '.claude', 'commands', 'active-cmd.md'))).toBe(true)
  })

  it('does not deploy inactive entries', async () => {
    const entries = [makeMCPEntry({name: 'inactive-mcp', environments: ['claude-code'], active: false})]

    const detectedEnvs = [makeDetected('claude-code')]

    await reconcileOnScan(entries, detectedEnvs, cwd)

    expect(existsSync(join(cwd, '.mcp.json'))).toBe(false)
  })

  it('does not deploy to environments that are not detected', async () => {
    const entries = [makeMCPEntry({name: 'no-env-mcp', environments: ['vscode-copilot'], active: true})]

    // Only claude-code is detected, not vscode-copilot
    const detectedEnvs = [makeDetected('claude-code')]

    await reconcileOnScan(entries, detectedEnvs, cwd)

    expect(existsSync(join(cwd, '.vscode', 'mcp.json'))).toBe(false)
  })

  it('is idempotent — calling twice produces the same result', async () => {
    const entries = [makeMCPEntry({name: 'idempotent-mcp', environments: ['claude-code'], active: true})]

    const detectedEnvs = [makeDetected('claude-code')]

    await reconcileOnScan(entries, detectedEnvs, cwd)
    await reconcileOnScan(entries, detectedEnvs, cwd)

    const json = await readJson(join(cwd, '.mcp.json'))
    // Entry should appear exactly once (not duplicated)
    const keys = Object.keys(json.mcpServers)
    expect(keys.filter((k) => k === 'idempotent-mcp')).toHaveLength(1)
  })

  it('is a no-op when entries array is empty', async () => {
    await expect(reconcileOnScan([], [makeDetected('claude-code')], cwd)).resolves.toBeUndefined()
  })
})

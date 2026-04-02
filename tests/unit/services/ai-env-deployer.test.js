import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {join} from 'node:path'
import {tmpdir, homedir} from 'node:os'
import {readFile, mkdir, writeFile, rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import yaml from 'js-yaml'

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
 * Build a minimal CategoryEntry for skill type.
 * @param {Partial<import('../../../src/types.js').CategoryEntry>} [overrides]
 * @returns {import('../../../src/types.js').CategoryEntry}
 */
function makeSkillEntry(overrides = {}) {
  return {
    id: randomUUID(),
    name: 'my-skill',
    type: /** @type {import('../../../src/types.js').CategoryType} */ ('skill'),
    active: true,
    environments: /** @type {import('../../../src/types.js').EnvironmentId[]} */ (['claude-code']),
    params: {content: '# My Skill\nSkill content here.', description: 'A test skill'},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Build a minimal CategoryEntry for agent type.
 * @param {Partial<import('../../../src/types.js').CategoryEntry>} [overrides]
 * @returns {import('../../../src/types.js').CategoryEntry}
 */
function makeAgentEntry(overrides = {}) {
  return {
    id: randomUUID(),
    name: 'my-agent',
    type: /** @type {import('../../../src/types.js').CategoryType} */ ('agent'),
    active: true,
    environments: /** @type {import('../../../src/types.js').EnvironmentId[]} */ (['claude-code']),
    params: {instructions: 'Agent instructions here.', description: 'A test agent'},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Build a minimal CategoryEntry for rule type.
 * @param {Partial<import('../../../src/types.js').CategoryEntry>} [overrides]
 * @returns {import('../../../src/types.js').CategoryEntry}
 */
function makeRuleEntry(overrides = {}) {
  return {
    id: randomUUID(),
    name: 'my-rule',
    type: /** @type {import('../../../src/types.js').CategoryType} */ ('rule'),
    active: true,
    environments: /** @type {import('../../../src/types.js').EnvironmentId[]} */ (['claude-code']),
    params: {content: 'Rule content here.', description: 'A test rule'},
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

/**
 * Save, run fn, then restore a file at the given path.
 * Useful for tests that write to real homedir paths.
 * @param {string} filePath
 * @param {() => Promise<void>} fn
 * @returns {Promise<void>}
 */
async function withRestoredFile(filePath, fn) {
  const hadExistingFile = existsSync(filePath)
  let originalContent = null
  if (hadExistingFile) {
    originalContent = await readFile(filePath, 'utf8')
  }
  try {
    await fn()
  } finally {
    if (hadExistingFile && originalContent !== null) {
      await writeFile(filePath, originalContent, 'utf8')
    } else if (existsSync(filePath)) {
      await rm(filePath, {force: true})
    }
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

  it('handles opencode: writes to opencode.json with "mcp" key in OpenCode format', async () => {
    const entry = makeMCPEntry({name: 'oc-mcp', environments: ['opencode']})

    await deployMCPEntry(entry, 'opencode', cwd)

    const json = await readJson(join(cwd, 'opencode.json'))
    expect(json).toHaveProperty('mcp')
    expect(json.mcp).toHaveProperty('oc-mcp')
    // OpenCode format: command is array, environment instead of env, type is local/remote
    const server = json.mcp['oc-mcp']
    expect(server).toHaveProperty('enabled', true)
    expect(server).toHaveProperty('type', 'local')
    expect(Array.isArray(server.command)).toBe(true)
  })

  it('handles gemini-cli: writes to ~/.gemini/settings.json with "mcpServers" key', async () => {
    const geminiSettingsPath = join(homedir(), '.gemini', 'settings.json')

    await withRestoredFile(geminiSettingsPath, async () => {
      const entry = makeMCPEntry({name: 'gemini-mcp', environments: ['gemini-cli']})
      await deployMCPEntry(entry, 'gemini-cli', cwd)

      expect(existsSync(geminiSettingsPath)).toBe(true)
      const json = await readJson(geminiSettingsPath)
      expect(json).toHaveProperty('mcpServers')
      expect(json.mcpServers).toHaveProperty('gemini-mcp')
    })
  })

  it('handles copilot-cli: writes to ~/.copilot/mcp-config.json with "mcpServers" key', async () => {
    const copilotMcpPath = join(homedir(), '.copilot', 'mcp-config.json')

    await withRestoredFile(copilotMcpPath, async () => {
      const entry = makeMCPEntry({name: 'copilot-mcp', environments: ['copilot-cli']})
      await deployMCPEntry(entry, 'copilot-cli', cwd)

      expect(existsSync(copilotMcpPath)).toBe(true)
      const json = await readJson(copilotMcpPath)
      expect(json).toHaveProperty('mcpServers')
      expect(json.mcpServers).toHaveProperty('copilot-mcp')
    })
  })

  it('handles cursor: writes to .cursor/mcp.json with "mcpServers" key', async () => {
    const entry = makeMCPEntry({name: 'cursor-mcp', environments: ['cursor']})

    await deployMCPEntry(entry, 'cursor', cwd)

    const filePath = join(cwd, '.cursor', 'mcp.json')
    expect(existsSync(filePath)).toBe(true)

    const json = await readJson(filePath)
    expect(json).toHaveProperty('mcpServers')
    expect(json.mcpServers).toHaveProperty('cursor-mcp')
    expect(json.mcpServers['cursor-mcp']).toMatchObject({command: 'npx'})
  })

  it('handles windsurf: writes to ~/.codeium/windsurf/mcp_config.json with "mcpServers" key', async () => {
    const windsurfMcpPath = join(homedir(), '.codeium', 'windsurf', 'mcp_config.json')

    await withRestoredFile(windsurfMcpPath, async () => {
      const entry = makeMCPEntry({name: 'windsurf-mcp', environments: ['windsurf']})
      await deployMCPEntry(entry, 'windsurf', cwd)

      expect(existsSync(windsurfMcpPath)).toBe(true)
      const json = await readJson(windsurfMcpPath)
      expect(json).toHaveProperty('mcpServers')
      expect(json.mcpServers).toHaveProperty('windsurf-mcp')
    })
  })

  it('handles continue-dev: writes YAML to ~/.continue/config.yaml with "mcpServers" key', async () => {
    const continuePath = join(homedir(), '.continue', 'config.yaml')

    await withRestoredFile(continuePath, async () => {
      const entry = makeMCPEntry({name: 'continue-mcp', environments: ['continue-dev']})
      await deployMCPEntry(entry, 'continue-dev', cwd)

      expect(existsSync(continuePath)).toBe(true)
      const raw = await readFile(continuePath, 'utf8')
      // Must be YAML, not JSON
      expect(raw).not.toMatch(/^\s*\{/)
      const parsed = /** @type {any} */ (yaml.load(raw))
      expect(parsed).toHaveProperty('mcpServers')
      expect(parsed.mcpServers).toHaveProperty('continue-mcp')
      expect(parsed.mcpServers['continue-mcp']).toMatchObject({command: 'npx'})
    })
  })

  it('handles continue-dev: merges into existing YAML without clobbering other entries', async () => {
    const continuePath = join(homedir(), '.continue', 'config.yaml')

    await withRestoredFile(continuePath, async () => {
      // Pre-populate with an existing entry
      const existing = {mcpServers: {'existing-server': {command: 'node', args: []}}}
      await mkdir(join(homedir(), '.continue'), {recursive: true})
      await writeFile(continuePath, yaml.dump(existing), 'utf8')

      const entry = makeMCPEntry({name: 'new-continue-mcp', environments: ['continue-dev']})
      await deployMCPEntry(entry, 'continue-dev', cwd)

      const raw = await readFile(continuePath, 'utf8')
      const parsed = /** @type {any} */ (yaml.load(raw))
      expect(parsed.mcpServers).toHaveProperty('existing-server')
      expect(parsed.mcpServers).toHaveProperty('new-continue-mcp')
    })
  })

  it('handles zed: writes to ~/.config/zed/settings.json with "context_servers" key', async () => {
    const zedSettingsPath = join(homedir(), '.config', 'zed', 'settings.json')

    await withRestoredFile(zedSettingsPath, async () => {
      const entry = makeMCPEntry({name: 'zed-mcp', environments: ['zed']})
      await deployMCPEntry(entry, 'zed', cwd)

      expect(existsSync(zedSettingsPath)).toBe(true)
      const json = await readJson(zedSettingsPath)
      expect(json).toHaveProperty('context_servers')
      expect(json).not.toHaveProperty('mcpServers')
      expect(/** @type {any} */ (json.context_servers)).toHaveProperty('zed-mcp')
    })
  })

  it('handles amazon-q: writes to .amazonq/mcp.json with "mcpServers" key', async () => {
    const entry = makeMCPEntry({name: 'amazonq-mcp', environments: ['amazon-q']})

    await deployMCPEntry(entry, 'amazon-q', cwd)

    const filePath = join(cwd, '.amazonq', 'mcp.json')
    expect(existsSync(filePath)).toBe(true)

    const json = await readJson(filePath)
    expect(json).toHaveProperty('mcpServers')
    expect(json.mcpServers).toHaveProperty('amazonq-mcp')
  })

  it('omits type field for stdio transport (environments infer it from command)', async () => {
    const entry = makeMCPEntry({
      name: 'stdio-no-type',
      environments: ['claude-code'],
      params: {transport: 'stdio', command: 'npx', args: ['-y', 'test-pkg']},
    })

    await deployMCPEntry(entry, 'claude-code', cwd)

    const json = await readJson(join(cwd, '.mcp.json'))
    const server = json.mcpServers['stdio-no-type']
    expect(server).toHaveProperty('command', 'npx')
    expect(server).not.toHaveProperty('type')
  })

  it('includes type field for sse transport', async () => {
    const entry = makeMCPEntry({
      name: 'sse-server',
      environments: ['claude-code'],
      params: {transport: 'sse', url: 'https://mcp.example.com/sse'},
    })

    await deployMCPEntry(entry, 'claude-code', cwd)

    const json = await readJson(join(cwd, '.mcp.json'))
    const server = json.mcpServers['sse-server']
    expect(server).toHaveProperty('type', 'sse')
    expect(server).toHaveProperty('url', 'https://mcp.example.com/sse')
  })

  it('includes type field for streamable-http transport', async () => {
    const entry = makeMCPEntry({
      name: 'http-server',
      environments: ['claude-code'],
      params: {transport: 'streamable-http', url: 'https://mcp.example.com/http'},
    })

    await deployMCPEntry(entry, 'claude-code', cwd)

    const json = await readJson(join(cwd, '.mcp.json'))
    const server = json.mcpServers['http-server']
    expect(server).toHaveProperty('type', 'streamable-http')
    expect(server).toHaveProperty('url', 'https://mcp.example.com/http')
  })

  it('deploys env vars to the server object', async () => {
    const entry = makeMCPEntry({
      name: 'env-server',
      environments: ['claude-code'],
      params: {transport: 'stdio', command: 'npx', args: [], env: {API_KEY: 'abc123', SECRET: 'xyz'}},
    })

    await deployMCPEntry(entry, 'claude-code', cwd)

    const json = await readJson(join(cwd, '.mcp.json'))
    const server = json.mcpServers['env-server']
    expect(server.env).toEqual({API_KEY: 'abc123', SECRET: 'xyz'})
  })

  it('normalizes legacy string args into array', async () => {
    const entry = makeMCPEntry({
      name: 'legacy-args',
      environments: ['claude-code'],
      params: {transport: 'stdio', command: 'npx', args: 'mcp-proxy\n--transport=sse\nhttp://localhost:8123'},
    })

    await deployMCPEntry(entry, 'claude-code', cwd)

    const json = await readJson(join(cwd, '.mcp.json'))
    const server = json.mcpServers['legacy-args']
    expect(Array.isArray(server.args)).toBe(true)
    expect(server.args).toEqual(['mcp-proxy', '--transport=sse', 'http://localhost:8123'])
  })

  it('normalizes legacy string env into object', async () => {
    const entry = makeMCPEntry({
      name: 'legacy-env',
      environments: ['claude-code'],
      params: {transport: 'stdio', command: 'npx', env: 'API_KEY=abc123\nSECRET=xyz'},
    })

    await deployMCPEntry(entry, 'claude-code', cwd)

    const json = await readJson(join(cwd, '.mcp.json'))
    const server = json.mcpServers['legacy-env']
    expect(typeof server.env).toBe('object')
    expect(Array.isArray(server.env)).toBe(false)
    expect(server.env).toEqual({API_KEY: 'abc123', SECRET: 'xyz'})
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

  it('removes an entry from cursor .cursor/mcp.json while preserving others', async () => {
    const filePath = join(cwd, '.cursor', 'mcp.json')
    await mkdir(join(cwd, '.cursor'), {recursive: true})
    const initial = {
      mcpServers: {
        'server-keep': {command: 'node', args: []},
        'server-remove': {command: 'npx', args: []},
      },
    }
    await writeFile(filePath, JSON.stringify(initial), 'utf8')

    await undeployMCPEntry('server-remove', 'cursor', cwd)

    const json = await readJson(filePath)
    expect(json.mcpServers).not.toHaveProperty('server-remove')
    expect(json.mcpServers).toHaveProperty('server-keep')
  })

  it('removes an entry from continue-dev YAML while preserving others', async () => {
    const continuePath = join(homedir(), '.continue', 'config.yaml')

    await withRestoredFile(continuePath, async () => {
      const initial = {
        mcpServers: {
          'server-keep': {command: 'node', args: []},
          'server-remove': {command: 'npx', args: []},
        },
      }
      await mkdir(join(homedir(), '.continue'), {recursive: true})
      await writeFile(continuePath, yaml.dump(initial), 'utf8')

      await undeployMCPEntry('server-remove', 'continue-dev', cwd)

      const raw = await readFile(continuePath, 'utf8')
      const parsed = /** @type {any} */ (yaml.load(raw))
      expect(parsed.mcpServers).not.toHaveProperty('server-remove')
      expect(parsed.mcpServers).toHaveProperty('server-keep')
      // Should still be valid YAML, not JSON
      expect(raw).not.toMatch(/^\s*\{/)
    })
  })

  it('removes an entry from amazon-q .amazonq/mcp.json', async () => {
    const filePath = join(cwd, '.amazonq', 'mcp.json')
    await mkdir(join(cwd, '.amazonq'), {recursive: true})
    const initial = {
      mcpServers: {
        'aq-server': {command: 'node', args: []},
      },
    }
    await writeFile(filePath, JSON.stringify(initial), 'utf8')

    await undeployMCPEntry('aq-server', 'amazon-q', cwd)

    const json = await readJson(filePath)
    expect(json.mcpServers).not.toHaveProperty('aq-server')
    expect(json).toHaveProperty('mcpServers')
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

    const tomlPath = join(homedir(), '.gemini', 'commands', 'summarise.toml')

    await withRestoredFile(tomlPath, async () => {
      await deployFileEntry(entry, 'gemini-cli', cwd)

      expect(existsSync(tomlPath)).toBe(true)
      const raw = await readFile(tomlPath, 'utf8')
      expect(raw).toContain('description = "Summarise"')
      expect(raw).toContain('[prompt]')
      expect(raw).toContain('text = """')
      expect(raw).toContain('Summarise the current file.')
    })
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

  it('creates an .mdc file with YAML frontmatter for a cursor rule', async () => {
    const entry = makeRuleEntry({
      name: 'no-console',
      environments: ['cursor'],
      params: {content: 'Never use console.log in production code.', description: 'No console logs'},
    })

    await deployFileEntry(entry, 'cursor', cwd)

    const filePath = join(cwd, '.cursor', 'rules', 'no-console.mdc')
    expect(existsSync(filePath)).toBe(true)

    const raw = await readFile(filePath, 'utf8')
    // Must have YAML frontmatter
    expect(raw).toMatch(/^---\n/)
    expect(raw).toContain('description: No console logs')
    expect(raw).toContain('globs:')
    expect(raw).toContain('alwaysApply: false')
    expect(raw).toContain('---')
    // Must contain the rule content after the frontmatter
    expect(raw).toContain('Never use console.log in production code.')
  })

  it('creates a .md file at .claude/rules/<name>.md for a claude-code rule', async () => {
    const entry = makeRuleEntry({
      name: 'style-guide',
      environments: ['claude-code'],
      params: {content: 'Follow the project style guide.', description: 'Style guide'},
    })

    await deployFileEntry(entry, 'claude-code', cwd)

    const filePath = join(cwd, '.claude', 'rules', 'style-guide.md')
    expect(existsSync(filePath)).toBe(true)

    const content = await readFile(filePath, 'utf8')
    expect(content).toBe('Follow the project style guide.')
  })

  it('creates a .md file at .continue/rules/<name>.md for a continue-dev rule', async () => {
    const entry = makeRuleEntry({
      name: 'best-practices',
      environments: ['continue-dev'],
      params: {content: 'Always write tests.', description: 'Best practices'},
    })

    await deployFileEntry(entry, 'continue-dev', cwd)

    const filePath = join(cwd, '.continue', 'rules', 'best-practices.md')
    expect(existsSync(filePath)).toBe(true)

    const content = await readFile(filePath, 'utf8')
    expect(content).toBe('Always write tests.')
  })

  it('creates a .md file for a claude-code skill', async () => {
    const entry = makeSkillEntry({
      name: 'refactor-skill',
      environments: ['claude-code'],
      params: {content: '# Refactor Skill\nRefactor code.', description: 'Refactor'},
    })

    await deployFileEntry(entry, 'claude-code', cwd)

    const filePath = join(cwd, '.claude', 'skills', 'refactor-skill.md')
    expect(existsSync(filePath)).toBe(true)

    const content = await readFile(filePath, 'utf8')
    expect(content).toBe('# Refactor Skill\nRefactor code.')
  })

  it('creates a .md file for a cursor skill', async () => {
    const entry = makeSkillEntry({
      name: 'debug-skill',
      environments: ['cursor'],
      params: {content: 'Debugging skill content.', description: 'Debug'},
    })

    await deployFileEntry(entry, 'cursor', cwd)

    const filePath = join(cwd, '.cursor', 'skills', 'debug-skill.md')
    expect(existsSync(filePath)).toBe(true)

    const content = await readFile(filePath, 'utf8')
    expect(content).toBe('Debugging skill content.')
  })

  it('creates a .md file for an opencode agent', async () => {
    const entry = makeAgentEntry({
      name: 'test-agent',
      environments: ['opencode'],
      params: {content: 'OpenCode agent instructions.', description: 'Test agent'},
    })

    await deployFileEntry(entry, 'opencode', cwd)

    const filePath = join(cwd, '.opencode', 'agents', 'test-agent.md')
    expect(existsSync(filePath)).toBe(true)

    const content = await readFile(filePath, 'utf8')
    expect(content).toBe('OpenCode agent instructions.')
  })

  it('creates parent directories as needed when they do not exist', async () => {
    const entry = makeCommandEntry({
      name: 'deep-cmd',
      environments: ['claude-code'],
      params: {content: 'Deep command content.'},
    })

    // The .claude/commands directory does not exist yet
    expect(existsSync(join(cwd, '.claude'))).toBe(false)

    await deployFileEntry(entry, 'claude-code', cwd)

    const filePath = join(cwd, '.claude', 'commands', 'deep-cmd.md')
    expect(existsSync(filePath)).toBe(true)
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

  it('removes a deployed skill file for claude-code', async () => {
    const entry = makeSkillEntry({name: 'skill-to-remove', environments: ['claude-code']})
    await deployFileEntry(entry, 'claude-code', cwd)

    const filePath = join(cwd, '.claude', 'skills', 'skill-to-remove.md')
    expect(existsSync(filePath)).toBe(true)

    await undeployFileEntry('skill-to-remove', 'skill', 'claude-code', cwd)

    expect(existsSync(filePath)).toBe(false)
  })

  it('removes a deployed agent file for opencode', async () => {
    const entry = makeAgentEntry({
      name: 'agent-to-remove',
      environments: ['opencode'],
      params: {content: 'Agent content.'},
    })
    await deployFileEntry(entry, 'opencode', cwd)

    const filePath = join(cwd, '.opencode', 'agents', 'agent-to-remove.md')
    expect(existsSync(filePath)).toBe(true)

    await undeployFileEntry('agent-to-remove', 'agent', 'opencode', cwd)

    expect(existsSync(filePath)).toBe(false)
  })

  it('removes a deployed cursor .mdc rule file', async () => {
    const entry = makeRuleEntry({
      name: 'rule-to-remove',
      environments: ['cursor'],
      params: {content: 'Rule content.', description: 'Test'},
    })
    await deployFileEntry(entry, 'cursor', cwd)

    const filePath = join(cwd, '.cursor', 'rules', 'rule-to-remove.mdc')
    expect(existsSync(filePath)).toBe(true)

    await undeployFileEntry('rule-to-remove', 'rule', 'cursor', cwd)

    expect(existsSync(filePath)).toBe(false)
  })

  it('removes a deployed claude-code rule file', async () => {
    const entry = makeRuleEntry({
      name: 'rule-claude',
      environments: ['claude-code'],
      params: {content: 'Claude rule.', description: 'Test'},
    })
    await deployFileEntry(entry, 'claude-code', cwd)

    const filePath = join(cwd, '.claude', 'rules', 'rule-claude.md')
    expect(existsSync(filePath)).toBe(true)

    await undeployFileEntry('rule-claude', 'rule', 'claude-code', cwd)

    expect(existsSync(filePath)).toBe(false)
  })

  it('is a no-op when type is mcp', async () => {
    await expect(undeployFileEntry('some-mcp', 'mcp', 'claude-code', cwd)).resolves.toBeUndefined()
    expect(existsSync(join(cwd, '.mcp.json'))).toBe(false)
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

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {writeFile, mkdir, rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'

import {
  loadAIConfig,
  addEntry,
  updateEntry,
  deactivateEntry,
  activateEntry,
  deleteEntry,
  getEntriesByEnvironment,
  getEntriesByType,
} from '../../../src/services/ai-config-store.js'
import {DvmiError} from '../../../src/utils/errors.js'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build a unique temp file path per test run.
 * @returns {string}
 */
function makeTmpPath() {
  const dir = join(tmpdir(), `dvmi-ai-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  return join(dir, 'ai-config.json')
}

/** Minimal valid entry data for an MCP entry targeting compatible environments. */
const MCP_ENTRY = {
  name: 'test-mcp',
  type: /** @type {import('../../../src/types.js').CategoryType} */ ('mcp'),
  environments: /** @type {import('../../../src/types.js').EnvironmentId[]} */ (['claude-code']),
  params: {transport: 'stdio', command: 'npx', args: [], env: {}},
}

// ──────────────────────────────────────────────────────────────────────────────
// Test setup / teardown
// ──────────────────────────────────────────────────────────────────────────────

let tmpPath

beforeEach(() => {
  tmpPath = makeTmpPath()
  process.env.DVMI_AI_CONFIG_PATH = tmpPath
})

afterEach(async () => {
  delete process.env.DVMI_AI_CONFIG_PATH
  const dir = join(tmpPath, '..')
  if (existsSync(dir)) {
    await rm(dir, {recursive: true, force: true})
  }
})

// ──────────────────────────────────────────────────────────────────────────────
// loadAIConfig
// ──────────────────────────────────────────────────────────────────────────────

describe('loadAIConfig', () => {
  it('returns defaults when file does not exist', async () => {
    const store = await loadAIConfig(tmpPath)
    expect(store).toEqual({version: 1, entries: []})
  })

  it('returns parsed content from an existing valid file', async () => {
    const dir = join(tmpPath, '..')
    await mkdir(dir, {recursive: true})
    const data = {
      version: 1,
      entries: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          name: 'existing-mcp',
          type: 'mcp',
          active: true,
          environments: ['claude-code'],
          params: {transport: 'stdio', command: 'npx', args: [], env: {}},
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    }
    await writeFile(tmpPath, JSON.stringify(data), 'utf8')

    const store = await loadAIConfig(tmpPath)
    expect(store.version).toBe(1)
    expect(store.entries).toHaveLength(1)
    expect(store.entries[0].name).toBe('existing-mcp')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// addEntry
// ──────────────────────────────────────────────────────────────────────────────

describe('addEntry', () => {
  it('creates an entry with UUID, active: true, and timestamps', async () => {
    const before = new Date()
    const entry = await addEntry(MCP_ENTRY, tmpPath)
    const after = new Date()

    expect(entry.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(entry.active).toBe(true)
    expect(entry.name).toBe(MCP_ENTRY.name)
    expect(entry.type).toBe(MCP_ENTRY.type)
    expect(entry.environments).toEqual(MCP_ENTRY.environments)

    const createdAt = new Date(entry.createdAt)
    const updatedAt = new Date(entry.updatedAt)
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime())
    expect(updatedAt.getTime()).toEqual(createdAt.getTime())
  })

  it('throws DvmiError for a duplicate name within the same type', async () => {
    await addEntry(MCP_ENTRY, tmpPath)
    await expect(addEntry(MCP_ENTRY, tmpPath)).rejects.toThrow(DvmiError)
    await expect(addEntry(MCP_ENTRY, tmpPath)).rejects.toThrow(/already exists/)
  })

  it('throws DvmiError when the name contains invalid filename characters', async () => {
    const bad = {...MCP_ENTRY, name: 'bad/name'}
    await expect(addEntry(bad, tmpPath)).rejects.toThrow(DvmiError)
    await expect(addEntry(bad, tmpPath)).rejects.toThrow(/invalid characters/)
  })

  it('throws DvmiError when an environment is incompatible with the entry type', async () => {
    const incompatible = {
      name: 'agent-for-gemini',
      type: /** @type {import('../../../src/types.js').CategoryType} */ ('agent'),
      environments: /** @type {import('../../../src/types.js').EnvironmentId[]} */ (['gemini-cli']),
      params: {instructions: 'do stuff'},
    }
    await expect(addEntry(incompatible, tmpPath)).rejects.toThrow(DvmiError)
    await expect(addEntry(incompatible, tmpPath)).rejects.toThrow(/does not support type/)
  })

  it('succeeds for compatible environment and type combinations', async () => {
    const compatible = {
      name: 'mcp-for-gemini',
      type: /** @type {import('../../../src/types.js').CategoryType} */ ('mcp'),
      environments: /** @type {import('../../../src/types.js').EnvironmentId[]} */ (['gemini-cli']),
      params: {transport: 'stdio', command: 'npx', args: [], env: {}},
    }
    const entry = await addEntry(compatible, tmpPath)
    expect(entry.id).toBeTruthy()
    expect(entry.environments).toContain('gemini-cli')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// updateEntry
// ──────────────────────────────────────────────────────────────────────────────

describe('updateEntry', () => {
  it('merges changes and updates updatedAt', async () => {
    const original = await addEntry(MCP_ENTRY, tmpPath)

    // Small delay to ensure updatedAt differs from createdAt
    await new Promise((r) => setTimeout(r, 5))

    const updated = await updateEntry(original.id, {name: 'renamed-mcp', environments: ['opencode']}, tmpPath)

    expect(updated.id).toBe(original.id)
    expect(updated.name).toBe('renamed-mcp')
    expect(updated.environments).toEqual(['opencode'])
    expect(updated.type).toBe(original.type)
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(original.updatedAt).getTime())
  })

  it('throws DvmiError when the entry id is not found', async () => {
    await expect(updateEntry('non-existent-id', {name: 'x'}, tmpPath)).rejects.toThrow(DvmiError)
    await expect(updateEntry('non-existent-id', {name: 'x'}, tmpPath)).rejects.toThrow(/not found/)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// deactivateEntry / activateEntry
// ──────────────────────────────────────────────────────────────────────────────

describe('deactivateEntry', () => {
  it('sets active to false', async () => {
    const entry = await addEntry(MCP_ENTRY, tmpPath)
    const deactivated = await deactivateEntry(entry.id, tmpPath)
    expect(deactivated.active).toBe(false)

    const store = await loadAIConfig(tmpPath)
    expect(store.entries[0].active).toBe(false)
  })
})

describe('activateEntry', () => {
  it('sets active to true after deactivation', async () => {
    const entry = await addEntry(MCP_ENTRY, tmpPath)
    await deactivateEntry(entry.id, tmpPath)
    const activated = await activateEntry(entry.id, tmpPath)
    expect(activated.active).toBe(true)

    const store = await loadAIConfig(tmpPath)
    expect(store.entries[0].active).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// deleteEntry
// ──────────────────────────────────────────────────────────────────────────────

describe('deleteEntry', () => {
  it('removes the entry from the store', async () => {
    const entry = await addEntry(MCP_ENTRY, tmpPath)
    await deleteEntry(entry.id, tmpPath)

    const store = await loadAIConfig(tmpPath)
    expect(store.entries).toHaveLength(0)
  })

  it('throws DvmiError when the entry id is not found', async () => {
    await expect(deleteEntry('non-existent-id', tmpPath)).rejects.toThrow(DvmiError)
    await expect(deleteEntry('non-existent-id', tmpPath)).rejects.toThrow(/not found/)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// getEntriesByEnvironment
// ──────────────────────────────────────────────────────────────────────────────

describe('getEntriesByEnvironment', () => {
  it('returns only active entries that include the given environment', async () => {
    const active = await addEntry({...MCP_ENTRY, name: 'active-mcp', environments: ['claude-code']}, tmpPath)
    const alsoActive = await addEntry(
      {
        name: 'active-opencode',
        type: 'mcp',
        environments: ['opencode'],
        params: {transport: 'stdio', command: 'npx', args: [], env: {}},
      },
      tmpPath,
    )
    await deactivateEntry(active.id, tmpPath)

    const results = await getEntriesByEnvironment('claude-code', tmpPath)
    expect(results.every((e) => e.active)).toBe(true)
    expect(results.every((e) => e.environments.includes('claude-code'))).toBe(true)
    expect(results.find((e) => e.id === active.id)).toBeUndefined()
    expect(results.find((e) => e.id === alsoActive.id)).toBeUndefined()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// getEntriesByType
// ──────────────────────────────────────────────────────────────────────────────

describe('getEntriesByType', () => {
  it('returns all entries of the given type regardless of active flag', async () => {
    const mcp1 = await addEntry({...MCP_ENTRY, name: 'mcp-one'}, tmpPath)
    const mcp2 = await addEntry({...MCP_ENTRY, name: 'mcp-two'}, tmpPath)
    await addEntry(
      {
        name: 'a-command',
        type: 'command',
        environments: ['claude-code'],
        params: {content: 'do something'},
      },
      tmpPath,
    )
    await deactivateEntry(mcp2.id, tmpPath)

    const results = await getEntriesByType('mcp', tmpPath)
    expect(results).toHaveLength(2)
    expect(results.map((e) => e.id).sort()).toEqual([mcp1.id, mcp2.id].sort())
    // Both active and inactive are returned
    expect(results.find((e) => e.id === mcp2.id)?.active).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// syncAIConfigToChezmoi
// ──────────────────────────────────────────────────────────────────────────────

vi.mock('../../../src/services/shell.js', () => ({exec: vi.fn()}))
vi.mock('../../../src/services/config.js', () => ({loadConfig: vi.fn()}))

describe('syncAIConfigToChezmoi', () => {
  let execMock
  let loadConfigMock

  beforeEach(async () => {
    const shellModule = await import('../../../src/services/shell.js')
    const configModule = await import('../../../src/services/config.js')
    execMock = shellModule.exec
    loadConfigMock = configModule.loadConfig
    vi.clearAllMocks()
  })

  it('calls chezmoi add when dotfiles.enabled is true', async () => {
    loadConfigMock.mockResolvedValue({dotfiles: {enabled: true}})
    execMock.mockResolvedValue({stdout: '', stderr: '', exitCode: 0})

    const {syncAIConfigToChezmoi} = await import('../../../src/services/ai-config-store.js')
    await syncAIConfigToChezmoi()

    expect(execMock).toHaveBeenCalledOnce()
    expect(execMock).toHaveBeenCalledWith('chezmoi', ['add', expect.any(String)])
  })

  it('skips when dotfiles.enabled is false', async () => {
    loadConfigMock.mockResolvedValue({dotfiles: {enabled: false}})

    const {syncAIConfigToChezmoi} = await import('../../../src/services/ai-config-store.js')
    await syncAIConfigToChezmoi()

    expect(execMock).not.toHaveBeenCalled()
  })

  it('skips when dotfiles is not configured', async () => {
    loadConfigMock.mockResolvedValue({})

    const {syncAIConfigToChezmoi} = await import('../../../src/services/ai-config-store.js')
    await syncAIConfigToChezmoi()

    expect(execMock).not.toHaveBeenCalled()
  })

  it('does not throw when chezmoi fails', async () => {
    loadConfigMock.mockResolvedValue({dotfiles: {enabled: true}})
    execMock.mockRejectedValue(new Error('chezmoi not found'))

    const {syncAIConfigToChezmoi} = await import('../../../src/services/ai-config-store.js')
    await expect(syncAIConfigToChezmoi()).resolves.toBeUndefined()
  })
})

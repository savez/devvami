import {readFile, writeFile, mkdir, chmod} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {join, dirname} from 'node:path'
import {homedir} from 'node:os'
import {randomUUID} from 'node:crypto'

import {DvmiError} from '../utils/errors.js'
import {exec} from './shell.js'
import {loadConfig} from './config.js'

/** @import { AIConfigStore, CategoryEntry, CategoryType, EnvironmentId, MCPParams, CommandParams, RuleParams, SkillParams, AgentParams } from '../types.js' */

// ──────────────────────────────────────────────────────────────────────────────
// Path resolution
// ──────────────────────────────────────────────────────────────────────────────

const CONFIG_DIR = process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, 'dvmi')
  : join(homedir(), '.config', 'dvmi')

export const AI_CONFIG_PATH = join(CONFIG_DIR, 'ai-config.json')

// ──────────────────────────────────────────────────────────────────────────────
// Compatibility matrix
// ──────────────────────────────────────────────────────────────────────────────

/** @type {Record<EnvironmentId, CategoryType[]>} */
const COMPATIBILITY = {
  'vscode-copilot': ['mcp', 'command', 'rule', 'skill', 'agent'],
  'claude-code': ['mcp', 'command', 'rule', 'skill', 'agent'],
  'claude-desktop': ['mcp'],
  opencode: ['mcp', 'command', 'rule', 'skill', 'agent'],
  'gemini-cli': ['mcp', 'command', 'rule'],
  'copilot-cli': ['mcp', 'command', 'rule', 'skill', 'agent'],
  cursor: ['mcp', 'command', 'rule', 'skill'],
  windsurf: ['mcp', 'command', 'rule'],
  'continue-dev': ['mcp', 'command', 'rule', 'agent'],
  zed: ['mcp', 'rule'],
  'amazon-q': ['mcp', 'rule', 'agent'],
}

/** All known environment IDs. */
const KNOWN_ENVIRONMENTS = /** @type {EnvironmentId[]} */ (Object.keys(COMPATIBILITY))

/** Regex for filename-unsafe characters. */
const UNSAFE_CHARS = /[/\\:*?"<>|]/

// ──────────────────────────────────────────────────────────────────────────────
// Default store
// ──────────────────────────────────────────────────────────────────────────────

/** @returns {AIConfigStore} */
function defaultStore() {
  return {version: 2, entries: []}
}

/**
 * Migrate an AI config store to the current schema version.
 * v1 → v2 is a no-op data migration; it only bumps the version field.
 * @param {AIConfigStore} store
 * @returns {AIConfigStore}
 */
function migrateStore(store) {
  if (store.version === 1) {
    return {...store, version: 2}
  }
  return store
}

// ──────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Assert that a name is non-empty and contains no filename-unsafe characters.
 * @param {string} name
 * @returns {void}
 */
function validateName(name) {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new DvmiError(
      'Entry name must be a non-empty string',
      'Provide a valid name for the entry, e.g. "my-mcp-server"',
    )
  }
  if (UNSAFE_CHARS.test(name)) {
    throw new DvmiError(
      `Entry name "${name}" contains invalid characters`,
      'Remove characters like / \\ : * ? " < > | from the name',
    )
  }
}

/**
 * Assert that all environment IDs are compatible with the given entry type.
 * @param {EnvironmentId[]} environments
 * @param {CategoryType} type
 * @returns {void}
 */
function validateEnvironments(environments, type) {
  for (const envId of environments) {
    const supported = COMPATIBILITY[envId]
    if (!supported) {
      throw new DvmiError(`Unknown environment "${envId}"`, `Valid environments are: ${KNOWN_ENVIRONMENTS.join(', ')}`)
    }
    if (!supported.includes(type)) {
      throw new DvmiError(
        `Environment "${envId}" does not support type "${type}"`,
        `"${envId}" supports: ${supported.join(', ')}`,
      )
    }
  }
}

/**
 * Assert that rule params contain a non-empty string `content` field.
 * @param {RuleParams} params
 * @returns {void}
 */
function validateRuleParams(params) {
  if (!params || typeof params.content !== 'string' || params.content.trim() === '') {
    throw new DvmiError(
      'Rule entry requires a non-empty "content" string',
      'Provide the rule content, e.g. { content: "Always use TypeScript" }',
    )
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Core I/O
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Load the AI config store from disk.
 * Returns `{ version: 1, entries: [] }` if the file is missing or unparseable.
 * @param {string} [configPath] - Override config path (used in tests; falls back to DVMI_AI_CONFIG_PATH or AI_CONFIG_PATH)
 * @returns {Promise<AIConfigStore>}
 */
export async function loadAIConfig(configPath = process.env.DVMI_AI_CONFIG_PATH ?? AI_CONFIG_PATH) {
  if (!existsSync(configPath)) return defaultStore()
  try {
    const raw = await readFile(configPath, 'utf8')
    const parsed = JSON.parse(raw)
    return migrateStore({version: parsed.version ?? 1, entries: Array.isArray(parsed.entries) ? parsed.entries : []})
  } catch {
    return defaultStore()
  }
}

/**
 * Persist the AI config store to disk.
 * Creates the parent directory if it does not exist and sets file permissions to 0o600.
 * @param {AIConfigStore} store
 * @param {string} [configPath] - Override config path (used in tests)
 * @returns {Promise<void>}
 */
export async function saveAIConfig(store, configPath = process.env.DVMI_AI_CONFIG_PATH ?? AI_CONFIG_PATH) {
  const dir = dirname(configPath)
  if (!existsSync(dir)) {
    await mkdir(dir, {recursive: true})
  }
  await writeFile(configPath, JSON.stringify(store, null, 2), 'utf8')
  await chmod(configPath, 0o600)
}

// ──────────────────────────────────────────────────────────────────────────────
// CRUD operations
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Add a new entry to the AI config store.
 * @param {{ name: string, type: CategoryType, environments: EnvironmentId[], params: MCPParams|CommandParams|RuleParams|SkillParams|AgentParams }} entryData
 * @param {string} [configPath]
 * @returns {Promise<CategoryEntry>}
 */
export async function addEntry(entryData, configPath = process.env.DVMI_AI_CONFIG_PATH ?? AI_CONFIG_PATH) {
  const {name, type, environments, params} = entryData

  validateName(name)
  validateEnvironments(environments, type)
  if (type === 'rule') validateRuleParams(/** @type {RuleParams} */ (params))

  const store = await loadAIConfig(configPath)

  const duplicate = store.entries.find((e) => e.name === name && e.type === type)
  if (duplicate) {
    throw new DvmiError(
      `An entry named "${name}" of type "${type}" already exists`,
      'Use a unique name or update the existing entry with `dvmi sync-config-ai update`',
    )
  }

  const now = new Date().toISOString()
  /** @type {CategoryEntry} */
  const entry = {
    id: randomUUID(),
    name,
    type,
    active: true,
    environments,
    params,
    createdAt: now,
    updatedAt: now,
  }

  store.entries.push(entry)
  await saveAIConfig(store, configPath)
  await syncAIConfigToChezmoi()
  return entry
}

/**
 * Update an existing entry by id.
 * @param {string} id - UUID of the entry to update
 * @param {{ name?: string, environments?: EnvironmentId[], params?: MCPParams|CommandParams|SkillParams|AgentParams, active?: boolean }} changes
 * @param {string} [configPath]
 * @returns {Promise<CategoryEntry>}
 */
export async function updateEntry(id, changes, configPath = process.env.DVMI_AI_CONFIG_PATH ?? AI_CONFIG_PATH) {
  const store = await loadAIConfig(configPath)

  const index = store.entries.findIndex((e) => e.id === id)
  if (index === -1) {
    throw new DvmiError(
      `Entry with id "${id}" not found`,
      'Run `dvmi sync-config-ai list` to see available entries and their IDs',
    )
  }

  const existing = store.entries[index]

  if (changes.name !== undefined) {
    validateName(changes.name)
    if (changes.name !== existing.name) {
      const duplicate = store.entries.find((e) => e.id !== id && e.name === changes.name && e.type === existing.type)
      if (duplicate) {
        throw new DvmiError(
          `An entry named "${changes.name}" of type "${existing.type}" already exists`,
          'Choose a different name or update the conflicting entry',
        )
      }
    }
  }

  const newEnvironments = changes.environments ?? existing.environments
  const newType = existing.type
  if (changes.environments !== undefined) {
    validateEnvironments(newEnvironments, newType)
  }

  /** @type {CategoryEntry} */
  const updated = {
    ...existing,
    ...(changes.name !== undefined ? {name: changes.name} : {}),
    ...(changes.environments !== undefined ? {environments: changes.environments} : {}),
    ...(changes.params !== undefined ? {params: changes.params} : {}),
    ...(changes.active !== undefined ? {active: changes.active} : {}),
    updatedAt: new Date().toISOString(),
  }

  store.entries[index] = updated
  await saveAIConfig(store, configPath)
  await syncAIConfigToChezmoi()
  return updated
}

/**
 * Set an entry's `active` flag to `false`.
 * @param {string} id - UUID of the entry to deactivate
 * @param {string} [configPath]
 * @returns {Promise<CategoryEntry>}
 */
export async function deactivateEntry(id, configPath = process.env.DVMI_AI_CONFIG_PATH ?? AI_CONFIG_PATH) {
  return updateEntry(id, {active: false}, configPath)
}

/**
 * Set an entry's `active` flag to `true`.
 * @param {string} id - UUID of the entry to activate
 * @param {string} [configPath]
 * @returns {Promise<CategoryEntry>}
 */
export async function activateEntry(id, configPath = process.env.DVMI_AI_CONFIG_PATH ?? AI_CONFIG_PATH) {
  return updateEntry(id, {active: true}, configPath)
}

/**
 * Permanently remove an entry from the store.
 * @param {string} id - UUID of the entry to delete
 * @param {string} [configPath]
 * @returns {Promise<void>}
 */
export async function deleteEntry(id, configPath = process.env.DVMI_AI_CONFIG_PATH ?? AI_CONFIG_PATH) {
  const store = await loadAIConfig(configPath)

  const index = store.entries.findIndex((e) => e.id === id)
  if (index === -1) {
    throw new DvmiError(
      `Entry with id "${id}" not found`,
      'Run `dvmi sync-config-ai list` to see available entries and their IDs',
    )
  }

  store.entries.splice(index, 1)
  await saveAIConfig(store, configPath)
  await syncAIConfigToChezmoi()
}

/**
 * Return all active entries that target a given environment.
 * @param {EnvironmentId} envId
 * @param {string} [configPath]
 * @returns {Promise<CategoryEntry[]>}
 */
export async function getEntriesByEnvironment(envId, configPath = process.env.DVMI_AI_CONFIG_PATH ?? AI_CONFIG_PATH) {
  const store = await loadAIConfig(configPath)
  return store.entries.filter((e) => e.active && e.environments.includes(envId))
}

/**
 * Return all entries (active and inactive) of a given type.
 * @param {CategoryType} type
 * @param {string} [configPath]
 * @returns {Promise<CategoryEntry[]>}
 */
export async function getEntriesByType(type, configPath = process.env.DVMI_AI_CONFIG_PATH ?? AI_CONFIG_PATH) {
  const store = await loadAIConfig(configPath)
  return store.entries.filter((e) => e.type === type)
}

// ──────────────────────────────────────────────────────────────────────────────
// Chezmoi sync
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Sync the AI config file to chezmoi if dotfiles management is enabled.
 * Non-blocking — silently ignores errors.
 * @returns {Promise<void>}
 */
export async function syncAIConfigToChezmoi() {
  try {
    const cliConfig = await loadConfig()
    if (!cliConfig.dotfiles?.enabled) return
    const configPath = process.env.DVMI_AI_CONFIG_PATH ?? AI_CONFIG_PATH
    await exec('chezmoi', ['add', configPath])
  } catch {
    // Non-blocking — chezmoi sync failures should not disrupt the user's workflow
  }
}

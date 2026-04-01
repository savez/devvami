/**
 * @module ai-env-deployer
 * Translates dvmi's abstract CategoryEntry objects into actual filesystem writes
 * (JSON mutations for MCP servers, markdown/TOML files for commands, skills, and agents)
 * for each supported AI coding environment.
 */

import {readFile, writeFile, mkdir, rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {join, dirname} from 'node:path'
import {homedir} from 'node:os'

/** @import { CategoryEntry, CategoryType, EnvironmentId, DetectedEnvironment } from '../types.js' */

// ──────────────────────────────────────────────────────────────────────────────
// Path & key resolution tables
// ──────────────────────────────────────────────────────────────────────────────

/**
 * For each environment, the target JSON file path (relative to cwd or absolute)
 * and the root key that holds the MCP server map.
 *
 * @type {Record<EnvironmentId, { resolvePath: (cwd: string) => string, mcpKey: string }>}
 */
const MCP_TARGETS = {
  'vscode-copilot': {
    resolvePath: (cwd) => join(cwd, '.vscode', 'mcp.json'),
    mcpKey: 'servers',
  },
  'claude-code': {
    resolvePath: (cwd) => join(cwd, '.mcp.json'),
    mcpKey: 'mcpServers',
  },
  opencode: {
    resolvePath: (cwd) => join(cwd, 'opencode.json'),
    mcpKey: 'mcpServers',
  },
  'gemini-cli': {
    resolvePath: (_cwd) => join(homedir(), '.gemini', 'settings.json'),
    mcpKey: 'mcpServers',
  },
  'copilot-cli': {
    resolvePath: (_cwd) => join(homedir(), '.copilot', 'mcp-config.json'),
    mcpKey: 'mcpServers',
  },
}

/**
 * Resolve the target file path for a file-based entry (command, skill, agent).
 *
 * @param {string} name - Entry name (used as filename base)
 * @param {CategoryType} type - Category type
 * @param {EnvironmentId} envId - Target environment
 * @param {string} cwd - Project working directory
 * @returns {string} Absolute path to write
 */
function resolveFilePath(name, type, envId, cwd) {
  switch (type) {
    case 'command':
      return resolveCommandPath(name, envId, cwd)
    case 'skill':
      return resolveSkillPath(name, envId, cwd)
    case 'agent':
      return resolveAgentPath(name, envId, cwd)
    default:
      throw new Error(`Unsupported file entry type: ${type}`)
  }
}

/**
 * @param {string} name
 * @param {EnvironmentId} envId
 * @param {string} cwd
 * @returns {string}
 */
function resolveCommandPath(name, envId, cwd) {
  switch (envId) {
    case 'vscode-copilot':
      return join(cwd, '.github', 'prompts', `${name}.prompt.md`)
    case 'claude-code':
      return join(cwd, '.claude', 'commands', `${name}.md`)
    case 'opencode':
      return join(cwd, '.opencode', 'commands', `${name}.md`)
    case 'gemini-cli':
      return join(homedir(), '.gemini', 'commands', `${name}.toml`)
    case 'copilot-cli':
      // shared path with vscode-copilot for commands
      return join(cwd, '.github', 'prompts', `${name}.prompt.md`)
    default:
      throw new Error(`Unknown environment for command: ${envId}`)
  }
}

/**
 * @param {string} name
 * @param {EnvironmentId} envId
 * @param {string} cwd
 * @returns {string}
 */
function resolveSkillPath(name, envId, cwd) {
  switch (envId) {
    case 'vscode-copilot':
      // vscode uses a nested directory with SKILL.md inside
      return join(cwd, '.github', 'skills', name, 'SKILL.md')
    case 'claude-code':
      return join(cwd, '.claude', 'skills', `${name}.md`)
    case 'opencode':
      return join(cwd, '.opencode', 'skills', `${name}.md`)
    case 'copilot-cli':
      return join(homedir(), '.copilot', 'skills', `${name}.md`)
    default:
      throw new Error(`Environment "${envId}" does not support skill entries`)
  }
}

/**
 * @param {string} name
 * @param {EnvironmentId} envId
 * @param {string} cwd
 * @returns {string}
 */
function resolveAgentPath(name, envId, cwd) {
  switch (envId) {
    case 'vscode-copilot':
      return join(cwd, '.github', 'agents', `${name}.agent.md`)
    case 'claude-code':
      return join(cwd, '.claude', 'agents', `${name}.md`)
    case 'opencode':
      return join(cwd, '.opencode', 'agents', `${name}.md`)
    case 'copilot-cli':
      return join(homedir(), '.copilot', 'agents', `${name}.md`)
    default:
      throw new Error(`Environment "${envId}" does not support agent entries`)
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// TOML rendering
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Render a Gemini CLI command entry as a TOML string.
 * No external TOML library is used — we generate the string directly.
 *
 * @param {string} description - Short description of the command
 * @param {string} content - Prompt text content
 * @returns {string} TOML-formatted string
 */
function renderGeminiToml(description, content) {
  // Escape triple-quotes inside the content to prevent TOML parse errors
  const safeContent = content.replace(/"""/g, '\\"\\"\\"')
  return `description = ${JSON.stringify(description)}

[prompt]
text = """
${safeContent}
"""
`
}

// ──────────────────────────────────────────────────────────────────────────────
// JSON helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Read a JSON file from disk. Returns an empty object when the file is missing.
 * Throws if the file exists but cannot be parsed.
 *
 * @param {string} filePath - Absolute path to the JSON file
 * @returns {Promise<Record<string, unknown>>}
 */
async function readJsonOrEmpty(filePath) {
  if (!existsSync(filePath)) return {}
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

/**
 * Write a value to disk as pretty-printed JSON, creating parent directories
 * as needed.
 *
 * @param {string} filePath - Absolute path
 * @param {unknown} data - Serialisable value
 * @returns {Promise<void>}
 */
async function writeJson(filePath, data) {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    await mkdir(dir, {recursive: true})
  }
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}

// ──────────────────────────────────────────────────────────────────────────────
// Build MCP server object from entry params
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Convert an MCP entry's params into the server descriptor object written into
 * the target JSON file.
 *
 * @param {import('../types.js').MCPParams} params
 * @returns {Record<string, unknown>}
 */
function buildMCPServerObject(params) {
  /** @type {Record<string, unknown>} */
  const server = {}

  if (params.command !== undefined) server.command = params.command
  if (params.args !== undefined) server.args = params.args
  if (params.env !== undefined) server.env = params.env
  if (params.url !== undefined) server.url = params.url
  if (params.transport !== undefined) server.type = params.transport

  return server
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API — MCP
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Deploy an MCP entry to a specific AI environment by merging it into the
 * appropriate JSON config file. Creates the file (and parent directories) if
 * it does not yet exist. Existing entries under other names are preserved.
 *
 * Skips silently when:
 * - `entry` is falsy
 * - `entry.type` is not `'mcp'`
 * - `entry.params` is absent
 *
 * @param {CategoryEntry} entry - The MCP entry to deploy
 * @param {EnvironmentId} envId - Target environment identifier
 * @param {string} cwd - Project working directory (used for project-relative paths)
 * @returns {Promise<void>}
 */
export async function deployMCPEntry(entry, envId, cwd) {
  if (!entry || entry.type !== 'mcp' || !entry.params) return

  const target = MCP_TARGETS[envId]
  if (!target) return

  const filePath = target.resolvePath(cwd)
  const json = await readJsonOrEmpty(filePath)

  if (!json[target.mcpKey] || typeof json[target.mcpKey] !== 'object') {
    json[target.mcpKey] = {}
  }

  /** @type {Record<string, unknown>} */
  const mcpKey = /** @type {any} */ (json[target.mcpKey])
  mcpKey[entry.name] = buildMCPServerObject(/** @type {import('../types.js').MCPParams} */ (entry.params))

  await writeJson(filePath, json)
}

/**
 * Remove an MCP entry by name from a specific AI environment's JSON config file.
 * If the file does not exist the function is a no-op.
 * If the MCP key becomes empty after removal, it is kept as an empty object
 * (the structure is preserved).
 *
 * @param {string} entryName - Name of the MCP server to remove
 * @param {EnvironmentId} envId - Target environment identifier
 * @param {string} cwd - Project working directory
 * @returns {Promise<void>}
 */
export async function undeployMCPEntry(entryName, envId, cwd) {
  const target = MCP_TARGETS[envId]
  if (!target) return

  const filePath = target.resolvePath(cwd)
  if (!existsSync(filePath)) return

  const json = await readJsonOrEmpty(filePath)

  if (json[target.mcpKey] && typeof json[target.mcpKey] === 'object') {
    delete (/** @type {any} */ (json[target.mcpKey])[entryName])
  }

  await writeJson(filePath, json)
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API — File-based entries
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Deploy a file-based entry (command, skill, or agent) to a specific AI
 * environment. Creates parent directories as needed.
 *
 * For Gemini CLI commands the output is TOML; for everything else it is the raw
 * markdown content stored in `entry.params.content` or `entry.params.instructions`.
 *
 * For VS Code Copilot skills the directory structure `{name}/SKILL.md` is
 * created automatically.
 *
 * Skips silently when:
 * - `entry` is falsy
 * - `entry.type` is `'mcp'` (wrong function)
 * - `entry.params` is absent
 *
 * @param {CategoryEntry} entry - The entry to deploy
 * @param {EnvironmentId} envId - Target environment identifier
 * @param {string} cwd - Project working directory
 * @returns {Promise<void>}
 */
export async function deployFileEntry(entry, envId, cwd) {
  if (!entry || entry.type === 'mcp' || !entry.params) return

  const filePath = resolveFilePath(entry.name, entry.type, envId, cwd)
  const dir = dirname(filePath)

  if (!existsSync(dir)) {
    await mkdir(dir, {recursive: true})
  }

  const params = /** @type {any} */ (entry.params)

  // Gemini CLI commands use TOML format
  if (envId === 'gemini-cli' && entry.type === 'command') {
    const description = params.description ?? ''
    const content = params.content ?? ''
    await writeFile(filePath, renderGeminiToml(description, content), 'utf8')
    return
  }

  // All other file entries use markdown
  const content = params.content ?? params.instructions ?? ''
  await writeFile(filePath, content, 'utf8')
}

/**
 * Remove a deployed file-based entry from disk. This is a no-op if the file
 * does not exist.
 *
 * @param {string} entryName - Name of the entry (used to derive the file path)
 * @param {CategoryType} type - Category type of the entry
 * @param {EnvironmentId} envId - Target environment identifier
 * @param {string} cwd - Project working directory
 * @returns {Promise<void>}
 */
export async function undeployFileEntry(entryName, type, envId, cwd) {
  if (type === 'mcp') return

  const filePath = resolveFilePath(entryName, type, envId, cwd)
  if (!existsSync(filePath)) return

  await rm(filePath, {force: true})
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API — Composite helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Deploy an entry to all of its target environments that are currently detected
 * and readable.
 *
 * - Environments listed in `entry.environments` but absent from `detectedEnvs`
 *   are silently skipped.
 * - Environments that are detected but have unreadable JSON config files are
 *   also skipped (to avoid clobbering corrupt files).
 *
 * @param {CategoryEntry} entry - The entry to deploy
 * @param {DetectedEnvironment[]} detectedEnvs - Environments found on the current machine
 * @param {string} cwd - Project working directory
 * @returns {Promise<void>}
 */
export async function deployEntry(entry, detectedEnvs, cwd) {
  if (!entry) return

  const detectedIds = new Set(detectedEnvs.map((e) => e.id))

  for (const envId of entry.environments) {
    if (!detectedIds.has(envId)) continue

    const detectedEnv = detectedEnvs.find((e) => e.id === envId)
    // Skip if the environment has unreadable JSON config files that correspond
    // to the MCP target path (we don't want to overwrite corrupt files)
    if (detectedEnv && entry.type === 'mcp') {
      const target = MCP_TARGETS[envId]
      if (target) {
        const targetPath = target.resolvePath(cwd)
        if (detectedEnv.unreadable.includes(targetPath)) continue
      }
    }

    if (entry.type === 'mcp') {
      await deployMCPEntry(entry, envId, cwd)
    } else {
      await deployFileEntry(entry, envId, cwd)
    }
  }
}

/**
 * Undeploy an entry from all of its target environments that are currently
 * detected. This is safe to call even when `entry` is `null` or `undefined`
 * (it becomes a no-op).
 *
 * @param {CategoryEntry | null | undefined} entry - The entry to undeploy
 * @param {DetectedEnvironment[]} detectedEnvs - Environments found on the current machine
 * @param {string} cwd - Project working directory
 * @returns {Promise<void>}
 */
export async function undeployEntry(entry, detectedEnvs, cwd) {
  if (!entry) return

  const detectedIds = new Set(detectedEnvs.map((e) => e.id))

  for (const envId of entry.environments) {
    if (!detectedIds.has(envId)) continue

    if (entry.type === 'mcp') {
      await undeployMCPEntry(entry.name, envId, cwd)
    } else {
      await undeployFileEntry(entry.name, entry.type, envId, cwd)
    }
  }
}

/**
 * Reconcile all active entries against the currently detected environments.
 *
 * For each active entry, every detected environment listed in
 * `entry.environments` is deployed (idempotent write). Environments that are
 * listed but not currently detected are left untouched — we never undeploy on
 * scan because the files may have been managed by the user directly
 * (FR-004d: re-activation on re-detection).
 *
 * Inactive entries are not touched.
 *
 * @param {CategoryEntry[]} entries - All managed entries from the AI config store
 * @param {DetectedEnvironment[]} detectedEnvs - Environments found on the current machine
 * @param {string} cwd - Project working directory
 * @returns {Promise<void>}
 */
export async function reconcileOnScan(entries, detectedEnvs, cwd) {
  for (const entry of entries) {
    if (!entry.active) continue
    await deployEntry(entry, detectedEnvs, cwd)
  }
}

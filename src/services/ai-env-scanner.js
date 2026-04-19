/**
 * @module ai-env-scanner
 * Detects AI coding environments by scanning well-known project and global config paths.
 */

import {existsSync, readFileSync, readdirSync} from 'node:fs'
import {resolve, join} from 'node:path'
import {homedir} from 'node:os'
import yaml from 'js-yaml'

/** @import { CategoryType, EnvironmentId, PathStatus, CategoryCounts, DetectedEnvironment, CategoryEntry, NativeEntry, DriftInfo } from '../types.js' */

/**
 * @typedef {Object} PathSpec
 * @property {string} path - Relative (project) or absolute (global) path string
 * @property {boolean} isJson - Whether to attempt JSON.parse after reading
 */

/**
 * @typedef {Object} EnvironmentDef
 * @property {EnvironmentId} id
 * @property {string} name - Display name
 * @property {PathSpec[]} projectPaths - Paths relative to cwd
 * @property {PathSpec[]} globalPaths - Absolute paths (resolved from homedir)
 * @property {CategoryType[]} supportedCategories
 */

/**
 * All recognised AI coding environments with their detection paths and capabilities.
 * @type {Readonly<EnvironmentDef[]>}
 */
export const ENVIRONMENTS = Object.freeze([
  {
    id: /** @type {EnvironmentId} */ ('vscode-copilot'),
    name: 'VS Code Copilot',
    projectPaths: [
      {path: '.github/copilot-instructions.md', isJson: false},
      {path: '.vscode/mcp.json', isJson: true},
      {path: '.github/instructions/', isJson: false},
      {path: '.github/prompts/', isJson: false},
      {path: '.github/agents/', isJson: false},
      {path: '.github/skills/', isJson: false},
    ],
    globalPaths: [],
    supportedCategories: /** @type {CategoryType[]} */ (['mcp', 'command', 'rule', 'skill', 'agent']),
  },
  {
    id: /** @type {EnvironmentId} */ ('claude-code'),
    name: 'Claude Code',
    projectPaths: [
      {path: 'CLAUDE.md', isJson: false},
      {path: '.mcp.json', isJson: true},
      {path: '.claude/commands/', isJson: false},
      {path: '.claude/skills/', isJson: false},
      {path: '.claude/agents/', isJson: false},
      {path: '.claude/rules/', isJson: false},
    ],
    globalPaths: [
      {path: '~/.claude.json', isJson: true},
      {path: '~/.claude/commands/', isJson: false},
      {path: '~/.claude/agents/', isJson: false},
    ],
    supportedCategories: /** @type {CategoryType[]} */ (['mcp', 'command', 'rule', 'skill', 'agent']),
  },
  {
    id: /** @type {EnvironmentId} */ ('claude-desktop'),
    name: 'Claude Desktop',
    projectPaths: [],
    globalPaths: [
      {path: '~/Library/Application Support/Claude/claude_desktop_config.json', isJson: true},
    ],
    supportedCategories: /** @type {CategoryType[]} */ (['mcp']),
  },
  {
    id: /** @type {EnvironmentId} */ ('opencode'),
    name: 'OpenCode',
    projectPaths: [
      {path: 'AGENTS.md', isJson: false},
      {path: '.opencode/commands/', isJson: false},
      {path: '.opencode/skills/', isJson: false},
      {path: '.opencode/agents/', isJson: false},
      {path: 'opencode.json', isJson: true},
      {path: 'opencode.toml', isJson: false},
    ],
    globalPaths: [
      {path: '~/.config/opencode/opencode.json', isJson: true},
      {path: '~/.config/opencode/commands/', isJson: false},
      {path: '~/.config/opencode/agents/', isJson: false},
      {path: '~/.config/opencode/skills/', isJson: false},
    ],
    supportedCategories: /** @type {CategoryType[]} */ (['mcp', 'command', 'rule', 'skill', 'agent']),
  },
  {
    id: /** @type {EnvironmentId} */ ('gemini-cli'),
    name: 'Gemini CLI',
    projectPaths: [{path: 'GEMINI.md', isJson: false}],
    globalPaths: [
      {path: '~/.gemini/settings.json', isJson: true},
      {path: '~/.gemini/commands/', isJson: false},
      {path: '~/.gemini/GEMINI.md', isJson: false},
    ],
    supportedCategories: /** @type {CategoryType[]} */ (['mcp', 'command', 'rule']),
  },
  {
    id: /** @type {EnvironmentId} */ ('copilot-cli'),
    name: 'GitHub Copilot CLI',
    projectPaths: [
      {path: '.github/copilot-instructions.md', isJson: false},
      {path: '.github/prompts/', isJson: false},
      {path: '.github/agents/', isJson: false},
      {path: '.github/skills/', isJson: false},
    ],
    globalPaths: [
      {path: '~/.copilot/config.json', isJson: true},
      {path: '~/.copilot/mcp-config.json', isJson: true},
      {path: '~/.copilot/agents/', isJson: false},
      {path: '~/.copilot/skills/', isJson: false},
      {path: '~/.copilot/copilot-instructions.md', isJson: false},
    ],
    supportedCategories: /** @type {CategoryType[]} */ (['mcp', 'command', 'rule', 'skill', 'agent']),
  },
  {
    id: /** @type {EnvironmentId} */ ('cursor'),
    name: 'Cursor',
    projectPaths: [
      {path: '.cursor/mcp.json', isJson: true},
      {path: '.cursor/commands/', isJson: false},
      {path: '.cursor/rules/', isJson: false},
      {path: '.cursor/skills/', isJson: false},
    ],
    globalPaths: [
      {path: '~/.cursor/mcp.json', isJson: true},
    ],
    supportedCategories: /** @type {CategoryType[]} */ (['mcp', 'command', 'rule', 'skill']),
  },
  {
    id: /** @type {EnvironmentId} */ ('windsurf'),
    name: 'Windsurf',
    projectPaths: [
      {path: '.windsurf/workflows/', isJson: false},
      {path: '.windsurf/rules/', isJson: false},
    ],
    globalPaths: [
      {path: '~/.codeium/windsurf/mcp_config.json', isJson: true},
    ],
    supportedCategories: /** @type {CategoryType[]} */ (['mcp', 'command', 'rule']),
  },
  {
    id: /** @type {EnvironmentId} */ ('continue-dev'),
    name: 'Continue.dev',
    projectPaths: [
      {path: '.continue/config.yaml', isJson: false},
      {path: '.continue/prompts/', isJson: false},
      {path: '.continue/rules/', isJson: false},
      {path: '.continue/agents/', isJson: false},
    ],
    globalPaths: [
      {path: '~/.continue/config.yaml', isJson: false},
    ],
    supportedCategories: /** @type {CategoryType[]} */ (['mcp', 'command', 'rule', 'agent']),
  },
  {
    id: /** @type {EnvironmentId} */ ('zed'),
    name: 'Zed',
    projectPaths: [
      {path: '.rules', isJson: false},
    ],
    globalPaths: [
      {path: '~/.config/zed/settings.json', isJson: true},
    ],
    supportedCategories: /** @type {CategoryType[]} */ (['mcp', 'rule']),
  },
  {
    id: /** @type {EnvironmentId} */ ('amazon-q'),
    name: 'Amazon Q Developer',
    projectPaths: [
      {path: '.amazonq/mcp.json', isJson: true},
      {path: '.amazonq/rules/', isJson: false},
      {path: '.amazonq/cli-agents/', isJson: false},
    ],
    globalPaths: [
      {path: '~/.aws/amazonq/mcp.json', isJson: true},
    ],
    supportedCategories: /** @type {CategoryType[]} */ (['mcp', 'rule', 'agent']),
  },
])

/** @type {Record<import('../types.js').EnvironmentId, import('../types.js').CategoryType[]>} */
export const COMPATIBILITY = {
  'vscode-copilot': ['mcp', 'command', 'rule', 'skill', 'agent'],
  'claude-code':    ['mcp', 'command', 'rule', 'skill', 'agent'],
  'opencode':       ['mcp', 'command', 'rule', 'skill', 'agent'],
  'gemini-cli':     ['mcp', 'command', 'rule'],
  'copilot-cli':    ['mcp', 'command', 'rule', 'skill', 'agent'],
  'cursor':         ['mcp', 'command', 'rule', 'skill'],
  'windsurf':       ['mcp', 'command', 'rule'],
  'continue-dev':   ['mcp', 'command', 'rule', 'agent'],
  'zed':            ['mcp', 'rule'],
  'amazon-q':       ['mcp', 'rule', 'agent'],
}

/**
 * Groups of environments that share the same config file for a given path.
 * Used for auto-grouping in the form's environment multi-select.
 * @type {Record<string, import('../types.js').EnvironmentId[]>}
 */
export const SHARED_PATHS = {
  '.mcp.json': ['claude-code', 'copilot-cli'],
  '.github/prompts/': ['vscode-copilot', 'copilot-cli'],
  '.github/copilot-instructions.md': ['vscode-copilot', 'copilot-cli'],
  '.github/agents/': ['vscode-copilot', 'copilot-cli'],
}

/**
 * Resolve a path spec into an absolute path.
 * Project paths are resolved relative to `cwd`; global paths have their `~/` prefix
 * replaced with the actual home directory.
 *
 * @param {PathSpec} spec
 * @param {string} cwd
 * @param {boolean} isGlobal
 * @returns {string}
 */
function resolvePathSpec(spec, cwd, isGlobal) {
  if (isGlobal) {
    // Global paths are stored with a leading `~/`
    return resolve(join(homedir(), spec.path.replace(/^~\//, '')))
  }
  return resolve(join(cwd, spec.path))
}

/**
 * Build a PathStatus for one path spec.
 * For JSON files that exist, attempt to parse them; failure marks the path as unreadable.
 *
 * @param {PathSpec} spec
 * @param {string} absolutePath
 * @param {string[]} unreadable - Mutable array; unreadable paths are pushed here
 * @returns {PathStatus}
 */
function evaluatePathSpec(spec, absolutePath, unreadable) {
  const exists = existsSync(absolutePath)

  if (!exists) {
    return {path: absolutePath, exists: false, readable: false}
  }

  if (!spec.isJson) {
    return {path: absolutePath, exists: true, readable: true}
  }

  // JSON file — try to parse
  try {
    JSON.parse(readFileSync(absolutePath, 'utf8'))
    return {path: absolutePath, exists: true, readable: true}
  } catch {
    unreadable.push(absolutePath)
    return {path: absolutePath, exists: true, readable: false}
  }
}

/**
 * Compute the detection scope based on which path groups produced hits.
 *
 * @param {PathStatus[]} projectStatuses
 * @param {PathStatus[]} globalStatuses
 * @returns {'project'|'global'|'both'}
 */
function computeScope(projectStatuses, globalStatuses) {
  const hasProject = projectStatuses.some((s) => s.exists)
  const hasGlobal = globalStatuses.some((s) => s.exists)

  if (hasProject && hasGlobal) return 'both'
  if (hasGlobal) return 'global'
  return 'project'
}

/**
 * Scan the filesystem for each known AI coding environment and return only those
 * that were detected (i.e. at least one config path exists on disk).
 *
 * @param {string} [cwd] - Working directory for project-relative path resolution (defaults to process.cwd())
 * @returns {DetectedEnvironment[]} Detected environments only
 */
export function scanEnvironments(cwd = process.cwd()) {
  /** @type {DetectedEnvironment[]} */
  const detected = []

  for (const env of ENVIRONMENTS) {
    /** @type {string[]} */
    const unreadable = []

    const projectStatuses = env.projectPaths.map((spec) => {
      const absPath = resolvePathSpec(spec, cwd, false)
      return evaluatePathSpec(spec, absPath, unreadable)
    })

    const globalStatuses = env.globalPaths.map((spec) => {
      const absPath = resolvePathSpec(spec, cwd, true)
      return evaluatePathSpec(spec, absPath, unreadable)
    })

    const isDetected = [...projectStatuses, ...globalStatuses].some((s) => s.exists)

    if (!isDetected) continue

    detected.push({
      id: env.id,
      name: env.name,
      detected: true,
      projectPaths: projectStatuses,
      globalPaths: globalStatuses,
      unreadable,
      supportedCategories: env.supportedCategories,
      counts: {mcp: 0, command: 0, rule: 0, skill: 0, agent: 0},
      nativeCounts: {mcp: 0, command: 0, rule: 0, skill: 0, agent: 0},
      nativeEntries: [],
      driftedEntries: [],
      scope: computeScope(projectStatuses, globalStatuses),
    })
  }

  return detected
}

/**
 * Filter detected environments to those that support a given category type.
 *
 * @param {CategoryType} type - Category type to filter by
 * @param {DetectedEnvironment[]} detectedEnvs - Array of detected environments from {@link scanEnvironments}
 * @returns {EnvironmentId[]} IDs of environments that support the given type
 */
export function getCompatibleEnvironments(type, detectedEnvs) {
  return detectedEnvs.filter((env) => env.supportedCategories.includes(type)).map((env) => env.id)
}

/**
 * Count active entries from the AI config store that target a given environment,
 * grouped by category type.
 *
 * @param {EnvironmentId} envId - Environment to count entries for
 * @param {CategoryEntry[]} entries - All entries from the AI config store
 * @returns {CategoryCounts} Per-category active entry counts
 */
export function computeCategoryCounts(envId, entries) {
  /** @type {CategoryCounts} */
  const counts = {mcp: 0, command: 0, rule: 0, skill: 0, agent: 0}

  for (const entry of entries) {
    if (entry.active && entry.environments.includes(envId)) {
      counts[entry.type] = (counts[entry.type] ?? 0) + 1
    }
  }

  return counts
}

// ──────────────────────────────────────────────────────────────────────────────
// Native entry parsing (T006)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build a Set key for matching managed entries by name+type.
 * @param {string} name
 * @param {CategoryType} type
 * @returns {string}
 */
function managedKey(name, type) {
  return `${type}:${name}`
}

/**
 * Parse MCP entries from a JSON config file.
 * @param {string} filePath - Absolute path to the JSON file
 * @param {string} mcpKey - The key in the JSON that holds the MCP map (e.g. 'mcpServers', 'servers', 'context_servers')
 * @param {EnvironmentId} envId
 * @param {'project'|'global'} level
 * @param {Set<string>} managedSet - Set of 'type:name' keys to exclude
 * @returns {NativeEntry[]}
 */
function parseMCPsFromJson(filePath, mcpKey, envId, level, managedSet) {
  if (!existsSync(filePath)) return []
  try {
    const raw = readFileSync(filePath, 'utf8')
    const json = JSON.parse(raw)
    const section = json[mcpKey]
    if (!section || typeof section !== 'object') return []

    /** @type {NativeEntry[]} */
    const entries = []
    for (const [name, server] of Object.entries(section)) {
      if (managedSet.has(managedKey(name, 'mcp'))) continue
      const s = /** @type {any} */ (server)
      /** @type {NativeEntry} */
      const entry = {
        name,
        type: 'mcp',
        environmentId: envId,
        level,
        sourcePath: filePath,
        params: {
          transport: s.type ?? 'stdio',
          ...(s.command !== undefined ? {command: s.command} : {}),
          ...(s.args !== undefined ? {args: s.args} : {}),
          ...(s.env !== undefined ? {env: s.env} : {}),
          ...(s.url !== undefined ? {url: s.url} : {}),
        },
      }
      entries.push(entry)
    }
    return entries
  } catch {
    return []
  }
}

/**
 * Parse MCP entries from a YAML config file (Continue.dev format).
 * @param {string} filePath
 * @param {EnvironmentId} envId
 * @param {'project'|'global'} level
 * @param {Set<string>} managedSet
 * @returns {NativeEntry[]}
 */
function parseMCPsFromYaml(filePath, envId, level, managedSet) {
  if (!existsSync(filePath)) return []
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = /** @type {any} */ (yaml.load(raw) ?? {})
    const section = parsed.mcpServers
    if (!Array.isArray(section) && (typeof section !== 'object' || section === null)) return []

    /** @type {NativeEntry[]} */
    const entries = []
    const servers = Array.isArray(section) ? section : Object.entries(section).map(([k, v]) => ({name: k, .../** @type {any} */ (v)}))
    for (const server of servers) {
      const name = server.name ?? server.id ?? String(server)
      if (!name || managedSet.has(managedKey(name, 'mcp'))) continue
      /** @type {NativeEntry} */
      const entry = {
        name,
        type: 'mcp',
        environmentId: envId,
        level,
        sourcePath: filePath,
        params: {
          transport: server.transport ?? 'stdio',
          ...(server.command !== undefined ? {command: server.command} : {}),
          ...(server.args !== undefined ? {args: server.args} : {}),
          ...(server.env !== undefined ? {env: server.env} : {}),
          ...(server.url !== undefined ? {url: server.url} : {}),
        },
      }
      entries.push(entry)
    }
    return entries
  } catch {
    return []
  }
}

/**
 * Parse MCP entries from an OpenCode config file.
 * OpenCode uses a different format: key is `mcp`, command is an array,
 * env vars in `environment`, type is `local`/`remote`.
 * @param {string} filePath
 * @param {EnvironmentId} envId
 * @param {'project'|'global'} level
 * @param {Set<string>} managedSet
 * @returns {NativeEntry[]}
 */
function parseMCPsFromOpenCode(filePath, envId, level, managedSet) {
  if (!existsSync(filePath)) return []
  try {
    const raw = readFileSync(filePath, 'utf8')
    const json = JSON.parse(raw)
    const section = json.mcp
    if (!section || typeof section !== 'object') return []

    /** @type {NativeEntry[]} */
    const entries = []
    for (const [name, server] of Object.entries(section)) {
      if (managedSet.has(managedKey(name, 'mcp'))) continue
      const s = /** @type {any} */ (server)
      // OpenCode format: command is an array, environment instead of env, type is local/remote
      const cmdArr = Array.isArray(s.command) ? s.command : []
      const transport = s.type === 'remote' ? 'streamable-http' : 'stdio'
      /** @type {NativeEntry} */
      const entry = {
        name,
        type: 'mcp',
        environmentId: envId,
        level,
        sourcePath: filePath,
        params: {
          transport,
          ...(cmdArr.length > 0 ? {command: cmdArr[0]} : {}),
          ...(cmdArr.length > 1 ? {args: cmdArr.slice(1)} : {}),
          ...(s.environment !== undefined ? {env: s.environment} : {}),
          ...(s.url !== undefined ? {url: s.url} : {}),
        },
      }
      entries.push(entry)
    }
    return entries
  } catch {
    return []
  }
}

/**
 * Parse file-based entries (commands, rules, skills, agents) from a directory.
 * Each file in the directory becomes one native entry.
 * @param {string} dirPath - Absolute path to the directory
 * @param {EnvironmentId} envId
 * @param {CategoryType} type
 * @param {'project'|'global'} level
 * @param {Set<string>} managedSet
 * @param {RegExp} [filePattern] - Only include files matching this pattern (default: all files)
 * @returns {NativeEntry[]}
 */
function parseEntriesFromDir(dirPath, envId, type, level, managedSet, filePattern = /.*/) {
  if (!existsSync(dirPath)) return []
  try {
    const files = readdirSync(dirPath, {withFileTypes: true})
    /** @type {NativeEntry[]} */
    const entries = []
    for (const dirent of files) {
      if (!dirent.isFile()) continue
      if (!filePattern.test(dirent.name)) continue
      // Strip extension to get the entry name
      const name = dirent.name.replace(/\.[^.]+$/, '')
      if (!name || managedSet.has(managedKey(name, type))) continue
      entries.push({
        name,
        type,
        environmentId: envId,
        level,
        sourcePath: join(dirPath, dirent.name),
        params: {},
      })
    }
    return entries
  } catch {
    return []
  }
}

/**
 * Parse a single-file entry (e.g. CLAUDE.md, GEMINI.md, .rules).
 * @param {string} filePath - Absolute path to the file
 * @param {string} name - Entry name to use
 * @param {EnvironmentId} envId
 * @param {CategoryType} type
 * @param {'project'|'global'} level
 * @param {Set<string>} managedSet
 * @returns {NativeEntry[]}
 */
function parseSingleFileEntry(filePath, name, envId, type, level, managedSet) {
  if (!existsSync(filePath)) return []
  if (managedSet.has(managedKey(name, type))) return []
  return [{name, type, environmentId: envId, level, sourcePath: filePath, params: {}}]
}

/**
 * Parse all native entries for a single detected environment.
 * Returns items that exist in the environment's config files but are NOT managed by dvmi.
 * Managed entries are matched by name+type and excluded.
 *
 * @param {EnvironmentDef} envDef - The environment definition (from ENVIRONMENTS)
 * @param {string} cwd - Project working directory
 * @param {CategoryEntry[]} managedEntries - All entries from the AI config store
 * @returns {NativeEntry[]}
 */
export function parseNativeEntries(envDef, cwd, managedEntries) {
  const home = homedir()

  // Build a Set of 'type:name' strings for managed entries targeting this environment
  const managedSet = new Set(
    managedEntries
      .filter((e) => e.environments.includes(envDef.id))
      .map((e) => managedKey(e.name, e.type)),
  )

  /** @type {NativeEntry[]} */
  const result = []

  const id = envDef.id

  // ── MCPs ──
  switch (id) {
    case 'vscode-copilot':
      result.push(...parseMCPsFromJson(join(cwd, '.vscode', 'mcp.json'), 'servers', id, 'project', managedSet))
      break
    case 'claude-code':
      result.push(...parseMCPsFromJson(join(cwd, '.mcp.json'), 'mcpServers', id, 'project', managedSet))
      result.push(...parseMCPsFromJson(join(home, '.claude.json'), 'mcpServers', id, 'global', managedSet))
      break
    case 'claude-desktop':
      result.push(...parseMCPsFromJson(join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), 'mcpServers', id, 'global', managedSet))
      break
    case 'opencode':
      result.push(...parseMCPsFromOpenCode(join(cwd, 'opencode.json'), id, 'project', managedSet))
      result.push(...parseMCPsFromOpenCode(join(home, '.config', 'opencode', 'opencode.json'), id, 'global', managedSet))
      break
    case 'gemini-cli':
      result.push(...parseMCPsFromJson(join(home, '.gemini', 'settings.json'), 'mcpServers', id, 'global', managedSet))
      break
    case 'copilot-cli':
      result.push(...parseMCPsFromJson(join(home, '.copilot', 'mcp-config.json'), 'mcpServers', id, 'global', managedSet))
      break
    case 'cursor':
      result.push(...parseMCPsFromJson(join(cwd, '.cursor', 'mcp.json'), 'mcpServers', id, 'project', managedSet))
      result.push(...parseMCPsFromJson(join(home, '.cursor', 'mcp.json'), 'mcpServers', id, 'global', managedSet))
      break
    case 'windsurf':
      result.push(...parseMCPsFromJson(join(home, '.codeium', 'windsurf', 'mcp_config.json'), 'mcpServers', id, 'global', managedSet))
      break
    case 'continue-dev':
      result.push(...parseMCPsFromYaml(join(cwd, '.continue', 'config.yaml'), id, 'project', managedSet))
      result.push(...parseMCPsFromYaml(join(home, '.continue', 'config.yaml'), id, 'global', managedSet))
      break
    case 'zed':
      result.push(...parseMCPsFromJson(join(home, '.config', 'zed', 'settings.json'), 'context_servers', id, 'global', managedSet))
      break
    case 'amazon-q':
      result.push(...parseMCPsFromJson(join(cwd, '.amazonq', 'mcp.json'), 'mcpServers', id, 'project', managedSet))
      result.push(...parseMCPsFromJson(join(home, '.aws', 'amazonq', 'mcp.json'), 'mcpServers', id, 'global', managedSet))
      break
    default:
      break
  }

  // ── Commands ──
  if (envDef.supportedCategories.includes('command')) {
    switch (id) {
      case 'vscode-copilot':
      case 'copilot-cli':
        result.push(...parseEntriesFromDir(join(cwd, '.github', 'prompts'), id, 'command', 'project', managedSet, /\.prompt\.md$/))
        break
      case 'claude-code':
        result.push(...parseEntriesFromDir(join(cwd, '.claude', 'commands'), id, 'command', 'project', managedSet, /\.md$/))
        break
      case 'opencode':
        result.push(...parseEntriesFromDir(join(cwd, '.opencode', 'commands'), id, 'command', 'project', managedSet, /\.md$/))
        break
      case 'gemini-cli':
        result.push(...parseEntriesFromDir(join(home, '.gemini', 'commands'), id, 'command', 'global', managedSet, /\.toml$/))
        break
      case 'cursor':
        result.push(...parseEntriesFromDir(join(cwd, '.cursor', 'commands'), id, 'command', 'project', managedSet, /\.md$/))
        break
      case 'windsurf':
        result.push(...parseEntriesFromDir(join(cwd, '.windsurf', 'workflows'), id, 'command', 'project', managedSet, /\.md$/))
        break
      case 'continue-dev':
        result.push(...parseEntriesFromDir(join(cwd, '.continue', 'prompts'), id, 'command', 'project', managedSet, /\.md$/))
        break
      default:
        break
    }
  }

  // ── Rules ──
  if (envDef.supportedCategories.includes('rule')) {
    switch (id) {
      case 'vscode-copilot':
        result.push(...parseSingleFileEntry(join(cwd, '.github', 'copilot-instructions.md'), 'copilot-instructions', id, 'rule', 'project', managedSet))
        result.push(...parseEntriesFromDir(join(cwd, '.github', 'instructions'), id, 'rule', 'project', managedSet, /\.md$/))
        break
      case 'claude-code':
        result.push(...parseSingleFileEntry(join(cwd, 'CLAUDE.md'), 'CLAUDE', id, 'rule', 'project', managedSet))
        result.push(...parseEntriesFromDir(join(cwd, '.claude', 'rules'), id, 'rule', 'project', managedSet, /\.md$/))
        break
      case 'opencode':
        result.push(...parseSingleFileEntry(join(cwd, 'AGENTS.md'), 'AGENTS', id, 'rule', 'project', managedSet))
        break
      case 'gemini-cli':
        result.push(...parseSingleFileEntry(join(cwd, 'GEMINI.md'), 'GEMINI', id, 'rule', 'project', managedSet))
        result.push(...parseSingleFileEntry(join(home, '.gemini', 'GEMINI.md'), 'GEMINI', id, 'rule', 'global', managedSet))
        break
      case 'copilot-cli':
        result.push(...parseSingleFileEntry(join(cwd, '.github', 'copilot-instructions.md'), 'copilot-instructions', id, 'rule', 'project', managedSet))
        break
      case 'cursor':
        result.push(...parseEntriesFromDir(join(cwd, '.cursor', 'rules'), id, 'rule', 'project', managedSet, /\.mdc$/))
        break
      case 'windsurf':
        result.push(...parseEntriesFromDir(join(cwd, '.windsurf', 'rules'), id, 'rule', 'project', managedSet, /\.md$/))
        break
      case 'continue-dev':
        result.push(...parseEntriesFromDir(join(cwd, '.continue', 'rules'), id, 'rule', 'project', managedSet, /\.md$/))
        break
      case 'zed':
        result.push(...parseSingleFileEntry(join(cwd, '.rules'), '.rules', id, 'rule', 'project', managedSet))
        break
      case 'amazon-q':
        result.push(...parseEntriesFromDir(join(cwd, '.amazonq', 'rules'), id, 'rule', 'project', managedSet, /\.md$/))
        break
      default:
        break
    }
  }

  // ── Skills ──
  if (envDef.supportedCategories.includes('skill')) {
    switch (id) {
      case 'vscode-copilot': {
        // Skills are directories: .github/skills/<name>/SKILL.md
        const skillsDir = join(cwd, '.github', 'skills')
        if (existsSync(skillsDir)) {
          try {
            for (const dirent of readdirSync(skillsDir, {withFileTypes: true})) {
              if (!dirent.isDirectory()) continue
              const name = dirent.name
              if (managedSet.has(managedKey(name, 'skill'))) continue
              result.push({name, type: 'skill', environmentId: id, level: 'project', sourcePath: join(skillsDir, name, 'SKILL.md'), params: {}})
            }
          } catch { /* ignore */ }
        }
        break
      }
      case 'claude-code':
        result.push(...parseEntriesFromDir(join(cwd, '.claude', 'skills'), id, 'skill', 'project', managedSet, /\.md$/))
        break
      case 'opencode':
        result.push(...parseEntriesFromDir(join(cwd, '.opencode', 'skills'), id, 'skill', 'project', managedSet, /\.md$/))
        break
      case 'copilot-cli':
        result.push(...parseEntriesFromDir(join(home, '.copilot', 'skills'), id, 'skill', 'global', managedSet, /\.md$/))
        break
      case 'cursor':
        result.push(...parseEntriesFromDir(join(cwd, '.cursor', 'skills'), id, 'skill', 'project', managedSet, /\.md$/))
        break
      default:
        break
    }
  }

  // ── Agents ──
  if (envDef.supportedCategories.includes('agent')) {
    switch (id) {
      case 'vscode-copilot':
        result.push(...parseEntriesFromDir(join(cwd, '.github', 'agents'), id, 'agent', 'project', managedSet, /\.agent\.md$/))
        break
      case 'claude-code':
        result.push(...parseEntriesFromDir(join(cwd, '.claude', 'agents'), id, 'agent', 'project', managedSet, /\.md$/))
        break
      case 'opencode':
        result.push(...parseEntriesFromDir(join(cwd, '.opencode', 'agents'), id, 'agent', 'project', managedSet, /\.md$/))
        break
      case 'copilot-cli':
        result.push(...parseEntriesFromDir(join(home, '.copilot', 'agents'), id, 'agent', 'global', managedSet, /\.md$/))
        break
      case 'continue-dev':
        result.push(...parseEntriesFromDir(join(cwd, '.continue', 'agents'), id, 'agent', 'project', managedSet, /\.md$/))
        break
      case 'amazon-q':
        result.push(...parseEntriesFromDir(join(home, '.aws', 'amazonq', 'cli-agents'), id, 'agent', 'global', managedSet, /\.json$/))
        break
      default:
        break
    }
  }

  return result
}

// ──────────────────────────────────────────────────────────────────────────────
// Drift detection (T007)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Read the current value of an MCP entry from an environment's config file.
 * Returns null if the entry is not found or the file does not exist.
 * @param {string} entryName
 * @param {EnvironmentId} envId
 * @param {string} cwd
 * @param {'project'|'global'} [scope='project']
 * @returns {object|null}
 */
function readDeployedMCPEntry(entryName, envId, cwd, scope = 'project') {
  const home = homedir()

  /** @type {string|null} */
  let filePath = null
  /** @type {string} */
  let mcpKey = 'mcpServers'
  let isYaml = false

  switch (envId) {
    case 'vscode-copilot': filePath = join(cwd, '.vscode', 'mcp.json'); mcpKey = 'servers'; break
    case 'claude-code': filePath = scope === 'global' ? join(home, '.claude.json') : join(cwd, '.mcp.json'); break
    case 'opencode': filePath = scope === 'global' ? join(home, '.config', 'opencode', 'opencode.json') : join(cwd, 'opencode.json'); break
    case 'gemini-cli': filePath = join(home, '.gemini', 'settings.json'); break
    case 'copilot-cli': filePath = join(home, '.copilot', 'mcp-config.json'); break
    case 'cursor': filePath = scope === 'global' ? join(home, '.cursor', 'mcp.json') : join(cwd, '.cursor', 'mcp.json'); break
    case 'windsurf': filePath = join(home, '.codeium', 'windsurf', 'mcp_config.json'); break
    case 'continue-dev': filePath = scope === 'global' ? join(home, '.continue', 'config.yaml') : join(cwd, '.continue', 'config.yaml'); isYaml = true; break
    case 'zed': filePath = join(home, '.config', 'zed', 'settings.json'); mcpKey = 'context_servers'; break
    case 'amazon-q': filePath = scope === 'global' ? join(home, '.aws', 'amazonq', 'mcp.json') : join(cwd, '.amazonq', 'mcp.json'); break
    default: return null
  }

  if (!filePath || !existsSync(filePath)) return null

  try {
    const raw = readFileSync(filePath, 'utf8')
    if (isYaml) {
      const parsed = /** @type {any} */ (yaml.load(raw) ?? {})
      const section = parsed[mcpKey]
      if (!section) return null
      if (Array.isArray(section)) {
        const found = section.find((s) => /** @type {any} */ (s).name === entryName)
        return found ?? null
      }
      return section[entryName] ?? null
    }
    const json = JSON.parse(raw)
    return json[mcpKey]?.[entryName] ?? null
  } catch {
    return null
  }
}

/**
 * Read the current content of a file-based entry from an environment's config.
 * Returns null if the file does not exist.
 * @param {string} entryName
 * @param {import('../types.js').CategoryType} type
 * @param {EnvironmentId} envId
 * @param {string} cwd
 * @returns {string|null}
 */
function readDeployedFileEntry(entryName, type, envId, cwd) {
  const home = homedir()

  /** @type {string|null} */
  let filePath = null

  if (type === 'command') {
    switch (envId) {
      case 'vscode-copilot': case 'copilot-cli': filePath = join(cwd, '.github', 'prompts', `${entryName}.prompt.md`); break
      case 'claude-code': filePath = join(cwd, '.claude', 'commands', `${entryName}.md`); break
      case 'opencode': filePath = join(cwd, '.opencode', 'commands', `${entryName}.md`); break
      case 'gemini-cli': filePath = join(home, '.gemini', 'commands', `${entryName}.toml`); break
      case 'cursor': filePath = join(cwd, '.cursor', 'commands', `${entryName}.md`); break
      case 'windsurf': filePath = join(cwd, '.windsurf', 'workflows', `${entryName}.md`); break
      case 'continue-dev': filePath = join(cwd, '.continue', 'prompts', `${entryName}.md`); break
      default: return null
    }
  } else if (type === 'rule') {
    switch (envId) {
      case 'vscode-copilot': filePath = join(cwd, '.github', 'instructions', `${entryName}.md`); break
      case 'claude-code': filePath = join(cwd, '.claude', 'rules', `${entryName}.md`); break
      case 'cursor': filePath = join(cwd, '.cursor', 'rules', `${entryName}.mdc`); break
      case 'windsurf': filePath = join(cwd, '.windsurf', 'rules', `${entryName}.md`); break
      case 'continue-dev': filePath = join(cwd, '.continue', 'rules', `${entryName}.md`); break
      case 'amazon-q': filePath = join(cwd, '.amazonq', 'rules', `${entryName}.md`); break
      default: return null
    }
  } else if (type === 'skill') {
    switch (envId) {
      case 'vscode-copilot': filePath = join(cwd, '.github', 'skills', entryName, 'SKILL.md'); break
      case 'claude-code': filePath = join(cwd, '.claude', 'skills', `${entryName}.md`); break
      case 'opencode': filePath = join(cwd, '.opencode', 'skills', `${entryName}.md`); break
      case 'copilot-cli': filePath = join(home, '.copilot', 'skills', `${entryName}.md`); break
      case 'cursor': filePath = join(cwd, '.cursor', 'skills', `${entryName}.md`); break
      default: return null
    }
  } else if (type === 'agent') {
    switch (envId) {
      case 'vscode-copilot': filePath = join(cwd, '.github', 'agents', `${entryName}.agent.md`); break
      case 'claude-code': filePath = join(cwd, '.claude', 'agents', `${entryName}.md`); break
      case 'opencode': filePath = join(cwd, '.opencode', 'agents', `${entryName}.md`); break
      case 'copilot-cli': filePath = join(home, '.copilot', 'agents', `${entryName}.md`); break
      case 'continue-dev': filePath = join(cwd, '.continue', 'agents', `${entryName}.md`); break
      case 'amazon-q': filePath = join(home, '.aws', 'amazonq', 'cli-agents', `${entryName}.json`); break
      default: return null
    }
  }

  if (!filePath || !existsSync(filePath)) return null

  try {
    return readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

/**
 * Detect drift between managed entry expected state and actual file content.
 * For each active managed entry deployed to a detected environment, compares
 * the stored params against what is actually in the file.
 *
 * @param {DetectedEnvironment[]} detectedEnvs
 * @param {CategoryEntry[]} managedEntries
 * @param {string} [cwd]
 * @returns {DriftInfo[]}
 */
export function detectDrift(detectedEnvs, managedEntries, cwd = process.cwd()) {
  const detectedIds = new Set(detectedEnvs.map((e) => e.id))
  /** @type {DriftInfo[]} */
  const drifted = []

  for (const entry of managedEntries) {
    if (!entry.active) continue

    for (const envId of entry.environments) {
      if (!detectedIds.has(envId)) continue

      const params = /** @type {any} */ (entry.params)

      if (entry.type === 'mcp') {
        const actual = readDeployedMCPEntry(entry.name, envId, cwd, entry.scope || 'project')
        if (actual === null) continue // not deployed yet — not drift

        // Build expected server object — must match what buildMCPServerObject produces.
        // For stdio, type is omitted (environments infer it from command).
        const expected = {
          ...(params.command !== undefined ? {command: params.command} : {}),
          ...(params.args !== undefined ? {args: params.args} : {}),
          ...(params.env !== undefined ? {env: params.env} : {}),
          ...(params.url !== undefined ? {url: params.url} : {}),
          ...(params.transport && params.transport !== 'stdio' ? {type: params.transport} : {}),
        }

        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
          drifted.push({entryId: entry.id, environmentId: envId, expected, actual})
        }
      } else {
        const actual = readDeployedFileEntry(entry.name, entry.type, envId, cwd)
        if (actual === null) continue

        const expectedContent = params.content ?? params.instructions ?? ''
        if (expectedContent !== actual) {
          drifted.push({entryId: entry.id, environmentId: envId, expected: {content: expectedContent}, actual: {content: actual}})
        }
      }
    }
  }

  return drifted
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared config path grouping (T008)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Return groups of environment IDs that share the same config file for a given
 * category type. Each group is an array of EnvironmentIds. Groups with only one
 * environment are excluded.
 *
 * Used in the form's environment multi-select to auto-select related environments.
 *
 * @param {CategoryType} categoryType
 * @returns {EnvironmentId[][]}
 */
export function getSharedPathGroups(categoryType) {
  if (categoryType === 'mcp') {
    return [
      ['claude-code', 'copilot-cli'], // share .mcp.json
    ]
  }
  if (categoryType === 'command') {
    return [
      ['vscode-copilot', 'copilot-cli'], // share .github/prompts/
    ]
  }
  if (categoryType === 'rule') {
    return [
      ['vscode-copilot', 'copilot-cli'], // share .github/copilot-instructions.md
    ]
  }
  if (categoryType === 'agent') {
    return [
      ['vscode-copilot', 'copilot-cli'], // share .github/agents/
    ]
  }
  // skills, unknown types: no shared paths
  return []
}

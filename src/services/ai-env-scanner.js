/**
 * @module ai-env-scanner
 * Detects AI coding environments by scanning well-known project and global config paths.
 */

import {existsSync, readFileSync} from 'node:fs'
import {resolve, join} from 'node:path'
import {homedir} from 'node:os'

/** @import { CategoryType, EnvironmentId, PathStatus, CategoryCounts, DetectedEnvironment, CategoryEntry } from '../types.js' */

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
    supportedCategories: /** @type {CategoryType[]} */ (['mcp', 'command', 'skill', 'agent']),
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
    globalPaths: [],
    supportedCategories: /** @type {CategoryType[]} */ (['mcp', 'command', 'skill', 'agent']),
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
    ],
    globalPaths: [
      {path: '~/.config/opencode/opencode.json', isJson: true},
      {path: '~/.config/opencode/commands/', isJson: false},
      {path: '~/.config/opencode/agents/', isJson: false},
      {path: '~/.config/opencode/skills/', isJson: false},
    ],
    supportedCategories: /** @type {CategoryType[]} */ (['mcp', 'command', 'skill', 'agent']),
  },
  {
    id: /** @type {EnvironmentId} */ ('gemini-cli'),
    name: 'Gemini CLI',
    projectPaths: [{path: 'GEMINI.md', isJson: false}],
    globalPaths: [
      {path: '~/.gemini/settings.json', isJson: true},
      {path: '~/.gemini/commands/', isJson: false},
    ],
    supportedCategories: /** @type {CategoryType[]} */ (['mcp', 'command']),
  },
  {
    id: /** @type {EnvironmentId} */ ('copilot-cli'),
    name: 'GitHub Copilot CLI',
    projectPaths: [],
    globalPaths: [
      {path: '~/.copilot/config.json', isJson: true},
      {path: '~/.copilot/mcp-config.json', isJson: true},
      {path: '~/.copilot/agents/', isJson: false},
      {path: '~/.copilot/skills/', isJson: false},
      {path: '~/.copilot/copilot-instructions.md', isJson: false},
    ],
    supportedCategories: /** @type {CategoryType[]} */ (['mcp', 'command', 'skill', 'agent']),
  },
])

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
      counts: {mcp: 0, command: 0, skill: 0, agent: 0},
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
  const counts = {mcp: 0, command: 0, skill: 0, agent: 0}

  for (const entry of entries) {
    if (entry.active && entry.environments.includes(envId)) {
      counts[entry.type] = (counts[entry.type] ?? 0) + 1
    }
  }

  return counts
}

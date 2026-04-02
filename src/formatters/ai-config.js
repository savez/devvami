import chalk from 'chalk'

/** @import { DetectedEnvironment, CategoryEntry, NativeEntry } from '../types.js' */

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Pad a string to a fixed width, truncating with '…' if needed.
 * @param {string} str
 * @param {number} width
 * @returns {string}
 */
function padCell(str, width) {
  if (!str) str = ''
  if (str.length > width) return str.slice(0, width - 1) + '…'
  return str.padEnd(width)
}

// ──────────────────────────────────────────────────────────────────────────────
// Environments table formatter
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Format a list of detected environments as a table string for display in the TUI.
 * Columns: Environment (name), Status, Scope, MCPs, Commands, Skills, Agents
 * @param {DetectedEnvironment[]} detectedEnvs
 * @param {number} [termCols]
 * @returns {string[]} Array of formatted lines (no ANSI clear/home)
 */
export function formatEnvironmentsTable(detectedEnvs, termCols = 120) {
  const COL_ENV = 22
  const COL_STATUS = 24
  const COL_SCOPE = 8
  const COL_COUNT = 9

  const headerParts = [
    chalk.bold.white(padCell('Environment', COL_ENV)),
    chalk.bold.white(padCell('Status', COL_STATUS)),
    chalk.bold.white(padCell('Scope', COL_SCOPE)),
    chalk.bold.white(padCell('MCPs', COL_COUNT)),
    chalk.bold.white(padCell('Commands', COL_COUNT)),
    chalk.bold.white(padCell('Rules', COL_COUNT)),
    chalk.bold.white(padCell('Skills', COL_COUNT)),
    chalk.bold.white(padCell('Agents', COL_COUNT)),
  ]

  const dividerWidth = COL_ENV + COL_STATUS + COL_SCOPE + COL_COUNT * 5 + 7 * 2
  const lines = []
  lines.push(headerParts.join('  '))
  lines.push(chalk.dim('─'.repeat(Math.min(termCols, dividerWidth))))

  for (const env of detectedEnvs) {
    const hasUnreadable = env.unreadable.length > 0
    const statusText = hasUnreadable ? 'Detected (unreadable)' : 'Detected'
    const statusStr = hasUnreadable
      ? chalk.yellow(padCell(statusText, COL_STATUS))
      : chalk.green(padCell(statusText, COL_STATUS))
    const scopeStr = padCell(env.scope ?? 'project', COL_SCOPE)

    const mcpStr = padCell(String(env.nativeCounts?.mcp ?? 0), COL_COUNT)
    const cmdStr = padCell(String(env.nativeCounts?.command ?? 0), COL_COUNT)
    const ruleStr = env.supportedCategories.includes('rule')
      ? padCell(String(env.nativeCounts?.rule ?? 0), COL_COUNT)
      : padCell('—', COL_COUNT)
    const skillStr = env.supportedCategories.includes('skill')
      ? padCell(String(env.nativeCounts?.skill ?? 0), COL_COUNT)
      : padCell('—', COL_COUNT)
    const agentStr = env.supportedCategories.includes('agent')
      ? padCell(String(env.nativeCounts?.agent ?? 0), COL_COUNT)
      : padCell('—', COL_COUNT)

    lines.push([padCell(env.name, COL_ENV), statusStr, scopeStr, mcpStr, cmdStr, ruleStr, skillStr, agentStr].join('  '))
  }

  return lines
}

/** @type {Record<string, string>} */
const ENV_SHORT_NAMES = {
  'vscode-copilot': 'VSCode',
  'claude-code': 'Claude',
  opencode: 'OpenCode',
  'gemini-cli': 'Gemini',
  'copilot-cli': 'Copilot',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
  'continue-dev': 'Continue',
  zed: 'Zed',
  'amazon-q': 'Amazon Q',
}

/**
 * Mask an environment variable value for display.
 * Shows first 6 characters followed by ***.
 * @param {string} value
 * @returns {string}
 */
export function maskEnvVarValue(value) {
  if (!value || value.length <= 6) return '***'
  return value.slice(0, 6) + '***'
}

// ──────────────────────────────────────────────────────────────────────────────
// Native entries table formatter
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Format native entries as a table for display in a category tab's Native section.
 * @param {NativeEntry[]} entries
 * @param {number} [termCols]
 * @returns {string[]}
 */
export function formatNativeEntriesTable(entries, termCols = 120) {
  const COL_NAME = 24
  const COL_ENV = 16
  const COL_LEVEL = 8
  const COL_CONFIG = 36

  const headerParts = [
    chalk.bold.white(padCell('Name', COL_NAME)),
    chalk.bold.white(padCell('Environment', COL_ENV)),
    chalk.bold.white(padCell('Level', COL_LEVEL)),
    chalk.bold.white(padCell('Config', COL_CONFIG)),
  ]

  const dividerWidth = COL_NAME + COL_ENV + COL_LEVEL + COL_CONFIG + 3 * 2
  const lines = []
  lines.push(headerParts.join('  '))
  lines.push(chalk.dim('─'.repeat(Math.min(termCols, dividerWidth))))

  for (const entry of entries) {
    const envShort = ENV_SHORT_NAMES[entry.environmentId] ?? entry.environmentId
    const levelStr = padCell(entry.level, COL_LEVEL)

    // Build config summary
    const params = /** @type {any} */ (entry.params ?? {})
    let configSummary = ''
    if (entry.type === 'mcp') {
      if (params.command) {
        const args = Array.isArray(params.args) ? params.args.slice(0, 2).join(' ') : ''
        configSummary = [params.command, args].filter(Boolean).join(' ')
      } else if (params.url) {
        configSummary = params.url
      }
      // Mask env vars
      if (params.env && Object.keys(params.env).length > 0) {
        const maskedVars = Object.keys(params.env)
          .map((k) => `${k}=${maskEnvVarValue(params.env[k])}`)
          .join(', ')
        configSummary = configSummary ? `${configSummary} [${maskedVars}]` : maskedVars
      }
    } else {
      configSummary = params.description ?? params.content?.slice(0, 30) ?? ''
    }

    lines.push([
      padCell(entry.name, COL_NAME),
      padCell(envShort, COL_ENV),
      levelStr,
      padCell(configSummary, COL_CONFIG),
    ].join('  '))
  }

  return lines
}

// ──────────────────────────────────────────────────────────────────────────────
// Categories table formatter
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Format a list of category entries as a table string for display in the TUI.
 * Columns: Name, Type, Status, Environments
 * @param {CategoryEntry[]} entries
 * @param {number} [termCols]
 * @returns {string[]} Array of formatted lines (no ANSI clear/home)
 */
export function formatCategoriesTable(entries, termCols = 120) {
  const COL_NAME = 24
  const COL_TYPE = 9
  const COL_STATUS = 10
  const COL_ENVS = 36

  const headerParts = [
    chalk.bold.white(padCell('Name', COL_NAME)),
    chalk.bold.white(padCell('Type', COL_TYPE)),
    chalk.bold.white(padCell('Status', COL_STATUS)),
    chalk.bold.white(padCell('Environments', COL_ENVS)),
  ]

  const dividerWidth = COL_NAME + COL_TYPE + COL_STATUS + COL_ENVS + 3 * 2
  const lines = []
  lines.push(headerParts.join('  '))
  lines.push(chalk.dim('─'.repeat(Math.min(termCols, dividerWidth))))

  for (const entry of entries) {
    const statusStr = entry.active
      ? (/** @type {any} */ (entry)).drifted
        ? chalk.yellow(padCell('⚠ Drifted', COL_STATUS))
        : chalk.green(padCell('Active', COL_STATUS))
      : chalk.dim(padCell('Inactive', COL_STATUS))

    const envNames = entry.environments.map((id) => ENV_SHORT_NAMES[id] ?? id).join(', ')

    lines.push(
      [padCell(entry.name, COL_NAME), padCell(entry.type, COL_TYPE), statusStr, padCell(envNames, COL_ENVS)].join('  '),
    )
  }

  return lines
}

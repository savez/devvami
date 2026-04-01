import chalk from 'chalk'

/** @import { DetectedEnvironment, CategoryEntry } from '../types.js' */

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
    chalk.bold.white(padCell('Skills', COL_COUNT)),
    chalk.bold.white(padCell('Agents', COL_COUNT)),
  ]

  const dividerWidth = COL_ENV + COL_STATUS + COL_SCOPE + COL_COUNT * 4 + 6 * 2
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

    const mcpStr = padCell(String(env.counts.mcp), COL_COUNT)
    const cmdStr = padCell(String(env.counts.command), COL_COUNT)
    const skillStr = env.supportedCategories.includes('skill')
      ? padCell(String(env.counts.skill), COL_COUNT)
      : padCell('—', COL_COUNT)
    const agentStr = env.supportedCategories.includes('agent')
      ? padCell(String(env.counts.agent), COL_COUNT)
      : padCell('—', COL_COUNT)

    lines.push([padCell(env.name, COL_ENV), statusStr, scopeStr, mcpStr, cmdStr, skillStr, agentStr].join('  '))
  }

  return lines
}

// ──────────────────────────────────────────────────────────────────────────────
// Categories table formatter
// ──────────────────────────────────────────────────────────────────────────────

/** @type {Record<string, string>} */
const ENV_SHORT_NAMES = {
  'vscode-copilot': 'VSCode',
  'claude-code': 'Claude',
  opencode: 'OpenCode',
  'gemini-cli': 'Gemini',
  'copilot-cli': 'Copilot',
}

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
      ? chalk.green(padCell('Active', COL_STATUS))
      : chalk.dim(padCell('Inactive', COL_STATUS))

    const envNames = entry.environments.map((id) => ENV_SHORT_NAMES[id] ?? id).join(', ')

    lines.push(
      [padCell(entry.name, COL_NAME), padCell(entry.type, COL_TYPE), statusStr, padCell(envNames, COL_ENVS)].join('  '),
    )
  }

  return lines
}

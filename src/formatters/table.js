import chalk from 'chalk'

/**
 * @typedef {Object} TableColumn
 * @property {string} header - Column header text
 * @property {string} key - Key to extract from row object
 * @property {number} [width] - Fixed max column width (truncates with … if exceeded)
 * @property {function(*): string} [format] - Custom cell formatter (plain text, used for width calc)
 * @property {function(string): string} [colorize] - Chalk color applied to formatted value at render time
 */

/**
 * Truncate a string to max length, appending … if needed.
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
function truncate(str, max) {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + '…'
}

/**
 * Get the plain (no ANSI) formatted value for a cell.
 * @param {TableColumn} col
 * @param {*} rawVal
 * @returns {string}
 */
function plainCell(col, rawVal) {
  const formatted = col.format ? col.format(rawVal) : String(rawVal ?? '')
  return col.width ? truncate(formatted, col.width) : formatted
}

/**
 * Render a list of objects as a terminal table.
 * @param {Record<string, unknown>[]} rows
 * @param {TableColumn[]} columns
 * @returns {string}
 */
export function renderTable(rows, columns) {
  if (rows.length === 0) return ''

  // Calculate column widths from plain text (ANSI-safe)
  const widths = columns.map((col) => {
    if (col.width) return col.width
    const headerLen = col.header.length
    const maxDataLen = rows.reduce((max, row) => {
      return Math.max(max, plainCell(col, row[col.key]).length)
    }, 0)
    return Math.max(headerLen, maxDataLen)
  })

  // Header row
  const header = columns.map((col, i) => chalk.bold.white(col.header.padEnd(widths[i]))).join('  ')

  // Divider
  const divider = chalk.dim(widths.map((w) => '─'.repeat(w)).join('  '))

  // Data rows
  const dataRows = rows.map((row) =>
    columns
      .map((col, i) => {
        const plain = plainCell(col, row[col.key])
        const padding = ' '.repeat(Math.max(0, widths[i] - plain.length))
        const colored = col.colorize ? col.colorize(plain) : plain
        return colored + padding
      })
      .join('  '),
  )

  return [header, divider, ...dataRows].join('\n')
}

/**
 * Format a status value with color.
 * @param {'ok'|'warn'|'fail'|'pass'|'success'|'failure'|string} status
 * @returns {string}
 */
export function colorStatus(status) {
  const s = status?.toLowerCase() ?? ''
  if (['ok', 'pass', 'success', 'approved'].includes(s)) return chalk.green('✓')
  if (['warn', 'pending', 'in_progress', 'queued'].includes(s)) return chalk.yellow('⚠')
  if (['fail', 'failure', 'error', 'changes_requested'].includes(s)) return chalk.red('✗')
  return chalk.gray('○')
}

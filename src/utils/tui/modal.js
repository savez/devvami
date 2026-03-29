import chalk from 'chalk'
import { NVD_ATTRIBUTION } from '../../services/nvd.js'

// ──────────────────────────────────────────────────────────────────────────────
// ANSI escape sequences (re-declared locally — avoids cross-module coupling)
// ──────────────────────────────────────────────────────────────────────────────

const ANSI_CLEAR = '\x1b[2J'
const ANSI_HOME = '\x1b[H'

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Clamp a value between min and max (inclusive).
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max)
}

/**
 * Center a string within a fixed width, padding with spaces on both sides.
 * @param {string} text - Plain text (no ANSI codes)
 * @param {number} width
 * @returns {string}
 */
function centerText(text, width) {
  if (text.length >= width) return text.slice(0, width)
  const totalPad = width - text.length
  const left = Math.floor(totalPad / 2)
  const right = totalPad - left
  return ' '.repeat(left) + text + ' '.repeat(right)
}

// ──────────────────────────────────────────────────────────────────────────────
// T006: buildModalScreen
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build the full modal overlay screen string from the current interactive state.
 * Renders the modal content lines with a border, scroll indicators, and footer hints.
 * Prepends ANSI clear + home to replace the previous frame.
 * @param {import('./navigable-table.js').InteractiveTableState} state
 * @returns {string}
 */
export function buildModalScreen(state) {
  const { modalContent, modalScrollOffset, termRows, termCols, firstRefUrl } = state

  const lines = []

  // Modal inner width: leave 4 chars for left/right borders + padding
  const innerWidth = Math.max(20, termCols - 4)

  // ── Title bar ──────────────────────────────────────────────────────────────
  const titleText = 'CVE Detail'
  lines.push(chalk.bold.cyan('╔' + '═'.repeat(innerWidth + 2) + '╗'))
  lines.push(chalk.bold.cyan('║ ') + chalk.bold(centerText(titleText, innerWidth)) + chalk.bold.cyan(' ║'))
  lines.push(chalk.bold.cyan('╠' + '═'.repeat(innerWidth + 2) + '╣'))

  const BORDER_LINES = 3 // title bar: top + title + divider
  const FOOTER_LINES = 4 // empty + attribution + hints + bottom border
  const contentViewport = Math.max(1, termRows - BORDER_LINES - FOOTER_LINES)

  const content = modalContent ?? []
  const maxOffset = Math.max(0, content.length - contentViewport)
  const safeOffset = clamp(modalScrollOffset, 0, maxOffset)

  // ── Content lines ──────────────────────────────────────────────────────────
  const visibleLines = content.slice(safeOffset, safeOffset + contentViewport)
  for (const line of visibleLines) {
    // Truncate to inner width to avoid terminal wrapping
    const truncated = line.length > innerWidth ? line.slice(0, innerWidth - 1) + '…' : line
    lines.push(chalk.bold.cyan('║ ') + truncated.padEnd(innerWidth) + chalk.bold.cyan(' ║'))
  }
  // Pad to fill the content viewport
  for (let i = visibleLines.length; i < contentViewport; i++) {
    lines.push(chalk.bold.cyan('║ ') + ' '.repeat(innerWidth) + chalk.bold.cyan(' ║'))
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  lines.push(chalk.bold.cyan('╠' + '═'.repeat(innerWidth + 2) + '╣'))
  lines.push(chalk.bold.cyan('║ ') + chalk.dim(NVD_ATTRIBUTION).slice(0, innerWidth).padEnd(innerWidth) + chalk.bold.cyan(' ║'))

  const scrollHint = content.length > contentViewport ? '  ↑↓/PgUp/PgDn scroll' : ''
  const openHint = firstRefUrl ? '  o open ref' : ''
  const hintLine = `  ↑↓ scroll   Esc back to table   q exit${openHint}${scrollHint}`
  const truncHint = hintLine.length > innerWidth ? hintLine.slice(0, innerWidth - 1) + '…' : hintLine
  lines.push(chalk.bold.cyan('║ ') + chalk.dim(truncHint).padEnd(innerWidth) + chalk.bold.cyan(' ║'))
  lines.push(chalk.bold.cyan('╚' + '═'.repeat(innerWidth + 2) + '╝'))

  return ANSI_CLEAR + ANSI_HOME + lines.join('\n')
}

// ──────────────────────────────────────────────────────────────────────────────
// T007: buildLoadingScreen
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build a "loading detail" screen to display while a CVE detail fetch is in flight.
 * @param {string} cveId - The CVE identifier being fetched
 * @param {number} termRows - Current terminal height
 * @param {number} termCols - Current terminal width
 * @returns {string}
 */
export function buildLoadingScreen(cveId, termRows, termCols) {
  const lines = []
  const innerWidth = Math.max(20, termCols - 4)
  const midRow = Math.floor(termRows / 2)

  lines.push(chalk.bold.cyan('╔' + '═'.repeat(innerWidth + 2) + '╗'))

  for (let i = 1; i < midRow - 1; i++) {
    lines.push(chalk.bold.cyan('║ ') + ' '.repeat(innerWidth) + chalk.bold.cyan(' ║'))
  }

  const loadingText = `Loading ${cveId}…`
  const centred = centerText(loadingText, innerWidth)
  lines.push(chalk.bold.cyan('║ ') + chalk.yellow(centred) + chalk.bold.cyan(' ║'))

  const remaining = termRows - lines.length - 1
  for (let i = 0; i < remaining; i++) {
    lines.push(chalk.bold.cyan('║ ') + ' '.repeat(innerWidth) + chalk.bold.cyan(' ║'))
  }

  lines.push(chalk.bold.cyan('╚' + '═'.repeat(innerWidth + 2) + '╝'))

  return ANSI_CLEAR + ANSI_HOME + lines.join('\n')
}

// ──────────────────────────────────────────────────────────────────────────────
// T008: buildErrorScreen
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build an error modal screen displayed when a CVE detail fetch fails.
 * @param {string} cveId - The CVE identifier that failed to load
 * @param {string} errorMessage - The error message to display
 * @param {number} termRows - Current terminal height
 * @param {number} termCols - Current terminal width
 * @returns {string}
 */
export function buildErrorScreen(cveId, errorMessage, termRows, termCols) {
  const lines = []
  const innerWidth = Math.max(20, termCols - 4)
  const midRow = Math.floor(termRows / 2)

  lines.push(chalk.bold.cyan('╔' + '═'.repeat(innerWidth + 2) + '╗'))

  for (let i = 1; i < midRow - 2; i++) {
    lines.push(chalk.bold.cyan('║ ') + ' '.repeat(innerWidth) + chalk.bold.cyan(' ║'))
  }

  const titleText = `Failed to load ${cveId}`
  lines.push(chalk.bold.cyan('║ ') + chalk.red.bold(centerText(titleText, innerWidth)) + chalk.bold.cyan(' ║'))
  lines.push(chalk.bold.cyan('║ ') + ' '.repeat(innerWidth) + chalk.bold.cyan(' ║'))

  const truncErr =
    errorMessage.length > innerWidth ? errorMessage.slice(0, innerWidth - 1) + '…' : errorMessage
  lines.push(chalk.bold.cyan('║ ') + chalk.red(truncErr.padEnd(innerWidth)) + chalk.bold.cyan(' ║'))

  const remaining = termRows - lines.length - 2
  for (let i = 0; i < remaining; i++) {
    lines.push(chalk.bold.cyan('║ ') + ' '.repeat(innerWidth) + chalk.bold.cyan(' ║'))
  }

  const hintText = centerText('Press Esc to return to the table', innerWidth)
  lines.push(chalk.bold.cyan('║ ') + chalk.dim(hintText) + chalk.bold.cyan(' ║'))
  lines.push(chalk.bold.cyan('╚' + '═'.repeat(innerWidth + 2) + '╝'))

  return ANSI_CLEAR + ANSI_HOME + lines.join('\n')
}

// ──────────────────────────────────────────────────────────────────────────────
// T015: handleModalKeypress
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Pure state reducer for keypresses in the modal view.
 * Returns a new state on scroll, a control object on exit/back/open-url, or unchanged state.
 * @param {import('./navigable-table.js').InteractiveTableState} state
 * @param {{ name: string, ctrl?: boolean }} key - readline keypress event
 * @returns {
 *   import('./navigable-table.js').InteractiveTableState |
 *   { backToTable: true } |
 *   { exit: true } |
 *   { openUrl: string }
 * }
 */
export function handleModalKeypress(state, key) {
  const { modalContent, modalScrollOffset, termRows, firstRefUrl } = state

  if (key.ctrl && key.name === 'c') return { exit: true }
  if (key.name === 'q') return { exit: true }

  if (key.name === 'escape') return { backToTable: true }

  if (key.name === 'o' && firstRefUrl) return { openUrl: firstRefUrl }

  const contentLen = modalContent ? modalContent.length : 0
  const BORDER_LINES = 3
  const FOOTER_LINES = 4
  const contentViewport = Math.max(1, termRows - BORDER_LINES - FOOTER_LINES)
  const maxOffset = Math.max(0, contentLen - contentViewport)

  if (key.name === 'up') {
    return { ...state, modalScrollOffset: clamp(modalScrollOffset - 1, 0, maxOffset) }
  }
  if (key.name === 'down') {
    return { ...state, modalScrollOffset: clamp(modalScrollOffset + 1, 0, maxOffset) }
  }
  if (key.name === 'pageup') {
    return { ...state, modalScrollOffset: clamp(modalScrollOffset - contentViewport, 0, maxOffset) }
  }
  if (key.name === 'pagedown') {
    return { ...state, modalScrollOffset: clamp(modalScrollOffset + contentViewport, 0, maxOffset) }
  }

  return state // unrecognized key — no state change
}

import readline from 'node:readline'
import chalk from 'chalk'
import {NVD_ATTRIBUTION} from '../../services/nvd.js'
import {buildModalScreen, buildLoadingScreen, buildErrorScreen, handleModalKeypress} from './modal.js'
import {formatCveDetailPlain} from '../../formatters/vuln.js'
import {openBrowser} from '../open-browser.js'

// ──────────────────────────────────────────────────────────────────────────────
// ANSI escape sequences
// ──────────────────────────────────────────────────────────────────────────────

const ANSI_CLEAR = '\x1b[2J'
const ANSI_HOME = '\x1b[H'
const ANSI_ALT_SCREEN_ON = '\x1b[?1049h'
const ANSI_ALT_SCREEN_OFF = '\x1b[?1049l'
const ANSI_CURSOR_HIDE = '\x1b[?25l'
const ANSI_CURSOR_SHOW = '\x1b[?25h'
const ANSI_INVERSE_ON = '\x1b[7m'
const ANSI_INVERSE_OFF = '\x1b[27m'

// Screen layout constants
const HEADER_LINES = 4 // heading, empty, column headers, divider
const FOOTER_LINES = 3 // empty, NVD attribution, keyboard hints

// ──────────────────────────────────────────────────────────────────────────────
// Module-level terminal session state (reset on each startInteractiveTable call)
// ──────────────────────────────────────────────────────────────────────────────

let _cleanupCalled = false
let _altScreenActive = false
let _rawModeActive = false
/** @type {((...args: unknown[]) => void) | null} */
let _keypressListener = null

// ──────────────────────────────────────────────────────────────────────────────
// Typedefs
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TableColumnDef
 * @property {string} header - Column header text
 * @property {string} key - Key to read from the row object
 * @property {number} [width] - Maximum display width in characters
 * @property {(v: string) => string} [colorize] - Chalk color function applied after padding
 */

/**
 * @typedef {Object} InteractiveTableState
 * @property {Array<Record<string, string>>} rows - Pre-formatted row objects
 * @property {TableColumnDef[]} columns - Column definitions
 * @property {string} heading - Display heading (e.g. 'CVE Search: "openssl" (last 14 days)')
 * @property {number} totalResults - Total results from the API (may differ from rows.length)
 * @property {number} selectedIndex - 0-based index of the highlighted row
 * @property {number} scrollOffset - 0-based index of the first visible row (unused; derived from selectedIndex)
 * @property {number} viewportHeight - Number of data rows visible at once
 * @property {number} termRows - Current terminal height
 * @property {number} termCols - Current terminal width
 * @property {'table' | 'modal'} currentView - Active view
 * @property {number} modalScrollOffset - Scroll offset within modal content
 * @property {string[] | null} modalContent - Pre-rendered plain-text modal lines
 * @property {string | null} modalError - Error message if CVE detail fetch failed
 * @property {string | null} firstRefUrl - First reference URL for the currently open CVE
 */

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Return the visible (display) length of a string, stripping ANSI escape codes.
 * @param {string} str
 * @returns {number}
 */
function visibleLength(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length
}

/**
 * Pad a plain-text string to a fixed width, truncating with '…' if needed.
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
// T003: computeViewport
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Compute the viewport slice using a center-biased algorithm with edge clamping.
 * The selected row is kept roughly in the center of the visible area.
 * @param {number} selectedIndex - 0-based index of the highlighted row
 * @param {number} totalRows - Total number of rows in the data set
 * @param {number} viewportHeight - Number of rows visible at one time
 * @returns {{ startIndex: number, endIndex: number }}
 */
export function computeViewport(selectedIndex, totalRows, viewportHeight) {
  let startIndex = selectedIndex - Math.floor(viewportHeight / 2)
  startIndex = Math.max(0, startIndex)
  startIndex = Math.min(Math.max(0, totalRows - viewportHeight), startIndex)
  const endIndex = Math.min(startIndex + viewportHeight, totalRows)
  return {startIndex, endIndex}
}

// ──────────────────────────────────────────────────────────────────────────────
// T004: formatRow
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Render a single table row as a terminal string.
 * Pads each cell to its column width, applies the column's colorize function,
 * then wraps the whole line in ANSI inverse video if the row is selected.
 * @param {Record<string, string>} row - Pre-formatted row data
 * @param {TableColumnDef[]} columns - Column definitions
 * @param {number} termCols - Terminal width (unused; for future clamp support)
 * @param {boolean} isSelected - Whether to apply inverse-video highlight
 * @returns {string}
 */
export function formatRow(row, columns, termCols, isSelected) {
  const parts = []
  for (const col of columns) {
    const raw = String(row[col.key] ?? '')
    const width = col.width ?? 15
    const padded = padCell(raw, width)
    const colored = col.colorize ? col.colorize(padded) : padded
    parts.push(colored)
  }
  const line = parts.join('  ')
  if (isSelected) {
    return `${ANSI_INVERSE_ON}${line}${ANSI_INVERSE_OFF}`
  }
  return line
}

// ──────────────────────────────────────────────────────────────────────────────
// T005: buildTableScreen
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build the full table screen string from the current state.
 * Includes: heading + count, column headers, divider, visible rows, footer.
 * Prepends ANSI clear + home to replace the previous frame.
 * @param {InteractiveTableState} state
 * @returns {string}
 */
export function buildTableScreen(state) {
  const {rows, columns, heading, totalResults, selectedIndex, viewportHeight, termCols} = state
  const lines = []

  // ── Header ────────────────────────────────────────────────────────────────
  const headingStyled = chalk.bold(heading)
  const countStr = `Showing ${rows.length} of ${totalResults ?? rows.length} results`
  const countStyled = chalk.dim(countStr)
  const gap = Math.max(2, termCols - visibleLength(headingStyled) - visibleLength(countStyled))
  lines.push(headingStyled + ' '.repeat(gap) + countStyled)
  lines.push('')

  // ── Column headers ────────────────────────────────────────────────────────
  const headerParts = columns.map((col) => chalk.bold.white(padCell(col.header, col.width ?? 15)))
  lines.push(headerParts.join('  '))
  const dividerWidth = columns.reduce((sum, col) => sum + (col.width ?? 15), 0) + (columns.length - 1) * 2
  lines.push(chalk.dim('─'.repeat(Math.min(termCols, dividerWidth))))

  // ── Data rows ─────────────────────────────────────────────────────────────
  const {startIndex, endIndex} = computeViewport(selectedIndex, rows.length, viewportHeight)
  for (let i = startIndex; i < endIndex; i++) {
    lines.push(formatRow(rows[i], columns, termCols, i === selectedIndex))
  }
  // Pad remaining viewport if fewer rows than viewportHeight
  for (let i = endIndex - startIndex; i < viewportHeight; i++) {
    lines.push('')
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  lines.push('')
  lines.push(chalk.dim(NVD_ATTRIBUTION))
  lines.push(chalk.dim('  ↑↓ navigate   Enter view detail   Esc/q exit'))

  return ANSI_CLEAR + ANSI_HOME + lines.join('\n')
}

// ──────────────────────────────────────────────────────────────────────────────
// T010: createInteractiveTableState
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Create the initial InteractiveTableState for a new interactive session.
 * @param {Array<Record<string, string>>} rows - Pre-formatted row objects
 * @param {TableColumnDef[]} columns - Column definitions
 * @param {string} heading - Display heading
 * @param {number} totalResults - Total result count from the API
 * @param {number} termRows - Terminal height
 * @param {number} termCols - Terminal width
 * @returns {InteractiveTableState}
 */
export function createInteractiveTableState(rows, columns, heading, totalResults, termRows, termCols) {
  return {
    rows,
    columns,
    heading,
    totalResults,
    selectedIndex: 0,
    scrollOffset: 0,
    viewportHeight: Math.max(1, termRows - HEADER_LINES - FOOTER_LINES),
    termRows,
    termCols,
    currentView: 'table',
    modalScrollOffset: 0,
    modalContent: null,
    modalError: null,
    firstRefUrl: null,
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// T011: handleTableKeypress
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Pure state reducer for keypresses in the table view.
 * Returns a new state object on navigation, or a control object on exit/enter.
 * @param {InteractiveTableState} state
 * @param {{ name: string, ctrl?: boolean }} key - readline keypress event
 * @returns {InteractiveTableState | { exit: true }}
 */
export function handleTableKeypress(state, key) {
  const {selectedIndex, rows, viewportHeight} = state

  if (key.name === 'escape' || key.name === 'q') return {exit: true}
  if (key.ctrl && key.name === 'c') return {exit: true}

  if (key.name === 'return') {
    return {...state, currentView: 'modal'}
  }

  if (key.name === 'up') {
    return {...state, selectedIndex: Math.max(0, selectedIndex - 1)}
  }
  if (key.name === 'down') {
    return {...state, selectedIndex: Math.min(rows.length - 1, selectedIndex + 1)}
  }
  if (key.name === 'pageup') {
    return {...state, selectedIndex: Math.max(0, selectedIndex - viewportHeight)}
  }
  if (key.name === 'pagedown') {
    return {...state, selectedIndex: Math.min(rows.length - 1, selectedIndex + viewportHeight)}
  }

  return state // unrecognized key — no state change
}

// ──────────────────────────────────────────────────────────────────────────────
// T012: setupTerminal / cleanupTerminal
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Enter the alternate screen buffer, hide the cursor, and enable raw stdin keypresses.
 * @returns {void}
 */
export function setupTerminal() {
  _altScreenActive = true
  _rawModeActive = true
  process.stdout.write(ANSI_ALT_SCREEN_ON)
  process.stdout.write(ANSI_CURSOR_HIDE)
  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }
}

/**
 * Restore the terminal to its original state: leave alt screen, show cursor, disable raw mode.
 * Idempotent — safe to call multiple times.
 * @returns {void}
 */
export function cleanupTerminal() {
  if (_cleanupCalled) return
  _cleanupCalled = true

  if (_keypressListener) {
    process.stdin.removeListener('keypress', _keypressListener)
    _keypressListener = null
  }
  if (_rawModeActive && process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false)
    } catch {
      // ignore — stdin may already be closed
    }
    _rawModeActive = false
  }
  if (_altScreenActive) {
    process.stdout.write(ANSI_CURSOR_SHOW)
    process.stdout.write(ANSI_ALT_SCREEN_OFF)
    _altScreenActive = false
  }
  try {
    process.stdin.pause()
  } catch {
    // ignore
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// T013 + T014 + T016-T018: startInteractiveTable (orchestrator)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Start the interactive navigable table session.
 * Blocks until the user exits (Esc / q / Ctrl+C).
 * Manages the full lifecycle: terminal setup, keypress loop, modal overlay, cleanup.
 * @param {Array<Record<string, string>>} rows - Pre-formatted row objects
 * @param {TableColumnDef[]} columns - Column definitions
 * @param {string} heading - Display heading (search query + time window)
 * @param {number} totalResults - Total result count from the API
 * @param {(cveId: string) => Promise<import('../../types.js').CveDetail>} onOpenDetail - Async callback to fetch CVE detail
 * @returns {Promise<void>}
 */
export async function startInteractiveTable(rows, columns, heading, totalResults, onOpenDetail) {
  // Reset cleanup guard for a fresh session
  _cleanupCalled = false

  // Register process-level cleanup handlers
  const sigHandler = () => {
    cleanupTerminal()
    process.exit(0)
  }
  const exitHandler = () => {
    if (!_cleanupCalled) cleanupTerminal()
  }
  process.once('SIGINT', sigHandler)
  process.once('SIGTERM', sigHandler)
  process.once('exit', exitHandler)

  setupTerminal()

  /** @type {InteractiveTableState} */
  let state = createInteractiveTableState(
    rows,
    columns,
    heading,
    totalResults,
    process.stdout.rows || 24,
    process.stdout.columns || 80,
  )

  // Render initial table
  process.stdout.write(buildTableScreen(state))

  // Request ID to prevent stale fetch results from overwriting state
  let requestId = 0

  /**
   * Fetch CVE detail for the currently selected row, show loading, then modal or error.
   * @returns {Promise<void>}
   */
  async function openDetail() {
    const row = state.rows[state.selectedIndex]
    const cveId = row?.id

    if (!cveId) {
      // No CVE ID — check for an advisory URL (e.g. npm/pnpm advisory findings).
      // Open it in the browser and stay in table view rather than showing a modal.
      const advisoryUrl = row?.advisoryUrl
      if (advisoryUrl) {
        await openBrowser(String(advisoryUrl))
      }
      state = {...state, currentView: 'table'}
      process.stdout.write(buildTableScreen(state))
      return
    }

    const myRequestId = ++requestId
    process.stdout.write(buildLoadingScreen(cveId, state.termRows, state.termCols))

    try {
      const detail = await onOpenDetail(cveId)
      if (myRequestId !== requestId) return // user dismissed while loading

      const lines = formatCveDetailPlain(detail)
      const firstRef = detail.references?.[0]?.url ?? null
      state = {
        ...state,
        currentView: 'modal',
        modalContent: lines,
        modalError: null,
        modalScrollOffset: 0,
        firstRefUrl: firstRef,
      }
      process.stdout.write(buildModalScreen(state))
    } catch (err) {
      if (myRequestId !== requestId) return // user dismissed while loading
      state = {
        ...state,
        currentView: 'modal',
        modalContent: null,
        modalError: /** @type {Error} */ (err).message ?? 'Unknown error',
      }
      process.stdout.write(buildErrorScreen(cveId, state.modalError ?? 'Unknown error', state.termRows, state.termCols))
    }
  }

  // T014: terminal resize handler
  /** @returns {void} */
  function onResize() {
    const newRows = process.stdout.rows || 24
    const newCols = process.stdout.columns || 80
    state = {
      ...state,
      termRows: newRows,
      termCols: newCols,
      viewportHeight: Math.max(1, newRows - HEADER_LINES - FOOTER_LINES),
    }
    if (state.currentView === 'table') {
      process.stdout.write(buildTableScreen(state))
    } else if (state.modalContent) {
      process.stdout.write(buildModalScreen(state))
    } else if (state.modalError) {
      const cveId = state.rows[state.selectedIndex]?.id ?? ''
      process.stdout.write(buildErrorScreen(cveId, state.modalError, state.termRows, state.termCols))
    }
  }
  process.stdout.on('resize', onResize)

  return new Promise((resolve) => {
    /**
     * @param {string} _str @param {{ name: string, ctrl?: boolean }} key
     * @param {{ name: string, ctrl?: boolean }} key
     */
    const listener = async (_str, key) => {
      if (!key) return

      if (state.currentView === 'table') {
        const result = handleTableKeypress(state, key)

        if ('exit' in result) {
          process.stdout.removeListener('resize', onResize)
          process.removeListener('SIGINT', sigHandler)
          process.removeListener('SIGTERM', sigHandler)
          process.removeListener('exit', exitHandler)
          cleanupTerminal()
          resolve()
          return
        }

        state = /** @type {InteractiveTableState} */ (result)

        if (state.currentView === 'modal') {
          // Enter was pressed — fetch and display detail
          await openDetail()
        } else {
          process.stdout.write(buildTableScreen(state))
        }
      } else {
        // Modal view
        const result = handleModalKeypress(state, key)

        if ('backToTable' in result) {
          // Invalidate any in-flight fetch
          requestId++
          state = {
            ...state,
            currentView: 'table',
            modalContent: null,
            modalError: null,
            modalScrollOffset: 0,
            firstRefUrl: null,
          }
          process.stdout.write(buildTableScreen(state))
        } else if ('exit' in result) {
          process.stdout.removeListener('resize', onResize)
          process.removeListener('SIGINT', sigHandler)
          process.removeListener('SIGTERM', sigHandler)
          process.removeListener('exit', exitHandler)
          cleanupTerminal()
          resolve()
        } else if ('openUrl' in result) {
          await openBrowser(result.openUrl)
          // Redraw modal — stays visible
          if (state.modalContent) {
            process.stdout.write(buildModalScreen(state))
          }
        } else {
          state = /** @type {InteractiveTableState} */ (result)
          if (state.modalContent) {
            process.stdout.write(buildModalScreen(state))
          } else if (state.modalError) {
            const cveId = state.rows[state.selectedIndex]?.id ?? ''
            process.stdout.write(buildErrorScreen(cveId, state.modalError, state.termRows, state.termCols))
          }
        }
      }
    }

    _keypressListener = listener
    process.stdin.on('keypress', listener)
    process.stdin.resume()
  })
}

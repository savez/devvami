/**
 * @module tab-tui
 * Tab-based full-screen TUI framework for dvmi sync-config-ai.
 * Follows the same ANSI + readline + chalk pattern as navigable-table.js.
 * Zero new dependencies — uses only Node.js built-ins + chalk.
 */

import readline from 'node:readline'
import chalk from 'chalk'
import {
  buildFormScreen,
  handleFormKeypress,
  getMCPFormFields,
  getCommandFormFields,
  getRuleFormFields,
  getSkillFormFields,
  getAgentFormFields,
} from './form.js'

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

// ──────────────────────────────────────────────────────────────────────────────
// Layout constants
// ──────────────────────────────────────────────────────────────────────────────

const MIN_COLS = 80
const MIN_ROWS = 24
const TAB_BAR_LINES = 2 // tab bar line + divider
const FOOTER_LINES = 2 // empty line + keyboard hints

// ──────────────────────────────────────────────────────────────────────────────
// Module-level terminal session state
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
 * @typedef {Object} TabDef
 * @property {string} label - Display label shown in the tab bar
 * @property {string} key - Unique identifier for this tab
 */

/**
 * @typedef {Object} TabTUIState
 * @property {TabDef[]} tabs - All tabs
 * @property {number} activeTabIndex - Index of the currently active tab
 * @property {number} termRows - Current terminal height
 * @property {number} termCols - Current terminal width
 * @property {number} contentViewportHeight - Usable content lines (termRows - TAB_BAR_LINES - FOOTER_LINES)
 * @property {boolean} tooSmall - Whether the terminal is below minimum size
 */

/**
 * @typedef {Object} EnvTabState
 * @property {import('../../types.js').DetectedEnvironment[]} envs - Detected environments
 * @property {number} selectedIndex - Highlighted row
 */

/**
 * @typedef {Object} CatTabState
 * @property {import('../../types.js').CategoryEntry[]} entries - Managed entries for this category type
 * @property {import('../../types.js').NativeEntry[]} nativeEntries - Native (unmanaged) entries for this category type
 * @property {number} selectedIndex - Highlighted row in the active section
 * @property {'native'|'managed'} section - Which section is focused
 * @property {'list'|'form'|'confirm-delete'|'drift'} mode - Current sub-mode
 * @property {import('./form.js').FormState|null} formState - Active form state (null when mode is 'list')
 * @property {string|null} confirmDeleteId - Entry id pending deletion confirmation
 * @property {string} chezmoidTip - Footer tip (empty if chezmoi configured)
 * @property {string|null} revealedEntryId - Entry id whose env vars are currently revealed
 * @property {import('../../types.js').DriftInfo[]} driftInfos - All drift infos for this category
 */

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// T017: buildTabBar — renders horizontal tab bar
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build the tab bar string (one line of tab labels + a divider line).
 * Active tab is highlighted with inverse video.
 * @param {TabDef[]} tabs
 * @param {number} activeIndex
 * @returns {string[]} Two lines: [tabBarLine, divider]
 */
export function buildTabBar(tabs, activeIndex) {
  const parts = tabs.map((tab, i) => {
    const label = ` ${tab.label} `
    if (i === activeIndex) {
      return `${ANSI_INVERSE_ON}${label}${ANSI_INVERSE_OFF}`
    }
    return chalk.dim(label)
  })
  const tabBarLine = parts.join(chalk.dim('│'))
  const divider = chalk.dim('─'.repeat(60))
  return [tabBarLine, divider]
}

// ──────────────────────────────────────────────────────────────────────────────
// T017: buildTabScreen — full screen composition
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Compose the full terminal screen from tab bar, content lines, and footer.
 * Prepends ANSI clear + home to replace the previous frame.
 * @param {string[]} tabBarLines - Output of buildTabBar
 * @param {string[]} contentLines - Tab-specific content lines
 * @param {string[]} footerLines - Footer hint lines
 * @param {number} termRows - Terminal height
 * @returns {string}
 */
export function buildTabScreen(tabBarLines, contentLines, footerLines, termRows) {
  const lines = [...tabBarLines, ...contentLines]

  // Pad to fill terminal height minus footer
  const targetContentLines = termRows - tabBarLines.length - footerLines.length
  while (lines.length < targetContentLines) {
    lines.push('')
  }

  lines.push(...footerLines)
  return ANSI_CLEAR + ANSI_HOME + lines.join('\n')
}

// ──────────────────────────────────────────────────────────────────────────────
// T018: terminal size check
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build a "terminal too small" warning screen.
 * @param {number} termRows
 * @param {number} termCols
 * @returns {string}
 */
export function buildTooSmallScreen(termRows, termCols) {
  const lines = []
  const midRow = Math.floor(termRows / 2)

  for (let i = 0; i < midRow - 1; i++) lines.push('')

  lines.push(chalk.red.bold(`  Terminal too small (${termCols}×${termRows}, minimum: ${MIN_COLS}×${MIN_ROWS})`))
  lines.push(chalk.dim('  Resize your terminal window and try again.'))

  return ANSI_CLEAR + ANSI_HOME + lines.join('\n')
}

// ──────────────────────────────────────────────────────────────────────────────
// T020: buildEnvironmentsTab — content builder
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build the content lines for the Environments tab.
 * @param {import('../../types.js').DetectedEnvironment[]} envs - Detected environments
 * @param {number} selectedIndex - Currently highlighted row
 * @param {number} viewportHeight - Available content lines
 * @param {import('../../formatters/ai-config.js').formatEnvironmentsTable} formatFn - Formatter function
 * @param {number} termCols - Terminal width for formatter
 * @returns {string[]}
 */
export function buildEnvironmentsTab(envs, selectedIndex, viewportHeight, formatFn, termCols = 120) {
  if (envs.length === 0) {
    return [
      '',
      chalk.dim('  No AI coding environments detected.'),
      chalk.dim('  Ensure at least one AI tool is configured in the current project or globally.'),
    ]
  }

  const tableLines = formatFn(envs, termCols)

  // Add row highlighting to data rows (skip header lines — first 2 lines are header + divider)
  const HEADER_LINES = 2
  const resultLines = []

  for (let i = 0; i < tableLines.length; i++) {
    const line = tableLines[i]
    const dataIndex = i - HEADER_LINES
    if (dataIndex >= 0 && dataIndex === selectedIndex) {
      resultLines.push(`${ANSI_INVERSE_ON}${line}${ANSI_INVERSE_OFF}`)
    } else {
      resultLines.push(line)
    }
  }

  // Viewport: only show lines that fit
  return resultLines.slice(0, viewportHeight)
}

// ──────────────────────────────────────────────────────────────────────────────
// T021: handleEnvironmentsKeypress — pure reducer
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Pure state reducer for keypresses in the Environments tab.
 * @param {EnvTabState} state
 * @param {{ name: string, ctrl?: boolean }} key
 * @returns {EnvTabState | { exit: true } | { switchTab: number }}
 */
export function handleEnvironmentsKeypress(state, key) {
  const {selectedIndex, envs} = state
  const maxIndex = Math.max(0, envs.length - 1)

  if (key.name === 'up' || key.name === 'k') {
    return {...state, selectedIndex: Math.max(0, selectedIndex - 1)}
  }
  if (key.name === 'down' || key.name === 'j') {
    return {...state, selectedIndex: Math.min(maxIndex, selectedIndex + 1)}
  }
  if (key.name === 'pageup') {
    return {...state, selectedIndex: Math.max(0, selectedIndex - 10)}
  }
  if (key.name === 'pagedown') {
    return {...state, selectedIndex: Math.min(maxIndex, selectedIndex + 10)}
  }

  return state
}

// ──────────────────────────────────────────────────────────────────────────────
// Categories tab content builder — dual Native/Managed sections
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build the content lines for a category tab with Native and Managed sections.
 * @param {CatTabState} tabState
 * @param {number} viewportHeight
 * @param {import('../../formatters/ai-config.js').formatCategoriesTable} formatManaged
 * @param {import('../../formatters/ai-config.js').formatNativeEntriesTable} formatNative
 * @param {number} termCols
 * @returns {string[]}
 */
export function buildCategoriesTab(tabState, viewportHeight, formatManaged, formatNative, termCols = 120) {
  const {entries, nativeEntries = [], selectedIndex, section = 'managed', mode} = tabState
  const confirmDeleteName = tabState._confirmDeleteName ?? null
  const driftedIds = new Set((tabState.driftInfos ?? []).map((d) => d.entryId))

  const lines = []

  // ── Native section ──
  if (nativeEntries.length > 0) {
    lines.push(chalk.bold.cyan('  ── Native (read-only) ──────────────────────────────'))

    const nativeLines = formatNative(nativeEntries, termCols)
    const HEADER = 2
    for (let i = 0; i < nativeLines.length; i++) {
      const dataIndex = i - HEADER
      if (section === 'native' && dataIndex >= 0 && dataIndex === selectedIndex) {
        lines.push(`${ANSI_INVERSE_ON}${nativeLines[i]}${ANSI_INVERSE_OFF}`)
      } else {
        lines.push(chalk.dim(nativeLines[i]))
      }
    }
    lines.push('')
  }

  // ── Managed section ──
  lines.push(chalk.bold.white('  ── Managed ────────────────────────────────────────'))

  if (entries.length === 0) {
    lines.push(chalk.dim('  No managed entries yet.'))
    lines.push(chalk.dim('  Press ' + chalk.bold('n') + ' to create your first entry.'))
  } else {
    // Annotate entries with drift flag for formatter
    const annotated = entries.map((e) => ({...e, drifted: driftedIds.has(e.id)}))
    const tableLines = formatManaged(annotated, termCols)
    const HEADER_LINES = 2
    for (let i = 0; i < tableLines.length; i++) {
      const dataIndex = i - HEADER_LINES
      if (section === 'managed' && dataIndex >= 0 && dataIndex === selectedIndex) {
        lines.push(`${ANSI_INVERSE_ON}${tableLines[i]}${ANSI_INVERSE_OFF}`)
      } else {
        lines.push(tableLines[i])
      }
    }
  }

  // Confirmation prompt
  if (mode === 'confirm-delete' && confirmDeleteName) {
    lines.push('')
    lines.push(chalk.red(`  Delete "${confirmDeleteName}"? This cannot be undone. `) + chalk.bold('[y/N]'))
  }

  return lines.slice(0, viewportHeight)
}

/**
 * Build content lines for the legacy single-section categories tab.
 * Kept for backward compatibility in tests.
 * @param {import('../../types.js').CategoryEntry[]} entries
 * @param {number} selectedIndex
 * @param {number} viewportHeight
 * @param {import('../../formatters/ai-config.js').formatCategoriesTable} formatFn
 * @param {number} termCols
 * @param {string|null} [confirmDeleteName]
 * @returns {string[]}
 */
export function buildCategoriesTabLegacy(entries, selectedIndex, viewportHeight, formatFn, termCols = 120, confirmDeleteName = null) {
  if (entries.length === 0) {
    const lines = [
      '',
      chalk.dim('  No configuration entries yet.'),
      chalk.dim('  Press ' + chalk.bold('n') + ' to create your first entry.'),
    ]
    if (confirmDeleteName === null) return lines
  }

  const tableLines = formatFn(entries, termCols)
  const HEADER_LINES = 2
  const resultLines = []

  for (let i = 0; i < tableLines.length; i++) {
    const line = tableLines[i]
    const dataIndex = i - HEADER_LINES
    if (dataIndex >= 0 && dataIndex === selectedIndex) {
      resultLines.push(`${ANSI_INVERSE_ON}${line}${ANSI_INVERSE_OFF}`)
    } else {
      resultLines.push(line)
    }
  }

  if (confirmDeleteName !== null) {
    resultLines.push('')
    resultLines.push(chalk.red(`  Delete "${confirmDeleteName}"? This cannot be undone. `) + chalk.bold('[y/N]'))
  }

  return resultLines.slice(0, viewportHeight)
}

// ──────────────────────────────────────────────────────────────────────────────
// Drift resolution screen
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build the drift resolution screen for a drifted managed entry.
 * @param {CatTabState} tabState
 * @param {number} viewportHeight
 * @param {number} termCols
 * @returns {string[]}
 */
export function buildDriftScreen(tabState, viewportHeight, termCols) {
  const entryId = tabState._driftEntryId
  const drift = (tabState.driftInfos ?? []).find((d) => d.entryId === entryId)
  const entry = (tabState.entries ?? []).find((e) => e.id === entryId)

  if (!drift || !entry) {
    return [chalk.dim('  No drift info available.')]
  }

  const lines = []
  lines.push(chalk.bold.yellow(`  ⚠ Drift detected: ${entry.name}`))
  lines.push(chalk.dim('─'.repeat(Math.min(termCols, 70))))
  lines.push('')
  lines.push(chalk.bold('  Expected (managed):'))
  const expected = JSON.stringify(drift.expected, null, 2)
  for (const l of expected.split('\n').slice(0, 8)) {
    lines.push(chalk.green(`    ${l}`))
  }
  lines.push('')
  lines.push(chalk.bold('  Actual (on disk):'))
  const actual = JSON.stringify(drift.actual, null, 2)
  for (const l of actual.split('\n').slice(0, 8)) {
    lines.push(chalk.red(`    ${l}`))
  }
  lines.push('')
  lines.push(chalk.dim('  Press r to re-deploy (overwrite file)   a to accept changes (update store)   Esc to go back'))

  return lines.slice(0, viewportHeight)
}

/**
 * Minimal fallback formatter for native entries (no chalk dependency at module load).
 * Used only when formatNative is not provided to startTabTUI.
 * @param {import('../../types.js').NativeEntry[]} entries
 * @returns {string[]}
 */
function formatNativeEntriesTableFallback(entries) {
  const lines = ['  Name                     Environment  Level   Config', '  ' + '─'.repeat(60)]
  for (const e of entries) {
    lines.push(`  ${e.name.padEnd(25)} ${e.environmentId.padEnd(13)} ${e.level.padEnd(8)} ${e.sourcePath}`)
  }
  return lines
}

// ──────────────────────────────────────────────────────────────────────────────
// Categories tab keypress reducer (T037)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Pure state reducer for keypresses in the Categories tab list mode.
 * @param {CatTabState} state
 * @param {{ name: string, ctrl?: boolean, sequence?: string }} key
 * @returns {CatTabState | { exit: true }}
 */
export function handleCategoriesKeypress(state, key) {
  const {selectedIndex, entries, nativeEntries = [], section = 'managed', mode} = state
  const activeList = section === 'native' ? nativeEntries : entries
  const maxIndex = Math.max(0, activeList.length - 1)

  // Confirm-delete mode
  if (mode === 'confirm-delete') {
    if (key.name === 'y') {
      return {...state, mode: 'list', _deleteConfirmed: true}
    }
    // Any other key cancels
    return {...state, mode: 'list', confirmDeleteId: null}
  }

  // Drift resolution mode
  if (mode === 'drift') {
    if (key.name === 'escape') return {...state, mode: 'list'}
    if (key.name === 'r') return {...state, mode: 'list', _redeploy: state._driftEntryId, _driftEntryId: null}
    if (key.name === 'a') return {...state, mode: 'list', _acceptDrift: state._driftEntryId, _driftEntryId: null}
    return state
  }

  // Navigation — clears env var reveal on any movement
  if (key.name === 'up' || key.name === 'k') {
    return {...state, selectedIndex: Math.max(0, selectedIndex - 1), revealedEntryId: null}
  }
  if (key.name === 'down' || key.name === 'j') {
    return {...state, selectedIndex: Math.min(maxIndex, selectedIndex + 1), revealedEntryId: null}
  }
  if (key.name === 'pageup') {
    return {...state, selectedIndex: Math.max(0, selectedIndex - 10), revealedEntryId: null}
  }
  if (key.name === 'pagedown') {
    return {...state, selectedIndex: Math.min(maxIndex, selectedIndex + 10), revealedEntryId: null}
  }

  // Native section actions
  if (section === 'native') {
    if (key.name === 'i' && nativeEntries.length > 0) {
      const nativeEntry = nativeEntries[selectedIndex]
      if (nativeEntry) return {...state, _importNative: nativeEntry}
    }
    return state
  }

  // Managed section actions
  if (key.name === 'n') {
    return {...state, mode: 'form', _action: 'create'}
  }
  if (key.name === 'return' && entries.length > 0) {
    const entry = entries[selectedIndex]
    if (entry) {
      const driftedIds = new Set((state.driftInfos ?? []).map((d) => d.entryId))
      if (driftedIds.has(entry.id)) {
        return {...state, mode: 'drift', _driftEntryId: entry.id}
      }
      return {...state, mode: 'form', _action: 'edit', _editId: entry.id}
    }
  }
  if (key.name === 'd' && entries.length > 0) {
    return {...state, _toggleId: entries[selectedIndex]?.id}
  }
  if ((key.name === 'delete' || key.name === 'backspace') && entries.length > 0) {
    const entry = entries[selectedIndex]
    if (entry) {
      return {...state, mode: 'confirm-delete', confirmDeleteId: entry.id, _confirmDeleteName: entry.name}
    }
  }
  // r — reveal/hide env vars for the selected MCP entry
  if (key.name === 'r' && entries.length > 0) {
    const entry = entries[selectedIndex]
    if (entry?.type === 'mcp') {
      return {...state, revealedEntryId: state.revealedEntryId === entry.id ? null : entry.id}
    }
  }

  return state
}

// ──────────────────────────────────────────────────────────────────────────────
// Terminal lifecycle management
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Enter the alternate screen buffer, hide the cursor, and enable raw stdin keypresses.
 * @returns {void}
 */
export function setupTerminal() {
  _cleanupCalled = false
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
 * Restore the terminal to its original state.
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
      /* ignore */
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
    /* ignore */
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// T016: startTabTUI — main orchestrator
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TabTUIOptions
 * @property {import('../../types.js').DetectedEnvironment[]} envs - Detected environments (from scanner)
 * @property {import('../../types.js').CategoryEntry[]} entries - All category entries (from store)
 * @property {boolean} chezmoiEnabled - Whether chezmoi is configured
 * @property {(action: object) => Promise<void>} onAction - Callback for CRUD actions from category tabs
 * @property {import('../../formatters/ai-config.js').formatEnvironmentsTable} formatEnvs - Environments table formatter
 * @property {import('../../formatters/ai-config.js').formatCategoriesTable} formatCats - Categories table formatter
 * @property {import('../../formatters/ai-config.js').formatNativeEntriesTable} [formatNative] - Native entries table formatter
 * @property {(() => Promise<import('../../types.js').CategoryEntry[]>) | undefined} [refreshEntries] - Reload entries from store after mutations
 */

/**
 * Start the interactive tab TUI session.
 * Blocks until the user exits (Esc / q / Ctrl+C).
 * Manages the full TUI lifecycle: terminal setup, keypress loop, tab switching, cleanup.
 *
 * @param {TabTUIOptions} opts
 * @returns {Promise<void>}
 */
export async function startTabTUI(opts) {
  const {envs, onAction, formatEnvs, formatCats, formatNative} = opts
  const {entries: initialEntries, chezmoiEnabled} = opts

  _cleanupCalled = false

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

  const tabs = [
    {label: 'Environments', key: 'environments'},
    {label: 'MCPs', key: 'mcp'},
    {label: 'Commands', key: 'command'},
    {label: 'Rules', key: 'rule'},
    {label: 'Skills', key: 'skill'},
    {label: 'Agents', key: 'agent'},
  ]

  const CATEGORY_TYPES = ['mcp', 'command', 'rule', 'skill', 'agent']
  const chezmoidTip = chezmoiEnabled ? '' : 'Tip: Run `dvmi dotfiles setup` to enable automatic backup of your AI configs'

  /** @type {TabTUIState} */
  let tuiState = {
    tabs,
    activeTabIndex: 0,
    termRows: process.stdout.rows || 24,
    termCols: process.stdout.columns || 80,
    contentViewportHeight: Math.max(1, (process.stdout.rows || 24) - TAB_BAR_LINES - FOOTER_LINES),
    tooSmall: (process.stdout.columns || 80) < MIN_COLS || (process.stdout.rows || 24) < MIN_ROWS,
  }

  /** @type {EnvTabState} */
  let envState = {envs, selectedIndex: 0}

  /** @type {import('../../types.js').CategoryEntry[]} */
  let allEntries = [...initialEntries]

  /** Aggregate all drift infos from detected envs (flat list). */
  const allDriftInfos = envs.flatMap((e) => e.driftedEntries ?? [])

  /**
   * @param {string} type
   * @returns {import('../../types.js').NativeEntry[]}
   */
  function getNativesByType(type) {
    return envs.flatMap((e) => (e.nativeEntries ?? []).filter((ne) => ne.type === type))
  }

  /**
   * @param {string} type
   * @returns {import('../../types.js').DriftInfo[]}
   */
  function getDriftsByType(type) {
    const ids = new Set(allEntries.filter((e) => e.type === type).map((e) => e.id))
    return allDriftInfos.filter((d) => ids.has(d.entryId))
  }

  /** @type {Record<string, CatTabState>} */
  let catTabStates = Object.fromEntries(
    CATEGORY_TYPES.map((type) => [
      type,
      /** @type {CatTabState} */ ({
        entries: allEntries.filter((e) => e.type === type),
        nativeEntries: getNativesByType(type),
        selectedIndex: 0,
        section: 'managed',
        mode: 'list',
        formState: null,
        confirmDeleteId: null,
        chezmoidTip,
        revealedEntryId: null,
        driftInfos: getDriftsByType(type),
      }),
    ]),
  )

  /** Push filtered entries and drift infos into each tab state — call after allEntries changes. */
  function syncTabEntries() {
    for (const type of CATEGORY_TYPES) {
      const entriesForType = allEntries.filter((e) => e.type === type)
      const driftsForType = getDriftsByType(type)
      catTabStates = {
        ...catTabStates,
        [type]: {...catTabStates[type], entries: entriesForType, driftInfos: driftsForType},
      }
    }
  }

  setupTerminal()

  /**
   * Build and render the current frame.
   * @returns {void}
   */
  function render() {
    const {termRows, termCols, activeTabIndex, tooSmall, contentViewportHeight} = tuiState

    if (tooSmall) {
      process.stdout.write(buildTooSmallScreen(termRows, termCols))
      return
    }

    const tabBarLines = buildTabBar(tabs, activeTabIndex)
    let contentLines
    let hintStr

    if (activeTabIndex === 0) {
      contentLines = buildEnvironmentsTab(
        envState.envs,
        envState.selectedIndex,
        contentViewportHeight,
        formatEnvs,
        termCols,
      )
      hintStr = chalk.dim('  ↑↓ navigate   Tab switch tabs   q exit')
    } else {
      const tabKey = tabs[activeTabIndex].key
      const tabState = catTabStates[tabKey]

      if (tabState.mode === 'form' && tabState.formState) {
        contentLines = buildFormScreen(tabState.formState, contentViewportHeight, termCols)
        hintStr = chalk.dim('  Tab next field   Shift+Tab prev   Ctrl+S save   Esc cancel')
      } else if (tabState.mode === 'drift') {
        contentLines = buildDriftScreen(tabState, contentViewportHeight, termCols)
        hintStr = chalk.dim('  r re-deploy   a accept changes   Esc back')
      } else {
        const nativeFmt = formatNative ?? formatNativeEntriesTableFallback
        contentLines = buildCategoriesTab(tabState, contentViewportHeight, formatCats, nativeFmt, termCols)
        const sectionHint = tabState.nativeEntries.length > 0 ? '   Tab switch section' : '   Tab switch tabs'
        const nativeHint = tabState.section === 'native' ? '   i import' : '   n new   Enter edit   d toggle   Del delete   r reveal'
        hintStr = chalk.dim(`  ↑↓ navigate${nativeHint}${sectionHint}   q exit`)
      }
    }

    const footerTip = chezmoidTip ? [chalk.dim(chezmoidTip)] : []
    const footerLines = ['', hintStr, ...footerTip]
    process.stdout.write(buildTabScreen(tabBarLines, contentLines, footerLines, termRows))
  }

  // Resize handler
  function onResize() {
    const newRows = process.stdout.rows || 24
    const newCols = process.stdout.columns || 80
    tuiState = {
      ...tuiState,
      termRows: newRows,
      termCols: newCols,
      contentViewportHeight: Math.max(1, newRows - TAB_BAR_LINES - FOOTER_LINES),
      tooSmall: newCols < MIN_COLS || newRows < MIN_ROWS,
    }
    render()
  }
  process.stdout.on('resize', onResize)

  render()

  return new Promise((resolve) => {
    /**
     * @param {string} _str
     * @param {{ name: string, ctrl?: boolean, shift?: boolean, sequence?: string }} key
     */
    const listener = async (_str, key) => {
      if (!key) return

      // Global keys
      if (key.name === 'escape' || key.name === 'q') {
        process.stdout.removeListener('resize', onResize)
        process.removeListener('SIGINT', sigHandler)
        process.removeListener('SIGTERM', sigHandler)
        process.removeListener('exit', exitHandler)
        cleanupTerminal()
        resolve()
        return
      }
      if (key.ctrl && key.name === 'c') {
        process.stdout.removeListener('resize', onResize)
        process.removeListener('SIGINT', sigHandler)
        process.removeListener('SIGTERM', sigHandler)
        process.removeListener('exit', exitHandler)
        cleanupTerminal()
        resolve()
        return
      }

      // Tab switching — only when not in form/drift mode
      const activeTabKey = tuiState.activeTabIndex > 0 ? tabs[tuiState.activeTabIndex].key : null
      const isInFormMode = activeTabKey !== null && catTabStates[activeTabKey]?.mode === 'form'
      if (key.name === 'tab' && !key.shift && !isInFormMode) {
        // If active category tab has native entries, Tab switches section within the tab
        const catState = activeTabKey ? catTabStates[activeTabKey] : null
        if (catState && catState.nativeEntries && catState.nativeEntries.length > 0 && catState.mode !== 'drift') {
          catTabStates = {
            ...catTabStates,
            [activeTabKey]: {
              ...catState,
              section: catState.section === 'managed' ? 'native' : 'managed',
              selectedIndex: 0,
              revealedEntryId: null,
            },
          }
          render()
          return
        }
        tuiState = {
          ...tuiState,
          activeTabIndex: (tuiState.activeTabIndex + 1) % tabs.length,
        }
        render()
        return
      }

      // Delegate to active tab
      if (tuiState.activeTabIndex === 0) {
        // Environments tab — read-only
        const result = handleEnvironmentsKeypress(envState, key)
        envState = /** @type {EnvTabState} */ (result)
        render()
      } else {
        // Category tab (MCPs | Commands | Skills | Agents)
        const tabKey = tabs[tuiState.activeTabIndex].key
        const tabState = catTabStates[tabKey]

        // Form mode: delegate to form keypress handler
        if (tabState.mode === 'form' && tabState.formState) {
          const formResult = handleFormKeypress(tabState.formState, key)

          if ('cancelled' in formResult && formResult.cancelled) {
            catTabStates = {
              ...catTabStates,
              [tabKey]: {...tabState, mode: 'list', formState: null, _formAction: null, _editId: null},
            }
            render()
            return
          }

          if ('submitted' in formResult && formResult.submitted) {
            const formAction = tabState._formAction
            const editId = tabState._editId
            const savedFormState = tabState.formState
            catTabStates = {
              ...catTabStates,
              [tabKey]: {...tabState, mode: 'list', formState: null, _formAction: null, _editId: null},
            }
            render()
            try {
              await onAction({type: formAction, tabKey, values: formResult.values, id: editId})
              if (opts.refreshEntries) {
                allEntries = await opts.refreshEntries()
                syncTabEntries()
                render()
              }
            } catch (err) {
              // Restore form with error message so the user sees what went wrong
              const msg = err instanceof Error ? err.message : String(err)
              catTabStates = {
                ...catTabStates,
                [tabKey]: {
                  ...catTabStates[tabKey],
                  mode: 'form',
                  formState: {...savedFormState, errorMessage: msg},
                  _formAction: formAction,
                  _editId: editId,
                },
              }
              render()
            }
            return
          }

          // Still editing — update form state
          catTabStates = {
            ...catTabStates,
            [tabKey]: {...tabState, formState: /** @type {import('./form.js').FormState} */ (formResult)},
          }
          render()
          return
        }

        // List / confirm-delete mode
        const result = handleCategoriesKeypress(tabState, key)

        if (result._deleteConfirmed && result.confirmDeleteId) {
          const idToDelete = result.confirmDeleteId
          catTabStates = {
            ...catTabStates,
            [tabKey]: {...result, confirmDeleteId: null, _deleteConfirmed: false},
          }
          render()
          try {
            await onAction({type: 'delete', id: idToDelete})
            if (opts.refreshEntries) {
              allEntries = await opts.refreshEntries()
              syncTabEntries()
              render()
            }
          } catch {
            /* ignore */
          }
          return
        }

        if (result._toggleId) {
          const idToToggle = result._toggleId
          const entry = tabState.entries.find((e) => e.id === idToToggle)
          catTabStates = {...catTabStates, [tabKey]: {...result, _toggleId: null}}
          render()
          if (entry) {
            try {
              await onAction({type: entry.active ? 'deactivate' : 'activate', id: idToToggle})
              if (opts.refreshEntries) {
                allEntries = await opts.refreshEntries()
                syncTabEntries()
                render()
              }
            } catch {
              /* ignore */
            }
          }
          return
        }

        // T017: Import native entry into managed sync
        if (result._importNative) {
          const nativeEntry = result._importNative
          catTabStates = {...catTabStates, [tabKey]: {...result, _importNative: null}}
          render()
          try {
            await onAction({type: 'import-native', nativeEntry})
            if (opts.refreshEntries) {
              allEntries = await opts.refreshEntries()
              syncTabEntries()
              // Update native entries: remove imported entry from native list
              catTabStates = {
                ...catTabStates,
                [tabKey]: {
                  ...catTabStates[tabKey],
                  nativeEntries: catTabStates[tabKey].nativeEntries.filter(
                    (ne) => !(ne.name === nativeEntry.name && ne.environmentId === nativeEntry.environmentId),
                  ),
                  section: 'managed',
                  selectedIndex: 0,
                },
              }
              render()
            }
          } catch {
            /* ignore */
          }
          return
        }

        // T018: Re-deploy after drift resolution
        if (result._redeploy) {
          const idToRedeploy = result._redeploy
          catTabStates = {...catTabStates, [tabKey]: {...result, _redeploy: null}}
          render()
          try {
            await onAction({type: 'redeploy', id: idToRedeploy})
            if (opts.refreshEntries) {
              allEntries = await opts.refreshEntries()
              syncTabEntries()
              render()
            }
          } catch {
            /* ignore */
          }
          return
        }

        // T018: Accept drift (update store from file)
        if (result._acceptDrift) {
          const idToAccept = result._acceptDrift
          catTabStates = {...catTabStates, [tabKey]: {...result, _acceptDrift: null}}
          render()
          try {
            await onAction({type: 'accept-drift', id: idToAccept})
            if (opts.refreshEntries) {
              allEntries = await opts.refreshEntries()
              syncTabEntries()
              render()
            }
          } catch {
            /* ignore */
          }
          return
        }

        if (result._action === 'create') {
          const compatibleEnvs = envs.filter((e) => e.supportedCategories.includes(tabKey))
          const fields =
            tabKey === 'mcp'
              ? getMCPFormFields(null, compatibleEnvs)
              : tabKey === 'command'
                ? getCommandFormFields(null, compatibleEnvs)
                : tabKey === 'rule'
                  ? getRuleFormFields(null, compatibleEnvs)
                  : tabKey === 'skill'
                    ? getSkillFormFields(null, compatibleEnvs)
                    : getAgentFormFields(null, compatibleEnvs)
          const tabLabel = tabKey === 'mcp' ? 'MCP' : tabKey.charAt(0).toUpperCase() + tabKey.slice(1)
          catTabStates = {
            ...catTabStates,
            [tabKey]: {
              ...result,
              _action: null,
              mode: 'form',
              _formAction: 'create',
              formState: {
                fields,
                focusedFieldIndex: 0,
                title: `Create ${tabLabel}`,
                status: 'editing',
                errorMessage: null,
              },
            },
          }
          render()
          return
        }

        if (result._action === 'edit' && result._editId) {
          const entry = tabState.entries.find((e) => e.id === result._editId)
          if (entry) {
            const compatibleEnvs = envs.filter((e) => e.supportedCategories.includes(entry.type))
            const fields =
              entry.type === 'mcp'
                ? getMCPFormFields(entry, compatibleEnvs)
                : entry.type === 'command'
                  ? getCommandFormFields(entry, compatibleEnvs)
                  : entry.type === 'rule'
                    ? getRuleFormFields(entry, compatibleEnvs)
                    : entry.type === 'skill'
                      ? getSkillFormFields(entry, compatibleEnvs)
                      : getAgentFormFields(entry, compatibleEnvs)
            catTabStates = {
              ...catTabStates,
              [tabKey]: {
                ...result,
                _action: null,
                mode: 'form',
                _formAction: 'edit',
                formState: {
                  fields,
                  focusedFieldIndex: 0,
                  title: `Edit ${entry.name}`,
                  status: 'editing',
                  errorMessage: null,
                },
              },
            }
            render()
            return
          }
        }

        catTabStates = {...catTabStates, [tabKey]: /** @type {CatTabState} */ (result)}
        render()
      }
    }

    _keypressListener = listener
    process.stdin.on('keypress', listener)
    process.stdin.resume()
  })
}

/**
 * Update the entries displayed in the Categories tab (called after store mutations).
 * @param {import('../../types.js').CategoryEntry[]} _newEntries
 * @returns {void}
 */
export function updateTUIEntries(_newEntries) {
  // This is a lightweight state update — the TUI re-renders on next keypress.
  // Callers should call render() manually after this if needed.
}

import {describe, it, expect} from 'vitest'
import {
  computeViewport,
  formatRow,
  buildTableScreen,
  createInteractiveTableState,
  handleTableKeypress,
} from '../../../src/utils/tui/navigable-table.js'

// ──────────────────────────────────────────────────────────────────────────────
// computeViewport
// ──────────────────────────────────────────────────────────────────────────────

describe('computeViewport', () => {
  it('starts at 0 when selectedIndex is at top', () => {
    const {startIndex, endIndex} = computeViewport(0, 100, 10)
    expect(startIndex).toBe(0)
    expect(endIndex).toBe(10)
  })

  it('centers the selected row in the viewport', () => {
    // Selected = 20, viewportHeight = 10 → center bias: 20 - 5 = 15
    const {startIndex, endIndex} = computeViewport(20, 100, 10)
    expect(startIndex).toBe(15)
    expect(endIndex).toBe(25)
  })

  it('clamps startIndex so last page is always full', () => {
    // selectedIndex near the end
    const {startIndex, endIndex} = computeViewport(98, 100, 10)
    expect(startIndex).toBe(90)
    expect(endIndex).toBe(100)
  })

  it('handles totalRows < viewportHeight', () => {
    const {startIndex, endIndex} = computeViewport(2, 5, 10)
    expect(startIndex).toBe(0)
    expect(endIndex).toBe(5)
  })

  it('returns endIndex = totalRows when remaining rows < viewportHeight', () => {
    const {startIndex, endIndex} = computeViewport(0, 3, 10)
    expect(startIndex).toBe(0)
    expect(endIndex).toBe(3)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// formatRow
// ──────────────────────────────────────────────────────────────────────────────

describe('formatRow', () => {
  const columns = [
    {header: 'ID', key: 'id', width: 10},
    {header: 'Name', key: 'name', width: 15},
  ]

  it('pads cells to column width', () => {
    const row = {id: 'abc', name: 'hello'}
    const result = formatRow(row, columns, 80, false)
    // Strip ANSI
    const plain = result.replace(/\x1b\[[0-9;]*m/g, '')
    expect(plain).toContain('abc'.padEnd(10))
    expect(plain).toContain('hello'.padEnd(15))
  })

  it('truncates with … when value exceeds column width', () => {
    const row = {id: 'A'.repeat(20), name: 'B'}
    const result = formatRow(row, columns, 80, false)
    const plain = result.replace(/\x1b\[[0-9;]*m/g, '')
    expect(plain).toContain('…')
  })

  it('wraps the line in ANSI inverse video when isSelected = true', () => {
    const row = {id: 'x', name: 'y'}
    const result = formatRow(row, columns, 80, true)
    expect(result).toContain('\x1b[7m') // ANSI inverse on
    expect(result).toContain('\x1b[27m') // ANSI inverse off
  })

  it('does NOT wrap in inverse when isSelected = false', () => {
    const row = {id: 'x', name: 'y'}
    const result = formatRow(row, columns, 80, false)
    expect(result).not.toContain('\x1b[7m')
  })

  it('applies colorize function to the padded cell', () => {
    const colorCols = [{header: 'ID', key: 'id', width: 5, colorize: (v) => `[${v}]`}]
    const result = formatRow({id: 'abc'}, colorCols, 80, false)
    expect(result).toContain('[abc  ]')
  })

  it('handles missing key gracefully', () => {
    const row = {id: 'only'}
    expect(() => formatRow(row, columns, 80, false)).not.toThrow()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// createInteractiveTableState
// ──────────────────────────────────────────────────────────────────────────────

describe('createInteractiveTableState', () => {
  it('initialises with selectedIndex = 0 and currentView = table', () => {
    const state = createInteractiveTableState([], [], 'Test', 0, 24, 80)
    expect(state.selectedIndex).toBe(0)
    expect(state.currentView).toBe('table')
    expect(state.modalContent).toBeNull()
  })

  it('computes viewportHeight as termRows - 7', () => {
    const state = createInteractiveTableState([], [], 'Test', 0, 24, 80)
    expect(state.viewportHeight).toBe(17) // 24 - 4 (header) - 3 (footer)
  })

  it('clamps viewportHeight to at least 1', () => {
    const state = createInteractiveTableState([], [], 'Test', 0, 5, 80)
    expect(state.viewportHeight).toBeGreaterThanOrEqual(1)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// handleTableKeypress
// ──────────────────────────────────────────────────────────────────────────────

describe('handleTableKeypress', () => {
  /**
   * @param {Partial<import('../../../src/utils/tui/navigable-table.js').InteractiveTableState>} overrides
   * @returns {import('../../../src/utils/tui/navigable-table.js').InteractiveTableState}
   */
  function makeState(overrides = {}) {
    return {
      rows: [{id: 'A'}, {id: 'B'}, {id: 'C'}],
      columns: [],
      heading: 'Test',
      totalResults: 3,
      selectedIndex: 1,
      scrollOffset: 0,
      viewportHeight: 10,
      termRows: 24,
      termCols: 80,
      currentView: 'table',
      modalScrollOffset: 0,
      modalContent: null,
      modalError: null,
      firstRefUrl: null,
      ...overrides,
    }
  }

  it('returns { exit: true } on Esc key', () => {
    const result = handleTableKeypress(makeState(), {name: 'escape'})
    expect(result).toEqual({exit: true})
  })

  it('returns { exit: true } on q key', () => {
    const result = handleTableKeypress(makeState(), {name: 'q'})
    expect(result).toEqual({exit: true})
  })

  it('returns { exit: true } on Ctrl+C', () => {
    const result = handleTableKeypress(makeState(), {name: 'c', ctrl: true})
    expect(result).toEqual({exit: true})
  })

  it('switches to modal view on Enter', () => {
    const result = handleTableKeypress(makeState(), {name: 'return'})
    expect(result).toMatchObject({currentView: 'modal'})
  })

  it('decrements selectedIndex on up arrow (not below 0)', () => {
    const result = handleTableKeypress(makeState({selectedIndex: 1}), {name: 'up'})
    expect(result).toMatchObject({selectedIndex: 0})
  })

  it('does not go below 0 on up arrow at first row', () => {
    const result = handleTableKeypress(makeState({selectedIndex: 0}), {name: 'up'})
    expect(result).toMatchObject({selectedIndex: 0})
  })

  it('increments selectedIndex on down arrow', () => {
    const result = handleTableKeypress(makeState({selectedIndex: 1}), {name: 'down'})
    expect(result).toMatchObject({selectedIndex: 2})
  })

  it('does not exceed last row on down arrow', () => {
    const result = handleTableKeypress(makeState({selectedIndex: 2}), {name: 'down'})
    expect(result).toMatchObject({selectedIndex: 2})
  })

  it('moves by viewportHeight on pagedown', () => {
    const result = handleTableKeypress(makeState({selectedIndex: 0, viewportHeight: 2}), {name: 'pagedown'})
    expect(result).toMatchObject({selectedIndex: 2})
  })

  it('moves by viewportHeight on pageup', () => {
    const result = handleTableKeypress(makeState({selectedIndex: 2, viewportHeight: 2}), {name: 'pageup'})
    expect(result).toMatchObject({selectedIndex: 0})
  })

  it('returns unchanged state for unrecognized key', () => {
    const state = makeState()
    const result = handleTableKeypress(state, {name: 'f1'})
    expect(result).toBe(state) // same reference
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// buildTableScreen (smoke test)
// ──────────────────────────────────────────────────────────────────────────────

describe('buildTableScreen', () => {
  it('renders without throwing and contains heading and footer attribution', () => {
    const state = createInteractiveTableState(
      [
        {
          id: 'CVE-2024-0001',
          severity: 'High',
          score: '8.0',
          published: '2024-01-01',
          description: 'Test CVE',
          reference: 'https://example.com',
        },
      ],
      [
        {header: 'CVE ID', key: 'id', width: 20},
        {header: 'Severity', key: 'severity', width: 10},
      ],
      'CVE Search: "test"',
      1,
      24,
      80,
    )
    const output = buildTableScreen(state)
    const plain = output
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/\x1b\[2J/g, '')
      .replace(/\x1b\[H/g, '')
    expect(plain).toContain('CVE Search: "test"')
    expect(plain).toContain('CVE ID')
    expect(plain).toContain('NVD')
  })
})

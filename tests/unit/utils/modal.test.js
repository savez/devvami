import { describe, it, expect } from 'vitest'
import { buildModalScreen, buildLoadingScreen, buildErrorScreen, handleModalKeypress } from '../../../src/utils/tui/modal.js'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Strip ANSI escape codes and control sequences from a string.
 * @param {string} str
 * @returns {string}
 */
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\[2J/g, '').replace(/\x1b\[H/g, '')
}

/**
 * Build a minimal InteractiveTableState for modal tests.
 * @param {Partial<import('../../../src/utils/tui/navigable-table.js').InteractiveTableState>} overrides
 * @returns {import('../../../src/utils/tui/navigable-table.js').InteractiveTableState}
 */
function makeState(overrides = {}) {
  return {
    rows: [{ id: 'CVE-2024-0001' }],
    columns: [],
    heading: 'Test',
    totalResults: 1,
    selectedIndex: 0,
    scrollOffset: 0,
    viewportHeight: 10,
    termRows: 24,
    termCols: 80,
    currentView: 'modal',
    modalScrollOffset: 0,
    modalContent: ['Line 1', 'Line 2', 'Line 3'],
    modalError: null,
    firstRefUrl: null,
    ...overrides,
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// buildModalScreen
// ──────────────────────────────────────────────────────────────────────────────

describe('buildModalScreen', () => {
  it('renders without throwing', () => {
    const state = makeState()
    expect(() => buildModalScreen(state)).not.toThrow()
  })

  it('contains the title bar text', () => {
    const output = stripAnsi(buildModalScreen(makeState()))
    expect(output).toContain('CVE Detail')
  })

  it('contains modal content lines', () => {
    const state = makeState({ modalContent: ['Hello World', 'Second line'] })
    const output = stripAnsi(buildModalScreen(state))
    expect(output).toContain('Hello World')
    expect(output).toContain('Second line')
  })

  it('contains NVD attribution', () => {
    const output = stripAnsi(buildModalScreen(makeState()))
    expect(output).toContain('NVD')
  })

  it('contains Esc hint', () => {
    const output = stripAnsi(buildModalScreen(makeState()))
    expect(output).toContain('Esc')
  })

  it('contains "o open ref" hint when firstRefUrl is set', () => {
    const state = makeState({ firstRefUrl: 'https://example.com/cve' })
    const output = stripAnsi(buildModalScreen(state))
    expect(output).toContain('o open ref')
  })

  it('does NOT contain "o open ref" hint when firstRefUrl is null', () => {
    const state = makeState({ firstRefUrl: null })
    const output = stripAnsi(buildModalScreen(state))
    expect(output).not.toContain('o open ref')
  })

  it('respects modalScrollOffset to show different content lines', () => {
    const content = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`)
    const stateTop = makeState({ modalContent: content, modalScrollOffset: 0 })
    const stateScrolled = makeState({ modalContent: content, modalScrollOffset: 10 })
    const outTop = stripAnsi(buildModalScreen(stateTop))
    const outScrolled = stripAnsi(buildModalScreen(stateScrolled))
    expect(outTop).toContain('Line 1')
    expect(outScrolled).toContain('Line 11')
    expect(outScrolled).not.toContain('Line 1\n') // Line 1 not at start of a viewport line
  })

  it('handles empty modalContent gracefully', () => {
    const state = makeState({ modalContent: [] })
    expect(() => buildModalScreen(state)).not.toThrow()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// buildLoadingScreen
// ──────────────────────────────────────────────────────────────────────────────

describe('buildLoadingScreen', () => {
  it('renders without throwing', () => {
    expect(() => buildLoadingScreen('CVE-2024-0001', 24, 80)).not.toThrow()
  })

  it('contains the CVE ID in the loading message', () => {
    const output = stripAnsi(buildLoadingScreen('CVE-2024-1234', 24, 80))
    expect(output).toContain('CVE-2024-1234')
  })

  it('contains "Loading"', () => {
    const output = stripAnsi(buildLoadingScreen('CVE-2024-1234', 24, 80))
    expect(output).toContain('Loading')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// buildErrorScreen
// ──────────────────────────────────────────────────────────────────────────────

describe('buildErrorScreen', () => {
  it('renders without throwing', () => {
    expect(() => buildErrorScreen('CVE-2024-9999', 'Connection refused', 24, 80)).not.toThrow()
  })

  it('contains the CVE ID', () => {
    const output = stripAnsi(buildErrorScreen('CVE-2024-9999', 'Connection refused', 24, 80))
    expect(output).toContain('CVE-2024-9999')
  })

  it('contains the error message', () => {
    const output = stripAnsi(buildErrorScreen('CVE-2024-9999', 'Connection refused', 24, 80))
    expect(output).toContain('Connection refused')
  })

  it('contains the Esc hint', () => {
    const output = stripAnsi(buildErrorScreen('CVE-2024-9999', 'Timeout', 24, 80))
    expect(output).toContain('Esc')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// handleModalKeypress
// ──────────────────────────────────────────────────────────────────────────────

describe('handleModalKeypress', () => {
  it('returns { backToTable: true } on Esc', () => {
    const result = handleModalKeypress(makeState(), { name: 'escape' })
    expect(result).toEqual({ backToTable: true })
  })

  it('returns { exit: true } on q', () => {
    const result = handleModalKeypress(makeState(), { name: 'q' })
    expect(result).toEqual({ exit: true })
  })

  it('returns { exit: true } on Ctrl+C', () => {
    const result = handleModalKeypress(makeState(), { name: 'c', ctrl: true })
    expect(result).toEqual({ exit: true })
  })

  it('returns { openUrl } when o is pressed and firstRefUrl is set', () => {
    const state = makeState({ firstRefUrl: 'https://nvd.nist.gov/cve/123' })
    const result = handleModalKeypress(state, { name: 'o' })
    expect(result).toEqual({ openUrl: 'https://nvd.nist.gov/cve/123' })
  })

  it('does NOT open URL when o is pressed but firstRefUrl is null', () => {
    const state = makeState({ firstRefUrl: null })
    const result = handleModalKeypress(state, { name: 'o' })
    // Should return unchanged state (no openUrl control object)
    expect(result).not.toHaveProperty('openUrl')
  })

  it('decrements modalScrollOffset on up arrow (not below 0)', () => {
    const state = makeState({ modalScrollOffset: 5, modalContent: Array(30).fill('x') })
    const result = handleModalKeypress(state, { name: 'up' })
    expect(result).toMatchObject({ modalScrollOffset: 4 })
  })

  it('does not go below 0 on up at the top', () => {
    const state = makeState({ modalScrollOffset: 0, modalContent: Array(30).fill('x') })
    const result = handleModalKeypress(state, { name: 'up' })
    expect(result).toMatchObject({ modalScrollOffset: 0 })
  })

  it('increments modalScrollOffset on down arrow', () => {
    const state = makeState({ modalScrollOffset: 0, modalContent: Array(30).fill('x') })
    const result = handleModalKeypress(state, { name: 'down' })
    expect(result).toMatchObject({ modalScrollOffset: 1 })
  })

  it('clamps modalScrollOffset at max on down arrow', () => {
    // 30 content lines, viewportHeight = 24 - 3 - 4 = 17 → maxOffset = 30 - 17 = 13
    const content = Array(30).fill('x')
    const state = makeState({ modalScrollOffset: 13, modalContent: content, termRows: 24 })
    const result = handleModalKeypress(state, { name: 'down' })
    expect(result).toMatchObject({ modalScrollOffset: 13 }) // already at max
  })

  it('moves by contentViewport on pagedown', () => {
    const content = Array(50).fill('x')
    const state = makeState({ modalScrollOffset: 0, modalContent: content, termRows: 24 })
    const result = handleModalKeypress(state, { name: 'pagedown' })
    // contentViewport = 24 - 3 - 4 = 17
    expect(result).toMatchObject({ modalScrollOffset: 17 })
  })

  it('moves by contentViewport on pageup', () => {
    const content = Array(50).fill('x')
    const state = makeState({ modalScrollOffset: 20, modalContent: content, termRows: 24 })
    const result = handleModalKeypress(state, { name: 'pageup' })
    expect(result).toMatchObject({ modalScrollOffset: 3 }) // 20 - 17
  })

  it('returns unchanged state for unrecognized key', () => {
    const state = makeState()
    const result = handleModalKeypress(state, { name: 'f2' })
    expect(result).toBe(state)
  })
})

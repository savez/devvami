import {describe, it, expect} from 'vitest'
import {
  buildFieldLine,
  buildMultiSelectLines,
  buildMiniEditorLines,
  buildFormScreen,
  handleFormKeypress,
  extractValues,
  getMCPFormFields,
  getCommandFormFields,
  getSkillFormFields,
  getAgentFormFields,
} from '../../../../src/utils/tui/form.js'

// ──────────────────────────────────────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Strip ANSI escape codes from a string.
 * @param {string} str
 * @returns {string}
 */
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*[mGKHJ]/g, '')
}

/**
 * Build a minimal FormState for tests.
 * @param {object} [overrides]
 * @returns {import('../../../../src/utils/tui/form.js').FormState}
 */
function makeFormState(overrides = {}) {
  return {
    title: 'Test Form',
    focusedFieldIndex: 0,
    status: 'editing',
    errorMessage: null,
    fields: [
      {
        type: 'text',
        label: 'Name',
        key: 'name',
        value: 'hello',
        cursor: 5,
        required: true,
        placeholder: '',
      },
      {
        type: 'selector',
        label: 'Transport',
        key: 'transport',
        options: ['stdio', 'sse', 'streamable-http'],
        selectedIndex: 0,
        required: true,
      },
    ],
    ...overrides,
  }
}

/**
 * Build a minimal FormState with all required fields filled in.
 * @param {object} [overrides]
 * @returns {import('../../../../src/utils/tui/form.js').FormState}
 */
function makeValidFormState(overrides = {}) {
  return makeFormState({
    fields: [
      {
        type: 'text',
        label: 'Name',
        key: 'name',
        value: 'my-entry',
        cursor: 8,
        required: true,
        placeholder: '',
      },
      {
        type: 'selector',
        label: 'Transport',
        key: 'transport',
        options: ['stdio', 'sse'],
        selectedIndex: 0,
        required: true,
      },
    ],
    ...overrides,
  })
}

/**
 * Simulate a printable key event.
 * @param {string} ch - Single character to type
 * @returns {{ name: string, sequence: string, ctrl: boolean }}
 */
function charKey(ch) {
  return {name: ch, sequence: ch, ctrl: false}
}

/**
 * Simulate a named key event (e.g. tab, backspace, return).
 * @param {string} name
 * @param {object} [extra]
 * @returns {{ name: string, sequence?: string, ctrl?: boolean, shift?: boolean }}
 */
function namedKey(name, extra = {}) {
  return {name, ...extra}
}

// ──────────────────────────────────────────────────────────────────────────────
// buildFieldLine
// ──────────────────────────────────────────────────────────────────────────────

describe('buildFieldLine', () => {
  it('renders a TextField with cursor indicator when focused', () => {
    /** @type {import('../../../../src/utils/tui/form.js').TextField} */
    const field = {
      type: 'text',
      label: 'Name',
      value: 'hello',
      cursor: 5,
      required: true,
      placeholder: '',
    }
    const line = buildFieldLine(field, true)
    expect(stripAnsi(line)).toContain('Name')
    expect(stripAnsi(line)).toContain('hello')
    expect(stripAnsi(line)).toContain('|')
    expect(line.startsWith('\x1b') || line.includes('> ')).toBe(true)
  })

  it('renders a TextField without cursor when not focused', () => {
    /** @type {import('../../../../src/utils/tui/form.js').TextField} */
    const field = {
      type: 'text',
      label: 'Name',
      value: 'hello',
      cursor: 5,
      required: true,
      placeholder: '',
    }
    const line = buildFieldLine(field, false)
    expect(stripAnsi(line)).toContain('hello')
    expect(stripAnsi(line)).not.toContain('|')
  })

  it('renders a SelectorField with arrows', () => {
    /** @type {import('../../../../src/utils/tui/form.js').SelectorField} */
    const field = {
      type: 'selector',
      label: 'Transport',
      options: ['stdio', 'sse'],
      selectedIndex: 0,
      required: true,
    }
    const line = stripAnsi(buildFieldLine(field, false))
    expect(line).toContain('Transport')
    expect(line).toContain('stdio')
    expect(line).toContain('<')
    expect(line).toContain('>')
  })

  it('renders a MultiSelectField with count summary', () => {
    /** @type {import('../../../../src/utils/tui/form.js').MultiSelectField} */
    const field = {
      type: 'multiselect',
      label: 'Environments',
      options: [
        {id: 'claude-code', label: 'Claude Code'},
        {id: 'opencode', label: 'OpenCode'},
      ],
      selected: new Set(['claude-code']),
      focusedOptionIndex: 0,
      required: true,
    }
    const line = stripAnsi(buildFieldLine(field, false))
    expect(line).toContain('Environments')
    expect(line).toContain('1/2')
  })

  it('renders a MiniEditorField with line count', () => {
    /** @type {import('../../../../src/utils/tui/form.js').MiniEditorField} */
    const field = {
      type: 'editor',
      label: 'Content',
      lines: ['line one', 'line two'],
      cursorLine: 0,
      cursorCol: 0,
      required: true,
    }
    const line = stripAnsi(buildFieldLine(field, false))
    expect(line).toContain('Content')
    expect(line).toContain('2 lines')
  })

  it('prefixes focused field with ">"', () => {
    /** @type {import('../../../../src/utils/tui/form.js').TextField} */
    const field = {
      type: 'text',
      label: 'Name',
      value: '',
      cursor: 0,
      required: true,
      placeholder: '',
    }
    const focused = stripAnsi(buildFieldLine(field, true))
    const unfocused = stripAnsi(buildFieldLine(field, false))
    expect(focused).toContain('>')
    expect(unfocused).not.toContain('>')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// buildMultiSelectLines
// ──────────────────────────────────────────────────────────────────────────────

describe('buildMultiSelectLines', () => {
  /** @type {import('../../../../src/utils/tui/form.js').MultiSelectField} */
  const field = {
    type: 'multiselect',
    label: 'Envs',
    options: [
      {id: 'claude-code', label: 'Claude Code'},
      {id: 'opencode', label: 'OpenCode'},
    ],
    selected: new Set(['claude-code']),
    focusedOptionIndex: 0,
    required: true,
  }

  it('renders one line per option', () => {
    const lines = buildMultiSelectLines(field, true, 10)
    expect(lines).toHaveLength(2)
  })

  it('marks selected option with [x]', () => {
    const lines = buildMultiSelectLines(field, true, 10).map(stripAnsi)
    expect(lines[0]).toContain('[x]')
    expect(lines[0]).toContain('Claude Code')
  })

  it('marks unselected option with [ ]', () => {
    const lines = buildMultiSelectLines(field, true, 10).map(stripAnsi)
    expect(lines[1]).toContain('[ ]')
    expect(lines[1]).toContain('OpenCode')
  })

  it('respects maxLines limit', () => {
    const lines = buildMultiSelectLines(field, true, 1)
    expect(lines).toHaveLength(1)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// buildMiniEditorLines
// ──────────────────────────────────────────────────────────────────────────────

describe('buildMiniEditorLines', () => {
  /** @type {import('../../../../src/utils/tui/form.js').MiniEditorField} */
  const field = {
    type: 'editor',
    label: 'Content',
    lines: ['hello world', 'second line'],
    cursorLine: 0,
    cursorCol: 5,
    required: true,
  }

  it('renders one line per content line', () => {
    const lines = buildMiniEditorLines(field, true, 20)
    expect(lines).toHaveLength(2)
  })

  it('inserts cursor on the active line when focused', () => {
    const lines = buildMiniEditorLines(field, true, 20).map(stripAnsi)
    expect(lines[0]).toContain('|')
  })

  it('does not insert cursor when not focused', () => {
    const lines = buildMiniEditorLines(field, false, 20).map(stripAnsi)
    expect(lines[0]).not.toContain('|')
  })

  it('includes line numbers', () => {
    const lines = buildMiniEditorLines(field, false, 20).map(stripAnsi)
    expect(lines[0]).toContain('1')
    expect(lines[1]).toContain('2')
  })

  it('respects maxLines limit', () => {
    const lines = buildMiniEditorLines(field, true, 1)
    expect(lines).toHaveLength(1)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// buildFormScreen
// ──────────────────────────────────────────────────────────────────────────────

describe('buildFormScreen', () => {
  it('renders without throwing', () => {
    const state = makeFormState()
    expect(() => buildFormScreen(state, 24, 80)).not.toThrow()
  })

  it('includes the form title', () => {
    const state = makeFormState({title: 'My Fancy Form'})
    const lines = buildFormScreen(state, 24, 80).map(stripAnsi).join('\n')
    expect(lines).toContain('My Fancy Form')
  })

  it('includes field labels', () => {
    const state = makeFormState()
    const lines = buildFormScreen(state, 24, 80).map(stripAnsi).join('\n')
    expect(lines).toContain('Name')
    expect(lines).toContain('Transport')
  })

  it('renders the error message when set', () => {
    const state = makeFormState({errorMessage: 'Something went wrong'})
    const lines = buildFormScreen(state, 24, 80).map(stripAnsi).join('\n')
    expect(lines).toContain('Something went wrong')
  })

  it('includes footer hint', () => {
    const state = makeFormState()
    const lines = buildFormScreen(state, 24, 80).map(stripAnsi).join('\n')
    expect(lines).toContain('Tab')
    expect(lines).toContain('Esc')
  })

  it('returns an array of strings', () => {
    const state = makeFormState()
    const lines = buildFormScreen(state, 24, 80)
    expect(Array.isArray(lines)).toBe(true)
    for (const line of lines) {
      expect(typeof line).toBe('string')
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// handleFormKeypress — navigation
// ──────────────────────────────────────────────────────────────────────────────

describe('handleFormKeypress — Tab moves to next field', () => {
  it('Tab advances focusedFieldIndex', () => {
    const state = makeFormState({focusedFieldIndex: 0})
    const result = handleFormKeypress(state, namedKey('tab'))
    expect(result).not.toHaveProperty('cancelled')
    expect(result).not.toHaveProperty('submitted')
    expect(/** @type {any} */ (result).focusedFieldIndex).toBe(1)
  })

  it('Tab wraps from last field back to first', () => {
    const state = makeFormState({focusedFieldIndex: 1})
    const result = handleFormKeypress(state, namedKey('tab'))
    expect(/** @type {any} */ (result).focusedFieldIndex).toBe(0)
  })
})

describe('handleFormKeypress — Shift+Tab moves to previous field', () => {
  it('Shift+Tab decrements focusedFieldIndex', () => {
    const state = makeFormState({focusedFieldIndex: 1})
    const result = handleFormKeypress(state, namedKey('tab', {shift: true}))
    expect(/** @type {any} */ (result).focusedFieldIndex).toBe(0)
  })

  it('Shift+Tab wraps from first field to last', () => {
    const state = makeFormState({focusedFieldIndex: 0})
    const result = handleFormKeypress(state, namedKey('tab', {shift: true}))
    expect(/** @type {any} */ (result).focusedFieldIndex).toBe(state.fields.length - 1)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// handleFormKeypress — cancel
// ──────────────────────────────────────────────────────────────────────────────

describe('handleFormKeypress — Esc cancels', () => {
  it('returns { cancelled: true } when Esc is pressed on a text field', () => {
    const state = makeFormState({focusedFieldIndex: 0})
    const result = handleFormKeypress(state, namedKey('escape'))
    expect(result).toEqual({cancelled: true})
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// handleFormKeypress — submit
// ──────────────────────────────────────────────────────────────────────────────

describe('handleFormKeypress — Ctrl+S submits when valid', () => {
  it('returns { submitted: true, values } when all required fields are filled', () => {
    const state = makeValidFormState()
    const result = handleFormKeypress(state, namedKey('s', {ctrl: true}))
    expect(result).toHaveProperty('submitted', true)
    expect(result).toHaveProperty('values')
    expect(/** @type {any} */ (result).values.name).toBe('my-entry')
  })
})

describe('handleFormKeypress — Ctrl+S returns errorMessage when required field empty', () => {
  it('sets errorMessage and returns FormState when required text field is empty', () => {
    const state = makeFormState({
      fields: [
        {
          type: 'text',
          label: 'Name',
          key: 'name',
          value: '',
          cursor: 0,
          required: true,
          placeholder: '',
        },
      ],
    })
    const result = handleFormKeypress(state, namedKey('s', {ctrl: true}))
    expect(result).not.toHaveProperty('submitted')
    expect(/** @type {any} */ (result).errorMessage).toBeTruthy()
    expect(/** @type {any} */ (result).errorMessage).toContain('Name')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// handleFormKeypress — TextField
// ──────────────────────────────────────────────────────────────────────────────

describe('handleFormKeypress — printable char appended to TextField', () => {
  it('appends character at cursor position', () => {
    const state = makeFormState({
      focusedFieldIndex: 0,
      fields: [
        {
          type: 'text',
          label: 'Name',
          key: 'name',
          value: 'helo',
          cursor: 3,
          required: true,
          placeholder: '',
        },
      ],
    })
    const result = handleFormKeypress(state, charKey('l'))
    const field = /** @type {any} */ (result).fields[0]
    expect(field.value).toBe('hello')
    expect(field.cursor).toBe(4)
  })
})

describe('handleFormKeypress — Backspace removes char before cursor', () => {
  it('deletes the character immediately before the cursor', () => {
    const state = makeFormState({
      focusedFieldIndex: 0,
      fields: [
        {
          type: 'text',
          label: 'Name',
          key: 'name',
          value: 'hello',
          cursor: 5,
          required: true,
          placeholder: '',
        },
      ],
    })
    const result = handleFormKeypress(state, namedKey('backspace'))
    const field = /** @type {any} */ (result).fields[0]
    expect(field.value).toBe('hell')
    expect(field.cursor).toBe(4)
  })

  it('does nothing when cursor is at position 0', () => {
    const state = makeFormState({
      focusedFieldIndex: 0,
      fields: [
        {
          type: 'text',
          label: 'Name',
          key: 'name',
          value: 'hello',
          cursor: 0,
          required: true,
          placeholder: '',
        },
      ],
    })
    const result = handleFormKeypress(state, namedKey('backspace'))
    const field = /** @type {any} */ (result).fields[0]
    expect(field.value).toBe('hello')
    expect(field.cursor).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// handleFormKeypress — SelectorField
// ──────────────────────────────────────────────────────────────────────────────

describe('handleFormKeypress — ← → cycles SelectorField options', () => {
  /** @type {import('../../../../src/utils/tui/form.js').FormState} */
  const selectorState = {
    title: 'Test',
    focusedFieldIndex: 0,
    status: 'editing',
    errorMessage: null,
    fields: [
      {
        type: 'selector',
        label: 'Transport',
        key: 'transport',
        options: ['stdio', 'sse', 'streamable-http'],
        selectedIndex: 0,
        required: true,
      },
    ],
  }

  it('Right arrow moves to next option', () => {
    const result = handleFormKeypress(selectorState, namedKey('right'))
    expect(/** @type {any} */ (result).fields[0].selectedIndex).toBe(1)
  })

  it('Left arrow on first option wraps to last', () => {
    const result = handleFormKeypress(selectorState, namedKey('left'))
    expect(/** @type {any} */ (result).fields[0].selectedIndex).toBe(2)
  })

  it('Right arrow on last option wraps to first', () => {
    const state = {...selectorState, fields: [{...selectorState.fields[0], selectedIndex: 2}]}
    const result = handleFormKeypress(state, namedKey('right'))
    expect(/** @type {any} */ (result).fields[0].selectedIndex).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// handleFormKeypress — MultiSelectField
// ──────────────────────────────────────────────────────────────────────────────

describe('handleFormKeypress — Space toggles MultiSelectField option', () => {
  /** @type {import('../../../../src/utils/tui/form.js').FormState} */
  const msState = {
    title: 'Test',
    focusedFieldIndex: 0,
    status: 'editing',
    errorMessage: null,
    fields: [
      {
        type: 'multiselect',
        label: 'Environments',
        key: 'environments',
        options: [
          {id: 'claude-code', label: 'Claude Code'},
          {id: 'opencode', label: 'OpenCode'},
        ],
        selected: new Set(['claude-code']),
        focusedOptionIndex: 0,
        required: true,
      },
    ],
  }

  it('Space deselects an already-selected option', () => {
    const result = handleFormKeypress(msState, namedKey('space'))
    const field = /** @type {any} */ (result).fields[0]
    expect(field.selected.has('claude-code')).toBe(false)
  })

  it('Space selects an unselected option', () => {
    const state = {
      ...msState,
      fields: [{...msState.fields[0], focusedOptionIndex: 1}],
    }
    const result = handleFormKeypress(state, namedKey('space'))
    const field = /** @type {any} */ (result).fields[0]
    expect(field.selected.has('opencode')).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// handleFormKeypress — MiniEditorField
// ──────────────────────────────────────────────────────────────────────────────

describe('handleFormKeypress — Enter in MiniEditorField inserts new line', () => {
  /** @type {import('../../../../src/utils/tui/form.js').FormState} */
  const editorState = {
    title: 'Test',
    focusedFieldIndex: 0,
    status: 'editing',
    errorMessage: null,
    fields: [
      {
        type: 'editor',
        label: 'Content',
        key: 'content',
        lines: ['hello world'],
        cursorLine: 0,
        cursorCol: 5,
        required: true,
      },
    ],
  }

  it('splits line at cursor on Enter', () => {
    const result = handleFormKeypress(editorState, namedKey('return'))
    const field = /** @type {any} */ (result).fields[0]
    expect(field.lines).toHaveLength(2)
    expect(field.lines[0]).toBe('hello')
    expect(field.lines[1]).toBe(' world')
    expect(field.cursorLine).toBe(1)
    expect(field.cursorCol).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// extractValues
// ──────────────────────────────────────────────────────────────────────────────

describe('extractValues', () => {
  it('returns correct object from mixed form state', () => {
    /** @type {import('../../../../src/utils/tui/form.js').FormState} */
    const state = {
      title: 'Test',
      focusedFieldIndex: 0,
      status: 'editing',
      errorMessage: null,
      fields: [
        {
          type: 'text',
          label: 'Name',
          key: 'name',
          value: 'my-server',
          cursor: 9,
          required: true,
          placeholder: '',
        },
        {
          type: 'selector',
          label: 'Transport',
          key: 'transport',
          options: ['stdio', 'sse', 'streamable-http'],
          selectedIndex: 1,
          required: true,
        },
        {
          type: 'multiselect',
          label: 'Environments',
          key: 'environments',
          options: [
            {id: 'claude-code', label: 'Claude Code'},
            {id: 'opencode', label: 'OpenCode'},
          ],
          selected: new Set(['claude-code', 'opencode']),
          focusedOptionIndex: 0,
          required: true,
        },
        {
          type: 'editor',
          label: 'Content',
          key: 'content',
          lines: ['line one', 'line two'],
          cursorLine: 0,
          cursorCol: 0,
          required: true,
        },
      ],
    }

    const values = extractValues(state)
    expect(values.name).toBe('my-server')
    expect(values.transport).toBe('sse')
    expect(values.environments).toEqual(expect.arrayContaining(['claude-code', 'opencode']))
    expect(values.content).toBe('line one\nline two')
  })

  it('uses label as key when field.key is not set', () => {
    /** @type {import('../../../../src/utils/tui/form.js').FormState} */
    const state = {
      title: 'Test',
      focusedFieldIndex: 0,
      status: 'editing',
      errorMessage: null,
      fields: [
        {
          type: 'text',
          label: 'My Field',
          value: 'val',
          cursor: 3,
          required: true,
          placeholder: '',
        },
      ],
    }
    const values = extractValues(state)
    expect(values.my_field).toBe('val')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// getMCPFormFields
// ──────────────────────────────────────────────────────────────────────────────

describe('getMCPFormFields', () => {
  it('returns fields with correct labels', () => {
    const fields = getMCPFormFields()
    const labels = fields.map((f) => f.label)
    expect(labels).toContain('Name')
    expect(labels).toContain('Transport')
    expect(labels).toContain('Command')
    expect(labels).toContain('Args')
    expect(labels).toContain('URL')
    expect(labels).toContain('Description')
  })

  it('Name field is required', () => {
    const fields = getMCPFormFields()
    const nameField = fields.find((f) => f.label === 'Name')
    expect(nameField?.required).toBe(true)
  })

  it('Transport field is a selector with stdio/sse/streamable-http', () => {
    const fields = getMCPFormFields()
    const transport = fields.find((f) => f.label === 'Transport')
    expect(transport?.type).toBe('selector')
    expect(/** @type {any} */ (transport).options).toEqual(['stdio', 'sse', 'streamable-http'])
  })

  it('returns correct number of fields', () => {
    const fields = getMCPFormFields()
    expect(fields.length).toBe(7) // name, environments, transport, command, args, url, description
  })
})

describe('getMCPFormFields with existing entry', () => {
  it('pre-fills values from entry', () => {
    /** @type {import('../../../../src/types.js').CategoryEntry} */
    const entry = {
      id: 'abc-123',
      name: 'my-mcp',
      type: 'mcp',
      active: true,
      environments: ['claude-code'],
      params: {
        transport: 'sse',
        url: 'https://mcp.example.com',
        command: 'npx run',
        args: ['--port', '3000'],
      },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    const fields = getMCPFormFields(entry)

    const nameField = fields.find((f) => f.label === 'Name')
    expect(/** @type {any} */ (nameField).value).toBe('my-mcp')

    const transportField = fields.find((f) => f.label === 'Transport')
    expect(/** @type {any} */ (transportField).selectedIndex).toBe(1) // sse

    const urlField = fields.find((f) => f.label === 'URL')
    expect(/** @type {any} */ (urlField).value).toBe('https://mcp.example.com')

    const argsField = fields.find((f) => f.label === 'Args')
    expect(/** @type {any} */ (argsField).value).toBe('--port 3000')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// getCommandFormFields
// ──────────────────────────────────────────────────────────────────────────────

describe('getCommandFormFields', () => {
  it('returns fields with Name, Description, Content labels', () => {
    const fields = getCommandFormFields()
    const labels = fields.map((f) => f.label)
    expect(labels).toContain('Name')
    expect(labels).toContain('Description')
    expect(labels).toContain('Content')
  })

  it('Content field is an editor', () => {
    const fields = getCommandFormFields()
    const content = fields.find((f) => f.label === 'Content')
    expect(content?.type).toBe('editor')
  })

  it('pre-fills values when entry is provided', () => {
    /** @type {import('../../../../src/types.js').CategoryEntry} */
    const entry = {
      id: 'xyz',
      name: 'refactor',
      type: 'command',
      active: true,
      environments: ['claude-code'],
      params: {content: 'line one\nline two', description: 'My command'},
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    const fields = getCommandFormFields(entry)
    const contentField = fields.find((f) => f.label === 'Content')
    expect(/** @type {any} */ (contentField).lines).toEqual(['line one', 'line two'])
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// getSkillFormFields
// ──────────────────────────────────────────────────────────────────────────────

describe('getSkillFormFields', () => {
  it('returns fields with Name, Description, Content labels', () => {
    const fields = getSkillFormFields()
    const labels = fields.map((f) => f.label)
    expect(labels).toContain('Name')
    expect(labels).toContain('Description')
    expect(labels).toContain('Content')
  })

  it('pre-fills name from entry', () => {
    /** @type {import('../../../../src/types.js').CategoryEntry} */
    const entry = {
      id: 'skill-1',
      name: 'my-skill',
      type: 'skill',
      active: true,
      environments: [],
      params: {content: 'skill content'},
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    const fields = getSkillFormFields(entry)
    const nameField = fields.find((f) => f.label === 'Name')
    expect(/** @type {any} */ (nameField).value).toBe('my-skill')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// getAgentFormFields
// ──────────────────────────────────────────────────────────────────────────────

describe('getAgentFormFields', () => {
  it('returns fields with Name, Description, Instructions labels', () => {
    const fields = getAgentFormFields()
    const labels = fields.map((f) => f.label)
    expect(labels).toContain('Name')
    expect(labels).toContain('Description')
    expect(labels).toContain('Instructions')
  })

  it('Instructions field is an editor', () => {
    const fields = getAgentFormFields()
    const instructions = fields.find((f) => f.label === 'Instructions')
    expect(instructions?.type).toBe('editor')
  })

  it('pre-fills instructions from entry', () => {
    /** @type {import('../../../../src/types.js').CategoryEntry} */
    const entry = {
      id: 'agent-1',
      name: 'my-agent',
      type: 'agent',
      active: true,
      environments: [],
      params: {instructions: 'do this\ndo that'},
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    const fields = getAgentFormFields(entry)
    const instructionsField = fields.find((f) => f.label === 'Instructions')
    expect(/** @type {any} */ (instructionsField).lines).toEqual(['do this', 'do that'])
  })
})

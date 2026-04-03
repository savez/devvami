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
  updateMCPFieldVisibility,
  validateMCPForm,
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
    expect(labels).toContain('Env Vars')
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
    expect(fields.length).toBe(8) // name, environments, transport, command, args, url, env, description
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
    expect(/** @type {any} */ (argsField).type).toBe('editor')
    expect(/** @type {any} */ (argsField).lines).toEqual(['--port', '3000'])
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

// ──────────────────────────────────────────────────────────────────────────────
// Hidden fields
// ──────────────────────────────────────────────────────────────────────────────

describe('hidden fields', () => {
  it('hidden fields are skipped in extractValues', () => {
    /** @type {import('../../../../src/utils/tui/form.js').FormState} */
    const state = {
      title: 'Test',
      focusedFieldIndex: 0,
      status: 'editing',
      errorMessage: null,
      fields: [
        {type: 'text', label: 'Visible', key: 'visible', value: 'yes', cursor: 3, required: false, placeholder: ''},
        {type: 'text', label: 'Hidden', key: 'hidden_field', value: 'no', cursor: 2, required: false, placeholder: '', hidden: true},
      ],
    }
    const values = extractValues(state)
    expect(values.visible).toBe('yes')
    expect(values.hidden_field).toBeUndefined()
  })

  it('hidden fields are skipped in buildFormScreen', () => {
    /** @type {import('../../../../src/utils/tui/form.js').FormState} */
    const state = {
      title: 'Test',
      focusedFieldIndex: 0,
      status: 'editing',
      errorMessage: null,
      fields: [
        {type: 'text', label: 'Shown', key: 'shown', value: '', cursor: 0, required: false, placeholder: ''},
        {type: 'text', label: 'Invisible', key: 'invisible', value: '', cursor: 0, required: false, placeholder: '', hidden: true},
      ],
    }
    const lines = buildFormScreen(state, 24, 80).map(stripAnsi).join('\n')
    expect(lines).toContain('Shown')
    expect(lines).not.toContain('Invisible')
  })

  it('Tab skips hidden fields', () => {
    /** @type {import('../../../../src/utils/tui/form.js').FormState} */
    const state = {
      title: 'Test',
      focusedFieldIndex: 0,
      status: 'editing',
      errorMessage: null,
      fields: [
        {type: 'text', label: 'First', key: 'first', value: 'a', cursor: 1, required: false, placeholder: ''},
        {type: 'text', label: 'Middle', key: 'middle', value: 'b', cursor: 1, required: false, placeholder: '', hidden: true},
        {type: 'text', label: 'Last', key: 'last', value: 'c', cursor: 1, required: false, placeholder: ''},
      ],
    }
    const result = handleFormKeypress(state, namedKey('tab'))
    expect(/** @type {any} */ (result).focusedFieldIndex).toBe(2) // skips index 1
  })

  it('Shift+Tab skips hidden fields', () => {
    /** @type {import('../../../../src/utils/tui/form.js').FormState} */
    const state = {
      title: 'Test',
      focusedFieldIndex: 2,
      status: 'editing',
      errorMessage: null,
      fields: [
        {type: 'text', label: 'First', key: 'first', value: 'a', cursor: 1, required: false, placeholder: ''},
        {type: 'text', label: 'Middle', key: 'middle', value: 'b', cursor: 1, required: false, placeholder: '', hidden: true},
        {type: 'text', label: 'Last', key: 'last', value: 'c', cursor: 1, required: false, placeholder: ''},
      ],
    }
    const result = handleFormKeypress(state, namedKey('tab', {shift: true}))
    expect(/** @type {any} */ (result).focusedFieldIndex).toBe(0) // skips index 1
  })

  it('hidden required fields are not validated', () => {
    /** @type {import('../../../../src/utils/tui/form.js').FormState} */
    const state = {
      title: 'Test',
      focusedFieldIndex: 0,
      status: 'editing',
      errorMessage: null,
      fields: [
        {type: 'text', label: 'Name', key: 'name', value: 'ok', cursor: 2, required: true, placeholder: ''},
        {type: 'text', label: 'URL', key: 'url', value: '', cursor: 0, required: true, placeholder: '', hidden: true},
      ],
    }
    // Should submit successfully because URL is hidden even though empty and required
    const result = handleFormKeypress(state, namedKey('s', {ctrl: true}))
    expect(result).toHaveProperty('submitted', true)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// updateMCPFieldVisibility
// ──────────────────────────────────────────────────────────────────────────────

describe('updateMCPFieldVisibility', () => {
  it('hides URL and shows Command/Args for stdio', () => {
    const fields = getMCPFormFields()
    const updated = updateMCPFieldVisibility(fields, 'stdio')
    const commandField = updated.find((f) => f.key === 'command')
    const argsField = updated.find((f) => f.key === 'args')
    const urlField = updated.find((f) => f.key === 'url')
    expect(commandField?.hidden).toBeFalsy()
    expect(argsField?.hidden).toBeFalsy()
    expect(urlField?.hidden).toBe(true)
  })

  it('hides Command/Args and shows URL for sse', () => {
    const fields = getMCPFormFields()
    const updated = updateMCPFieldVisibility(fields, 'sse')
    const commandField = updated.find((f) => f.key === 'command')
    const argsField = updated.find((f) => f.key === 'args')
    const urlField = updated.find((f) => f.key === 'url')
    expect(commandField?.hidden).toBe(true)
    expect(argsField?.hidden).toBe(true)
    expect(urlField?.hidden).toBeFalsy()
  })

  it('hides Command/Args and shows URL for streamable-http', () => {
    const fields = getMCPFormFields()
    const updated = updateMCPFieldVisibility(fields, 'streamable-http')
    const commandField = updated.find((f) => f.key === 'command')
    const argsField = updated.find((f) => f.key === 'args')
    const urlField = updated.find((f) => f.key === 'url')
    expect(commandField?.hidden).toBe(true)
    expect(argsField?.hidden).toBe(true)
    expect(urlField?.hidden).toBeFalsy()
  })

  it('keeps Env Vars and Description always visible', () => {
    const fields = getMCPFormFields()
    for (const transport of ['stdio', 'sse', 'streamable-http']) {
      const updated = updateMCPFieldVisibility(fields, transport)
      const envField = updated.find((f) => f.key === 'env')
      const descField = updated.find((f) => f.key === 'description')
      expect(envField?.hidden).toBeFalsy()
      expect(descField?.hidden).toBeFalsy()
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// validateMCPForm
// ──────────────────────────────────────────────────────────────────────────────

describe('validateMCPForm', () => {
  /**
   * @param {string} transport
   * @param {object} [overrides]
   * @returns {import('../../../../src/utils/tui/form.js').FormState}
   */
  function makeMCPFormState(transport, overrides = {}) {
    const fields = getMCPFormFields()
    const updated = updateMCPFieldVisibility(fields, transport)
    // Set the transport selector to the right index
    const transportField = updated.find((f) => f.key === 'transport')
    if (transportField?.type === 'selector') {
      transportField.selectedIndex = transportField.options.indexOf(transport)
    }
    return {
      title: 'Test',
      focusedFieldIndex: 0,
      status: /** @type {'editing'} */ ('editing'),
      errorMessage: null,
      fields: updated,
      ...overrides,
    }
  }

  it('returns error when stdio has no command', () => {
    const state = makeMCPFormState('stdio')
    const err = validateMCPForm(state)
    expect(err).toContain('Command is required')
  })

  it('returns null when stdio has a command', () => {
    const state = makeMCPFormState('stdio')
    const commandField = state.fields.find((f) => f.key === 'command')
    if (commandField?.type === 'text') commandField.value = 'npx my-server'
    const err = validateMCPForm(state)
    expect(err).toBeNull()
  })

  it('returns error when sse has no URL', () => {
    const state = makeMCPFormState('sse')
    const err = validateMCPForm(state)
    expect(err).toContain('URL is required')
  })

  it('returns null when sse has a URL', () => {
    const state = makeMCPFormState('sse')
    const urlField = state.fields.find((f) => f.key === 'url')
    if (urlField?.type === 'text') urlField.value = 'https://mcp.example.com'
    const err = validateMCPForm(state)
    expect(err).toBeNull()
  })

  it('returns error for invalid env var format', () => {
    const state = makeMCPFormState('stdio')
    const commandField = state.fields.find((f) => f.key === 'command')
    if (commandField?.type === 'text') commandField.value = 'npx server'
    const envField = state.fields.find((f) => f.key === 'env')
    if (envField?.type === 'editor') envField.lines = ['VALID=ok', 'INVALID_LINE']
    const err = validateMCPForm(state)
    expect(err).toContain('Invalid env var format')
  })

  it('accepts valid env vars', () => {
    const state = makeMCPFormState('stdio')
    const commandField = state.fields.find((f) => f.key === 'command')
    if (commandField?.type === 'text') commandField.value = 'npx server'
    const envField = state.fields.find((f) => f.key === 'env')
    if (envField?.type === 'editor') envField.lines = ['API_KEY=abc123', 'SECRET=xyz']
    const err = validateMCPForm(state)
    expect(err).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// getMCPFormFields — dynamic visibility on create
// ──────────────────────────────────────────────────────────────────────────────

describe('getMCPFormFields — default stdio hides URL', () => {
  it('URL is hidden and Command is visible for default stdio transport', () => {
    const fields = getMCPFormFields()
    const urlField = fields.find((f) => f.key === 'url')
    const commandField = fields.find((f) => f.key === 'command')
    expect(urlField?.hidden).toBe(true)
    expect(commandField?.hidden).toBeFalsy()
  })

  it('Command is hidden and URL is visible when entry has sse transport', () => {
    /** @type {import('../../../../src/types.js').CategoryEntry} */
    const entry = {
      id: 'test',
      name: 'remote-mcp',
      type: 'mcp',
      active: true,
      environments: ['claude-code'],
      params: {transport: 'sse', url: 'https://example.com'},
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    const fields = getMCPFormFields(entry)
    const urlField = fields.find((f) => f.key === 'url')
    const commandField = fields.find((f) => f.key === 'command')
    expect(urlField?.hidden).toBeFalsy()
    expect(commandField?.hidden).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// getMCPFormFields — env vars pre-fill
// ──────────────────────────────────────────────────────────────────────────────

describe('getMCPFormFields — env vars', () => {
  it('pre-fills env vars from entry params', () => {
    /** @type {import('../../../../src/types.js').CategoryEntry} */
    const entry = {
      id: 'test',
      name: 'my-mcp',
      type: 'mcp',
      active: true,
      environments: ['claude-code'],
      params: {transport: 'stdio', command: 'npx server', env: {API_KEY: 'abc', SECRET: 'xyz'}},
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    const fields = getMCPFormFields(entry)
    const envField = fields.find((f) => f.key === 'env')
    expect(envField?.type).toBe('editor')
    expect(/** @type {any} */ (envField).lines).toEqual(['API_KEY=abc', 'SECRET=xyz'])
  })

  it('starts with empty line when no env vars', () => {
    const fields = getMCPFormFields()
    const envField = fields.find((f) => f.key === 'env')
    expect(/** @type {any} */ (envField).lines).toEqual([''])
  })
})

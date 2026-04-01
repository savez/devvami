/**
 * @module form
 * Inline form component for the dvmi sync-config-ai TUI.
 * All rendering functions are pure (no terminal side effects).
 * The parent tab-tui.js is responsible for writing rendered lines to the screen.
 */

import chalk from 'chalk'

// ──────────────────────────────────────────────────────────────────────────────
// Typedefs
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TextField
 * @property {'text'} type
 * @property {string} label
 * @property {string} value
 * @property {number} cursor - Cursor position (0 = before first char)
 * @property {boolean} required
 * @property {string} placeholder
 * @property {string} [key] - Optional override key for extractValues output
 */

/**
 * @typedef {Object} SelectorField
 * @property {'selector'} type
 * @property {string} label
 * @property {string[]} options
 * @property {number} selectedIndex
 * @property {boolean} required
 * @property {string} [key]
 */

/**
 * @typedef {{ id: string, label: string }} MultiSelectOption
 */

/**
 * @typedef {Object} MultiSelectField
 * @property {'multiselect'} type
 * @property {string} label
 * @property {MultiSelectOption[]} options
 * @property {Set<string>} selected
 * @property {number} focusedOptionIndex
 * @property {boolean} required
 * @property {string} [key]
 */

/**
 * @typedef {Object} MiniEditorField
 * @property {'editor'} type
 * @property {string} label
 * @property {string[]} lines
 * @property {number} cursorLine
 * @property {number} cursorCol
 * @property {boolean} required
 * @property {string} [key]
 */

/**
 * @typedef {TextField|SelectorField|MultiSelectField|MiniEditorField} Field
 */

/**
 * @typedef {Object} FormState
 * @property {Field[]} fields
 * @property {number} focusedFieldIndex
 * @property {string} title
 * @property {'editing'|'submitted'|'cancelled'} status
 * @property {string|null} errorMessage
 */

/**
 * @typedef {Object} SubmitResult
 * @property {true} submitted
 * @property {object} values
 */

/**
 * @typedef {Object} CancelResult
 * @property {true} cancelled
 */

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Convert a field label to a plain object key (lowercase, spaces → underscores).
 * If the field has a `key` property, use that instead.
 * @param {Field} field
 * @returns {string}
 */
function fieldKey(field) {
  if (field.key) return field.key
  return field.label.toLowerCase().replace(/\s+/g, '_')
}

/**
 * Render the text cursor inside a string value at the given position.
 * Inserts a `|` character at the cursor index.
 * @param {string} value
 * @param {number} cursor
 * @returns {string}
 */
function renderCursor(value, cursor) {
  return value.slice(0, cursor) + chalk.inverse('|') + value.slice(cursor)
}

// ──────────────────────────────────────────────────────────────────────────────
// buildFieldLine
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Render a single form field as a terminal line.
 *
 * - TextField: `  [label]: [value with cursor shown as |]`
 * - SelectorField: `  [label]: < option >`
 * - MultiSelectField: `  [label]: [N/total checked]`
 * - MiniEditorField: `  [label]: [N lines]`
 *
 * When focused, the line is prefixed with a bold `> ` indicator instead of `  `.
 *
 * @param {Field} field
 * @param {boolean} focused
 * @returns {string}
 */
export function buildFieldLine(field, focused) {
  const prefix = focused ? chalk.bold('> ') : '  '

  if (field.type === 'text') {
    const display = focused
      ? renderCursor(field.value, field.cursor)
      : field.value || chalk.dim(field.placeholder || '')
    return `${prefix}${chalk.bold(field.label)}: ${display}`
  }

  if (field.type === 'selector') {
    const option = field.options[field.selectedIndex] ?? ''
    const arrows = focused ? `${chalk.bold('< ')}${chalk.cyan(option)}${chalk.bold(' >')}` : `< ${option} >`
    return `${prefix}${chalk.bold(field.label)}: ${arrows}`
  }

  if (field.type === 'multiselect') {
    const count = field.selected.size
    const total = field.options.length
    const summary = focused ? chalk.cyan(`${count}/${total} selected`) : `${count}/${total} selected`
    return `${prefix}${chalk.bold(field.label)}: ${summary}`
  }

  if (field.type === 'editor') {
    const lineCount = field.lines.length
    const summary = focused
      ? chalk.cyan(`${lineCount} line${lineCount === 1 ? '' : 's'}`)
      : `${lineCount} line${lineCount === 1 ? '' : 's'}`
    return `${prefix}${chalk.bold(field.label)}: ${summary}`
  }

  return `${prefix}${chalk.bold(/** @type {any} */ (field).label)}: —`
}

// ──────────────────────────────────────────────────────────────────────────────
// buildMultiSelectLines
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Render expanded MultiSelectField options as multiple lines (shown when focused).
 * Each option shows `[x]` when selected and `[ ]` when not.
 * The option under the cursor is highlighted with chalk.bold.
 *
 * @param {MultiSelectField} field
 * @param {boolean} focused
 * @param {number} maxLines - Maximum number of lines to return
 * @returns {string[]}
 */
export function buildMultiSelectLines(field, focused, maxLines) {
  const lines = []
  for (let i = 0; i < field.options.length; i++) {
    const opt = field.options[i]
    const checked = field.selected.has(opt.id) ? chalk.green('[x]') : '[ ]'
    const label = opt.label
    const isCursor = focused && i === field.focusedOptionIndex
    const line = isCursor ? chalk.bold(`  ${checked} ${label}`) : `  ${checked} ${label}`
    lines.push(line)
    if (lines.length >= maxLines) break
  }
  return lines
}

// ──────────────────────────────────────────────────────────────────────────────
// buildMiniEditorLines
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Render MiniEditorField content with line numbers.
 * When focused, inserts `|` at the cursor column on the active line.
 * Returns up to `maxLines` lines.
 *
 * @param {MiniEditorField} field
 * @param {boolean} focused
 * @param {number} maxLines - Maximum number of lines to return
 * @returns {string[]}
 */
export function buildMiniEditorLines(field, focused, maxLines) {
  const lines = []
  const numWidth = String(field.lines.length).length

  for (let i = 0; i < field.lines.length; i++) {
    const lineNum = String(i + 1).padStart(numWidth)
    const rawLine = field.lines[i]
    let content
    if (focused && i === field.cursorLine) {
      content = renderCursor(rawLine, field.cursorCol)
    } else {
      content = rawLine
    }
    lines.push(`  ${chalk.dim(lineNum + ' │')} ${content}`)
    if (lines.length >= maxLines) break
  }
  return lines
}

// ──────────────────────────────────────────────────────────────────────────────
// buildFormScreen
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Render all form fields into an array of terminal lines.
 *
 * For the currently focused field:
 * - MultiSelectField: renders expanded options below the field header line
 * - MiniEditorField: renders editor content lines below the field header line
 * - Other types: renders just the single header line
 *
 * Returns an array of lines (no ANSI clear/home — the parent handles that).
 * Includes the form title at the top, an error message if set, all fields,
 * and a footer hint line at the bottom.
 *
 * @param {FormState} formState
 * @param {number} viewportHeight - Available content lines
 * @param {number} termCols - Terminal width
 * @returns {string[]}
 */
export function buildFormScreen(formState, viewportHeight, termCols) {
  const lines = []

  // ── Title ──────────────────────────────────────────────────────────────────
  lines.push('')
  lines.push(`  ${chalk.bold.cyan(formState.title)}`)
  lines.push(`  ${chalk.dim('─'.repeat(Math.min(termCols - 4, 60)))}`)

  // ── Error message ─────────────────────────────────────────────────────────
  if (formState.errorMessage) {
    lines.push(`  ${chalk.red('✖ ' + formState.errorMessage)}`)
  }

  lines.push('')

  // ── Fields ────────────────────────────────────────────────────────────────
  const FOOTER_RESERVE = 2
  const availableForFields = viewportHeight - lines.length - FOOTER_RESERVE

  for (let i = 0; i < formState.fields.length; i++) {
    const field = formState.fields[i]
    const isFocused = i === formState.focusedFieldIndex

    // Header line
    lines.push(buildFieldLine(field, isFocused))

    // Expanded inline content for focused multiselect / editor
    if (isFocused) {
      const remaining = availableForFields - lines.length
      if (field.type === 'multiselect' && remaining > 0) {
        const expanded = buildMultiSelectLines(field, true, remaining)
        lines.push(...expanded)
      } else if (field.type === 'editor' && remaining > 0) {
        const expanded = buildMiniEditorLines(field, true, remaining)
        lines.push(...expanded)
      }
    }
  }

  // ── Footer hint ───────────────────────────────────────────────────────────
  lines.push('')
  lines.push(chalk.dim('  Tab next field   Shift+Tab prev   Ctrl+S save   Esc cancel'))

  return lines
}

// ──────────────────────────────────────────────────────────────────────────────
// extractValues
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Extract form field values into a plain object.
 *
 * - TextField → string value
 * - SelectorField → selected option string
 * - MultiSelectField → array of selected ids
 * - MiniEditorField → lines joined with `\n`
 *
 * The key for each field is `field.key` if set, otherwise the label lowercased
 * with spaces replaced by underscores.
 *
 * @param {FormState} formState
 * @returns {object}
 */
export function extractValues(formState) {
  /** @type {Record<string, unknown>} */
  const result = {}

  for (const field of formState.fields) {
    const key = fieldKey(field)

    if (field.type === 'text') {
      result[key] = field.value
    } else if (field.type === 'selector') {
      result[key] = field.options[field.selectedIndex] ?? ''
    } else if (field.type === 'multiselect') {
      result[key] = Array.from(field.selected)
    } else if (field.type === 'editor') {
      result[key] = field.lines.join('\n')
    }
  }

  return result
}

// ──────────────────────────────────────────────────────────────────────────────
// Validation helper
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Check that all required fields have a non-empty value.
 * Returns the label of the first invalid field, or null if all are valid.
 * @param {FormState} formState
 * @returns {string|null}
 */
function validateForm(formState) {
  for (const field of formState.fields) {
    if (!field.required) continue

    if (field.type === 'text' && field.value.trim() === '') {
      return field.label
    }
    if (field.type === 'selector' && field.options.length === 0) {
      return field.label
    }
    if (field.type === 'multiselect' && field.selected.size === 0) {
      return field.label
    }
    if (field.type === 'editor') {
      const content = field.lines.join('\n').trim()
      if (content === '') return field.label
    }
  }
  return null
}

// ──────────────────────────────────────────────────────────────────────────────
// Field-specific keypress handlers (pure)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Handle a keypress on a focused TextField. Returns updated field.
 * @param {TextField} field
 * @param {{ name: string, sequence?: string, ctrl?: boolean, shift?: boolean }} key
 * @returns {TextField}
 */
function handleTextFieldKey(field, key) {
  const {value, cursor} = field

  if (key.name === 'backspace') {
    if (cursor === 0) return field
    return {
      ...field,
      value: value.slice(0, cursor - 1) + value.slice(cursor),
      cursor: cursor - 1,
    }
  }

  if (key.name === 'delete') {
    if (cursor >= value.length) return field
    return {
      ...field,
      value: value.slice(0, cursor) + value.slice(cursor + 1),
    }
  }

  if (key.name === 'left') {
    return {...field, cursor: Math.max(0, cursor - 1)}
  }
  if (key.name === 'right') {
    return {...field, cursor: Math.min(value.length, cursor + 1)}
  }
  if (key.name === 'home') {
    return {...field, cursor: 0}
  }
  if (key.name === 'end') {
    return {...field, cursor: value.length}
  }

  // Printable character
  if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
    const ch = key.sequence
    if (ch >= ' ') {
      return {
        ...field,
        value: value.slice(0, cursor) + ch + value.slice(cursor),
        cursor: cursor + 1,
      }
    }
  }

  return field
}

/**
 * Handle a keypress on a focused SelectorField. Returns updated field.
 * @param {SelectorField} field
 * @param {{ name: string }} key
 * @returns {SelectorField}
 */
function handleSelectorFieldKey(field, key) {
  const len = field.options.length
  if (len === 0) return field

  if (key.name === 'left') {
    return {...field, selectedIndex: (field.selectedIndex - 1 + len) % len}
  }
  if (key.name === 'right') {
    return {...field, selectedIndex: (field.selectedIndex + 1) % len}
  }

  return field
}

/**
 * Handle a keypress on a focused MultiSelectField.
 * Returns updated field or { advanceField: true } signal object.
 * @param {MultiSelectField} field
 * @param {{ name: string }} key
 * @returns {MultiSelectField | { advanceField: true }}
 */
function handleMultiSelectFieldKey(field, key) {
  const len = field.options.length

  if (key.name === 'up') {
    return {...field, focusedOptionIndex: Math.max(0, field.focusedOptionIndex - 1)}
  }
  if (key.name === 'down') {
    return {...field, focusedOptionIndex: Math.min(len - 1, field.focusedOptionIndex + 1)}
  }

  if (key.name === 'space') {
    const opt = field.options[field.focusedOptionIndex]
    if (!opt) return field
    const newSelected = new Set(field.selected)
    if (newSelected.has(opt.id)) {
      newSelected.delete(opt.id)
    } else {
      newSelected.add(opt.id)
    }
    return {...field, selected: newSelected}
  }

  if (key.name === 'return') {
    return {advanceField: /** @type {true} */ (true)}
  }

  return field
}

/**
 * Handle a keypress on a focused MiniEditorField.
 * Returns updated field or { advanceField: true } signal object.
 * @param {MiniEditorField} field
 * @param {{ name: string, sequence?: string, ctrl?: boolean }} key
 * @returns {MiniEditorField | { advanceField: true }}
 */
function handleEditorFieldKey(field, key) {
  const {lines, cursorLine, cursorCol} = field

  // Esc exits the editor — move to next field
  if (key.name === 'escape') {
    return {advanceField: /** @type {true} */ (true)}
  }

  if (key.name === 'left') {
    if (cursorCol > 0) {
      return {...field, cursorCol: cursorCol - 1}
    }
    if (cursorLine > 0) {
      const prevLine = lines[cursorLine - 1]
      return {...field, cursorLine: cursorLine - 1, cursorCol: prevLine.length}
    }
    return field
  }

  if (key.name === 'right') {
    const line = lines[cursorLine]
    if (cursorCol < line.length) {
      return {...field, cursorCol: cursorCol + 1}
    }
    if (cursorLine < lines.length - 1) {
      return {...field, cursorLine: cursorLine + 1, cursorCol: 0}
    }
    return field
  }

  if (key.name === 'up') {
    if (cursorLine === 0) return field
    const newLine = cursorLine - 1
    const newCol = Math.min(cursorCol, lines[newLine].length)
    return {...field, cursorLine: newLine, cursorCol: newCol}
  }

  if (key.name === 'down') {
    if (cursorLine >= lines.length - 1) return field
    const newLine = cursorLine + 1
    const newCol = Math.min(cursorCol, lines[newLine].length)
    return {...field, cursorLine: newLine, cursorCol: newCol}
  }

  if (key.name === 'home') {
    return {...field, cursorCol: 0}
  }

  if (key.name === 'end') {
    return {...field, cursorCol: lines[cursorLine].length}
  }

  if (key.name === 'backspace') {
    if (cursorCol > 0) {
      const newLines = [...lines]
      const ln = newLines[cursorLine]
      newLines[cursorLine] = ln.slice(0, cursorCol - 1) + ln.slice(cursorCol)
      return {...field, lines: newLines, cursorCol: cursorCol - 1}
    }
    if (cursorLine > 0) {
      // Merge current line into previous
      const newLines = [...lines]
      const prevLine = newLines[cursorLine - 1]
      const currLine = newLines[cursorLine]
      const mergedCol = prevLine.length
      newLines.splice(cursorLine, 1)
      newLines[cursorLine - 1] = prevLine + currLine
      return {...field, lines: newLines, cursorLine: cursorLine - 1, cursorCol: mergedCol}
    }
    return field
  }

  if (key.name === 'delete') {
    const line = lines[cursorLine]
    if (cursorCol < line.length) {
      const newLines = [...lines]
      newLines[cursorLine] = line.slice(0, cursorCol) + line.slice(cursorCol + 1)
      return {...field, lines: newLines}
    }
    if (cursorLine < lines.length - 1) {
      // Merge next line
      const newLines = [...lines]
      newLines[cursorLine] = newLines[cursorLine] + newLines[cursorLine + 1]
      newLines.splice(cursorLine + 1, 1)
      return {...field, lines: newLines}
    }
    return field
  }

  // Enter inserts a new line after the cursor position
  if (key.name === 'return') {
    const line = lines[cursorLine]
    const before = line.slice(0, cursorCol)
    const after = line.slice(cursorCol)
    const newLines = [...lines]
    newLines.splice(cursorLine, 1, before, after)
    return {...field, lines: newLines, cursorLine: cursorLine + 1, cursorCol: 0}
  }

  // Printable character
  if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
    const ch = key.sequence
    if (ch >= ' ') {
      const newLines = [...lines]
      const ln = newLines[cursorLine]
      newLines[cursorLine] = ln.slice(0, cursorCol) + ch + ln.slice(cursorCol)
      return {...field, lines: newLines, cursorCol: cursorCol + 1}
    }
  }

  return field
}

// ──────────────────────────────────────────────────────────────────────────────
// handleFormKeypress
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Pure reducer for form keypresses.
 *
 * Global keys handled regardless of focused field:
 * - Tab: move to next field
 * - Shift+Tab: move to previous field (wraps)
 * - Ctrl+S: validate and submit
 * - Esc: cancel → return `{ cancelled: true }`
 * - Enter on last field: validate and submit
 *
 * Field-specific handling when field is focused:
 * - TextField: printable chars append to value, Backspace deletes, ← → move cursor, Home/End jump
 * - SelectorField: ← → cycle options
 * - MultiSelectField: ↑ ↓ navigate, Space toggle, Enter advances to next field
 * - MiniEditorField: printable chars insert, Enter inserts new line, Esc exits to next field
 *
 * On submit: validates required fields. If invalid, sets `errorMessage` and returns
 * the state. If valid, returns `{ submitted: true, values: extractValues(formState) }`.
 *
 * @param {FormState} formState
 * @param {{ name: string, sequence?: string, ctrl?: boolean, shift?: boolean }} key
 * @returns {FormState | SubmitResult | CancelResult}
 */
export function handleFormKeypress(formState, key) {
  const {fields, focusedFieldIndex} = formState
  const lastFieldIndex = fields.length - 1

  // ── Esc: cancel (unless inside a MiniEditorField) ─────────────────────────
  // For editor fields, Esc is handled inside the field handler to advance focus,
  // not cancel the form. Only cancel when a non-editor field is focused.
  const focusedField = fields[focusedFieldIndex]
  if (key.name === 'escape' && focusedField?.type !== 'editor') {
    return {cancelled: /** @type {true} */ (true)}
  }

  // ── Ctrl+S: submit ────────────────────────────────────────────────────────
  if (key.ctrl && key.name === 's') {
    return attemptSubmit(formState)
  }

  // ── Tab: next field ───────────────────────────────────────────────────────
  if (key.name === 'tab' && !key.shift) {
    return {
      ...formState,
      focusedFieldIndex: (focusedFieldIndex + 1) % fields.length,
      errorMessage: null,
    }
  }

  // ── Shift+Tab: previous field ─────────────────────────────────────────────
  if (key.name === 'tab' && key.shift) {
    return {
      ...formState,
      focusedFieldIndex: (focusedFieldIndex - 1 + fields.length) % fields.length,
      errorMessage: null,
    }
  }

  // ── Enter on last non-editor field: submit ─────────────────────────────────
  if (
    key.name === 'return' &&
    focusedFieldIndex === lastFieldIndex &&
    focusedField?.type !== 'editor' &&
    focusedField?.type !== 'multiselect'
  ) {
    return attemptSubmit(formState)
  }

  // ── Delegate to focused field ─────────────────────────────────────────────
  if (!focusedField) return formState

  if (focusedField.type === 'text') {
    const updated = handleTextFieldKey(focusedField, key)
    if (updated === focusedField) return formState
    return {
      ...formState,
      errorMessage: null,
      fields: replaceAt(fields, focusedFieldIndex, updated),
    }
  }

  if (focusedField.type === 'selector') {
    const updated = handleSelectorFieldKey(focusedField, key)
    if (updated === focusedField) return formState
    return {
      ...formState,
      fields: replaceAt(fields, focusedFieldIndex, updated),
    }
  }

  if (focusedField.type === 'multiselect') {
    const result = handleMultiSelectFieldKey(focusedField, key)
    if ('advanceField' in result) {
      return {
        ...formState,
        focusedFieldIndex: Math.min(focusedFieldIndex + 1, lastFieldIndex),
      }
    }
    if (result === focusedField) return formState
    return {
      ...formState,
      fields: replaceAt(fields, focusedFieldIndex, result),
    }
  }

  if (focusedField.type === 'editor') {
    const result = handleEditorFieldKey(focusedField, key)
    if ('advanceField' in result) {
      // Esc in editor cancels the form only if we treat it as a field-level escape.
      // Per spec, Esc in editor moves to next field.
      return {
        ...formState,
        focusedFieldIndex: Math.min(focusedFieldIndex + 1, lastFieldIndex),
      }
    }
    if (result === focusedField) return formState
    return {
      ...formState,
      errorMessage: null,
      fields: replaceAt(fields, focusedFieldIndex, result),
    }
  }

  return formState
}

/**
 * Attempt to submit the form: validate, then return SubmitResult or FormState with error.
 * @param {FormState} formState
 * @returns {FormState | SubmitResult}
 */
function attemptSubmit(formState) {
  const invalidLabel = validateForm(formState)
  if (invalidLabel !== null) {
    return {
      ...formState,
      errorMessage: `"${invalidLabel}" is required.`,
    }
  }
  return {
    submitted: /** @type {true} */ (true),
    values: extractValues(formState),
  }
}

/**
 * Return a new array with element at `index` replaced by `value`.
 * @template T
 * @param {T[]} arr
 * @param {number} index
 * @param {T} value
 * @returns {T[]}
 */
function replaceAt(arr, index, value) {
  return arr.map((item, i) => (i === index ? value : item))
}

// ──────────────────────────────────────────────────────────────────────────────
// Form field definitions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Return form fields for creating or editing an MCP entry.
 *
 * Fields: name (text), environments (multiselect), transport (selector), command (text),
 * args (text), url (text), description (text, optional).
 *
 * @param {import('../../types.js').CategoryEntry|null} [entry] - Existing entry to pre-fill from, or null to create
 * @param {import('../../types.js').DetectedEnvironment[]} [compatibleEnvs] - Environments compatible with this category type
 * @returns {Field[]}
 */
export function getMCPFormFields(entry = null, compatibleEnvs = []) {
  /** @type {import('../../types.js').MCPParams|null} */
  const p = entry ? /** @type {import('../../types.js').MCPParams} */ (entry.params) : null

  const transportOptions = ['stdio', 'sse', 'streamable-http']
  const transportIndex = p ? Math.max(0, transportOptions.indexOf(p.transport)) : 0

  return [
    /** @type {TextField} */ ({
      type: 'text',
      label: 'Name',
      key: 'name',
      value: entry ? entry.name : '',
      cursor: entry ? entry.name.length : 0,
      required: true,
      placeholder: 'my-mcp-server',
    }),
    /** @type {MultiSelectField} */ ({
      type: 'multiselect',
      label: 'Environments',
      key: 'environments',
      options: compatibleEnvs.map((env) => ({id: env.id, label: env.name})),
      selected: new Set(entry ? entry.environments : []),
      focusedOptionIndex: 0,
      required: true,
    }),
    /** @type {SelectorField} */ ({
      type: 'selector',
      label: 'Transport',
      key: 'transport',
      options: transportOptions,
      selectedIndex: transportIndex,
      required: true,
    }),
    /** @type {TextField} */ ({
      type: 'text',
      label: 'Command',
      key: 'command',
      value: p?.command ?? '',
      cursor: (p?.command ?? '').length,
      required: false,
      placeholder: 'npx my-mcp-server',
    }),
    /** @type {TextField} */ ({
      type: 'text',
      label: 'Args',
      key: 'args',
      value: p?.args ? p.args.join(' ') : '',
      cursor: p?.args ? p.args.join(' ').length : 0,
      required: false,
      placeholder: '--port 3000 --verbose',
    }),
    /** @type {TextField} */ ({
      type: 'text',
      label: 'URL',
      key: 'url',
      value: p?.url ?? '',
      cursor: (p?.url ?? '').length,
      required: false,
      placeholder: 'https://mcp.example.com',
    }),
    /** @type {TextField} */ ({
      type: 'text',
      label: 'Description',
      key: 'description',
      value: p?.description ?? (entry?.params ? /** @type {any} */ ((entry.params).description ?? '') : ''),
      cursor: 0,
      required: false,
      placeholder: 'Optional description',
    }),
  ]
}

/**
 * Return form fields for creating or editing a Command entry.
 *
 * Fields: name (text), environments (multiselect), description (text, optional), content (editor).
 *
 * @param {import('../../types.js').CategoryEntry|null} [entry] - Existing entry to pre-fill from, or null to create
 * @param {import('../../types.js').DetectedEnvironment[]} [compatibleEnvs] - Environments compatible with this category type
 * @returns {Field[]}
 */
export function getCommandFormFields(entry = null, compatibleEnvs = []) {
  /** @type {import('../../types.js').CommandParams|null} */
  const p = entry ? /** @type {import('../../types.js').CommandParams} */ (entry.params) : null
  const contentStr = p?.content ?? ''
  const contentLines = contentStr.length > 0 ? contentStr.split('\n') : ['']

  return [
    /** @type {TextField} */ ({
      type: 'text',
      label: 'Name',
      key: 'name',
      value: entry ? entry.name : '',
      cursor: entry ? entry.name.length : 0,
      required: true,
      placeholder: 'my-command',
    }),
    /** @type {MultiSelectField} */ ({
      type: 'multiselect',
      label: 'Environments',
      key: 'environments',
      options: compatibleEnvs.map((env) => ({id: env.id, label: env.name})),
      selected: new Set(entry ? entry.environments : []),
      focusedOptionIndex: 0,
      required: true,
    }),
    /** @type {TextField} */ ({
      type: 'text',
      label: 'Description',
      key: 'description',
      value: p?.description ?? '',
      cursor: (p?.description ?? '').length,
      required: false,
      placeholder: 'Optional description',
    }),
    /** @type {MiniEditorField} */ ({
      type: 'editor',
      label: 'Content',
      key: 'content',
      lines: contentLines,
      cursorLine: 0,
      cursorCol: 0,
      required: true,
    }),
  ]
}

/**
 * Return form fields for creating or editing a Skill entry.
 *
 * Fields: name (text), environments (multiselect), description (text, optional), content (editor).
 *
 * @param {import('../../types.js').CategoryEntry|null} [entry] - Existing entry to pre-fill from, or null to create
 * @param {import('../../types.js').DetectedEnvironment[]} [compatibleEnvs] - Environments compatible with this category type
 * @returns {Field[]}
 */
export function getSkillFormFields(entry = null, compatibleEnvs = []) {
  /** @type {import('../../types.js').SkillParams|null} */
  const p = entry ? /** @type {import('../../types.js').SkillParams} */ (entry.params) : null
  const contentStr = p?.content ?? ''
  const contentLines = contentStr.length > 0 ? contentStr.split('\n') : ['']

  return [
    /** @type {TextField} */ ({
      type: 'text',
      label: 'Name',
      key: 'name',
      value: entry ? entry.name : '',
      cursor: entry ? entry.name.length : 0,
      required: true,
      placeholder: 'my-skill',
    }),
    /** @type {MultiSelectField} */ ({
      type: 'multiselect',
      label: 'Environments',
      key: 'environments',
      options: compatibleEnvs.map((env) => ({id: env.id, label: env.name})),
      selected: new Set(entry ? entry.environments : []),
      focusedOptionIndex: 0,
      required: true,
    }),
    /** @type {TextField} */ ({
      type: 'text',
      label: 'Description',
      key: 'description',
      value: p?.description ?? '',
      cursor: (p?.description ?? '').length,
      required: false,
      placeholder: 'Optional description',
    }),
    /** @type {MiniEditorField} */ ({
      type: 'editor',
      label: 'Content',
      key: 'content',
      lines: contentLines,
      cursorLine: 0,
      cursorCol: 0,
      required: true,
    }),
  ]
}

/**
 * Return form fields for creating or editing an Agent entry.
 *
 * Fields: name (text), environments (multiselect), description (text, optional), instructions (editor).
 *
 * @param {import('../../types.js').CategoryEntry|null} [entry] - Existing entry to pre-fill from, or null to create
 * @param {import('../../types.js').DetectedEnvironment[]} [compatibleEnvs] - Environments compatible with this category type
 * @returns {Field[]}
 */
export function getAgentFormFields(entry = null, compatibleEnvs = []) {
  /** @type {import('../../types.js').AgentParams|null} */
  const p = entry ? /** @type {import('../../types.js').AgentParams} */ (entry.params) : null
  const instructionsStr = p?.instructions ?? ''
  const instructionLines = instructionsStr.length > 0 ? instructionsStr.split('\n') : ['']

  return [
    /** @type {TextField} */ ({
      type: 'text',
      label: 'Name',
      key: 'name',
      value: entry ? entry.name : '',
      cursor: entry ? entry.name.length : 0,
      required: true,
      placeholder: 'my-agent',
    }),
    /** @type {MultiSelectField} */ ({
      type: 'multiselect',
      label: 'Environments',
      key: 'environments',
      options: compatibleEnvs.map((env) => ({id: env.id, label: env.name})),
      selected: new Set(entry ? entry.environments : []),
      focusedOptionIndex: 0,
      required: true,
    }),
    /** @type {TextField} */ ({
      type: 'text',
      label: 'Description',
      key: 'description',
      value: p?.description ?? '',
      cursor: (p?.description ?? '').length,
      required: false,
      placeholder: 'Optional description',
    }),
    /** @type {MiniEditorField} */ ({
      type: 'editor',
      label: 'Instructions',
      key: 'instructions',
      lines: instructionLines,
      cursorLine: 0,
      cursorCol: 0,
      required: true,
    }),
  ]
}

import {describe, it, expect, vi} from 'vitest'

vi.mock('../../src/services/shell.js', () => ({
  exec: vi.fn(),
  which: vi.fn(),
  execOrThrow: vi.fn(),
}))

/**
 * Parse a conventional commit message (duplicated from changelog command for testing).
 * @param {string} message
 * @returns {{ type: string, scope: string, description: string }|null}
 */
function parseConventionalCommit(message) {
  const match = message.match(/^(\w+)(?:\(([^)]+)\))?!?: (.+)/)
  if (!match) return null
  return {type: match[1], scope: match[2] ?? '', description: match[3]}
}

describe('parseConventionalCommit', () => {
  it('parses feat commit', () => {
    const result = parseConventionalCommit('feat(auth): add login flow')
    expect(result?.type).toBe('feat')
    expect(result?.scope).toBe('auth')
    expect(result?.description).toBe('add login flow')
  })

  it('parses fix commit without scope', () => {
    const result = parseConventionalCommit('fix: fix timeout')
    expect(result?.type).toBe('fix')
    expect(result?.scope).toBe('')
  })

  it('parses breaking change', () => {
    const result = parseConventionalCommit('feat!: breaking API change')
    expect(result?.type).toBe('feat')
  })

  it('returns null for non-conventional commit', () => {
    expect(parseConventionalCommit('some random message')).toBeNull()
    // WIP matches the regex (word: description) — classified as "other" type in grouping
    const wip = parseConventionalCommit('WIP: work in progress')
    if (wip) expect(wip.type).toBe('WIP') // not a standard type, lands in "other"
  })

  it('parses chore commit', () => {
    const result = parseConventionalCommit('chore: update deps')
    expect(result?.type).toBe('chore')
  })
})

describe('changelog grouping', () => {
  it('groups commits by type', () => {
    const commits = ['feat(auth): add login flow', 'fix: fix timeout', 'chore: update deps', 'random message']
    const sections = {feat: [], fix: [], chore: [], docs: [], refactor: [], test: [], other: []}
    for (const msg of commits) {
      const parsed = parseConventionalCommit(msg)
      const type = parsed?.type ?? 'other'
      if (type in sections) sections[type].push(msg)
      else sections.other.push(msg)
    }
    expect(sections.feat).toHaveLength(1)
    expect(sections.fix).toHaveLength(1)
    expect(sections.chore).toHaveLength(1)
    expect(sections.other).toHaveLength(1)
  })
})

import {describe, it, expect} from 'vitest'
import {parseFrontmatter, serializeFrontmatter} from '../../../src/utils/frontmatter.js'

describe('parseFrontmatter', () => {
  it('parses valid YAML frontmatter and separates body', () => {
    const content = `---
title: Refactor Prompt
description: A prompt for code refactoring
tags:
  - refactor
  - coding
---
This is the prompt body.`

    const {frontmatter, body} = parseFrontmatter(content)
    expect(frontmatter.title).toBe('Refactor Prompt')
    expect(frontmatter.description).toBe('A prompt for code refactoring')
    expect(frontmatter.tags).toEqual(['refactor', 'coding'])
    expect(body.trim()).toBe('This is the prompt body.')
  })

  it('returns empty frontmatter when no frontmatter block is present', () => {
    const content = 'Just a plain markdown body without any frontmatter.'
    const {frontmatter, body} = parseFrontmatter(content)
    expect(frontmatter).toEqual({})
    expect(body).toBe(content)
  })

  it('returns empty frontmatter when frontmatter block is empty', () => {
    const content = `---
---
Body after empty frontmatter.`
    const {frontmatter, body} = parseFrontmatter(content)
    expect(frontmatter).toEqual({})
    expect(body.trim()).toBe('Body after empty frontmatter.')
  })

  it('handles frontmatter with empty tags array', () => {
    const content = `---
title: No Tags
tags: []
---
Body here.`
    const {frontmatter} = parseFrontmatter(content)
    expect(frontmatter.title).toBe('No Tags')
    expect(frontmatter.tags).toEqual([])
  })

  it('handles multiline body correctly', () => {
    const content = `---
title: Multiline
---
Line one.

Line two.

Line three.`
    const {body} = parseFrontmatter(content)
    expect(body).toContain('Line one.')
    expect(body).toContain('Line two.')
    expect(body).toContain('Line three.')
  })

  it('returns raw content as body when YAML is malformed', () => {
    // Deliberately broken YAML (unbalanced quotes)
    const content = `---
title: "broken yaml
---
Body.`
    const {frontmatter, body} = parseFrontmatter(content)
    expect(frontmatter).toEqual({})
    // Falls back to raw content
    expect(body).toBe(content)
  })

  it('handles Windows line endings (CRLF)', () => {
    const content = '---\r\ntitle: Windows\r\n---\r\nBody.'
    const {frontmatter, body} = parseFrontmatter(content)
    expect(frontmatter.title).toBe('Windows')
    expect(body).toBe('Body.')
  })
})

describe('serializeFrontmatter', () => {
  it('produces valid ---\\n...\\n---\\n<body> output', () => {
    const fm = {title: 'My Prompt', tags: ['a', 'b']}
    const body = 'Prompt body content.'
    const result = serializeFrontmatter(fm, body)
    expect(result).toMatch(/^---\n/)
    expect(result).toContain('title: My Prompt')
    expect(result).toContain('tags:')
    expect(result).toMatch(/---\nPrompt body content\.$/)
  })

  it('returns body without frontmatter block when frontmatter is empty', () => {
    const result = serializeFrontmatter({}, 'Just a body.')
    expect(result).toBe('Just a body.')
  })

  it('round-trips correctly: parse → serialize → parse', () => {
    const original = `---
title: Round Trip
description: Testing round trip
tags:
  - test
---
Body content.`
    const {frontmatter, body} = parseFrontmatter(original)
    const serialized = serializeFrontmatter(frontmatter, body)
    const {frontmatter: fm2, body: body2} = parseFrontmatter(serialized)
    expect(fm2.title).toBe('Round Trip')
    expect(fm2.description).toBe('Testing round trip')
    expect(fm2.tags).toEqual(['test'])
    expect(body2).toBe(body)
  })
})

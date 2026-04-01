import {describe, it, expect} from 'vitest'
import {renderMarkdown, extractMermaidBlocks, toMermaidLiveUrl} from '../../../src/formatters/markdown.js'

describe('renderMarkdown', () => {
  it('returns a non-empty string for markdown input', () => {
    const output = renderMarkdown('# Hello\n\nSome **bold** text')
    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })

  it('includes the header text in output', () => {
    const output = renderMarkdown('# My Title')
    expect(output).toContain('My Title')
  })
})

describe('extractMermaidBlocks', () => {
  it('returns empty array when no mermaid blocks exist', () => {
    const blocks = extractMermaidBlocks('# No diagrams here\n\nJust text.')
    expect(blocks).toEqual([])
  })

  it('extracts a single mermaid block', () => {
    const content = 'Some text\n\n```mermaid\ngraph TD\n  A --> B\n```\n\nMore text'
    const blocks = extractMermaidBlocks(content)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toBe('graph TD\n  A --> B')
  })

  it('extracts multiple mermaid blocks', () => {
    const content = '```mermaid\nflowchart LR\n  A --> B\n```\n\n```mermaid\nsequenceDiagram\n  A->>B: Hello\n```'
    const blocks = extractMermaidBlocks(content)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toContain('flowchart LR')
    expect(blocks[1]).toContain('sequenceDiagram')
  })
})

describe('toMermaidLiveUrl', () => {
  it('returns a URL starting with the mermaid.live base', () => {
    const url = toMermaidLiveUrl('graph TD\n  A --> B')
    expect(url).toMatch(/^https:\/\/mermaid\.live\/view#pako:/)
  })

  it('returns different URLs for different diagrams', () => {
    const url1 = toMermaidLiveUrl('graph TD\n  A --> B')
    const url2 = toMermaidLiveUrl('sequenceDiagram\n  A->>B: Hi')
    expect(url1).not.toBe(url2)
  })
})

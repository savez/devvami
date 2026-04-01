import {describe, it, expect, vi, beforeEach} from 'vitest'
import {http, HttpResponse} from 'msw'
import {server} from '../../setup.js'

vi.mock('../../../src/services/shell.js', () => ({
  exec: vi.fn(),
}))

function toBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64')
}

const AGENTS_MD = `# Awesome Copilot Agents

| Name | Description |
|------|-------------|
| [Super Coder](https://github.com/example/super-coder) | Writes clean code automatically |
| [Test Writer](https://github.com/example/test-writer) | Generates comprehensive tests |
| [![badge](img.png)](https://example.com) [Badge Agent](https://github.com/example/badge) | Has a badge in the name |
`

const EMPTY_MD = `# Awesome Copilot Skills\n\nNo entries yet.\n`

describe('parseMarkdownTable', () => {
  it('parses table rows into AwesomeEntry[]', async () => {
    const {parseMarkdownTable} = await import('../../../src/services/awesome-copilot.js')
    const entries = parseMarkdownTable(AGENTS_MD, 'agents')

    expect(entries).toHaveLength(3)
    expect(entries[0].name).toBe('Super Coder')
    expect(entries[0].url).toBe('https://github.com/example/super-coder')
    expect(entries[0].description).toBe('Writes clean code automatically')
    expect(entries[0].category).toBe('agents')
    expect(entries[0].source).toBe('awesome-copilot')
  })

  it('strips markdown badges from name cell', async () => {
    const {parseMarkdownTable} = await import('../../../src/services/awesome-copilot.js')
    const entries = parseMarkdownTable(AGENTS_MD, 'agents')

    const badge = entries.find((e) => e.name === 'Badge Agent')
    expect(badge).toBeDefined()
    expect(badge?.name).not.toContain('!')
    expect(badge?.name).not.toContain('badge')
  })

  it('returns empty array for file with no table rows', async () => {
    const {parseMarkdownTable} = await import('../../../src/services/awesome-copilot.js')
    const entries = parseMarkdownTable(EMPTY_MD, 'skills')
    expect(entries).toHaveLength(0)
  })
})

describe('fetchAwesomeEntries', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const {exec} = await import('../../../src/services/shell.js')
    vi.mocked(exec).mockResolvedValue({stdout: 'fake-gh-token', stderr: '', exitCode: 0})
  })

  it('fetches and parses agents category', async () => {
    server.use(
      http.get('https://api.github.com/repos/github/awesome-copilot/contents/:path*', () =>
        HttpResponse.json({
          type: 'file',
          encoding: 'base64',
          content: toBase64(AGENTS_MD),
        }),
      ),
    )

    const {fetchAwesomeEntries} = await import('../../../src/services/awesome-copilot.js')
    const entries = await fetchAwesomeEntries('agents')

    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0].category).toBe('agents')
    expect(entries[0].source).toBe('awesome-copilot')
  })

  it('throws DvmiError for unknown category', async () => {
    const {fetchAwesomeEntries} = await import('../../../src/services/awesome-copilot.js')
    const {DvmiError} = await import('../../../src/utils/errors.js')

    await expect(fetchAwesomeEntries('unknown-cat')).rejects.toThrow(DvmiError)
    await expect(fetchAwesomeEntries('unknown-cat')).rejects.toThrow(/unknown/i)
  })

  it('throws DvmiError when category file returns 404', async () => {
    server.use(
      http.get('https://api.github.com/repos/github/awesome-copilot/contents/:path*', () =>
        HttpResponse.json({message: 'Not Found'}, {status: 404}),
      ),
    )

    const {fetchAwesomeEntries} = await import('../../../src/services/awesome-copilot.js')
    const {DvmiError} = await import('../../../src/utils/errors.js')

    await expect(fetchAwesomeEntries('agents')).rejects.toThrow(DvmiError)
  })
})

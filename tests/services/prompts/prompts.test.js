import { describe, it, expect, vi, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { vol } from 'memfs'
import { server } from '../../setup.js'

vi.mock('../../../src/services/shell.js', () => ({
  exec: vi.fn(),
  which: vi.fn(),
}))

vi.mock('execa', () => ({
  execa: vi.fn(),
}))

// Redirect Node's fs/promises to memfs so downloadPrompt writes to an in-memory FS
vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs')
  return fs.promises
})

/**
 * Encode a string as base64 (GitHub API format)
 * @param {string} str
 * @returns {string}
 */
function toBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64')
}

const PROMPT_1_CONTENT = `---
title: Refactor Prompt
description: A coding refactor helper
category: coding
tags:
  - refactor
  - coding
---
Please refactor the following code to improve readability.`

const PROMPT_2_CONTENT = `---
title: Test Generator
description: Generate unit tests
category: testing
tags:
  - testing
---
Generate comprehensive unit tests for the provided function.`

const PLAIN_CONTENT = 'Just a plain prompt without frontmatter.'

/**
 * MSW handler for git trees endpoint
 * @param {object[]} items
 * @returns {import('msw').HttpHandler}
 */
function treeHandler(items) {
  return http.get('https://api.github.com/repos/savez/prompt-for-ai/git/trees/:sha', () =>
    HttpResponse.json({ tree: items, truncated: false }),
  )
}

/**
 * MSW handler for repo file contents — matches any file path.
 * Uses a Map of path → content so multiple files can be served.
 * @param {Record<string, string>} contentMap - { 'coding/refactor-prompt.md': '...' }
 * @param {number} [status] - HTTP status to return for all requests (for error simulation)
 * @returns {import('msw').HttpHandler}
 */
function contentsHandler(contentMap, status = 200) {
  return http.get('https://api.github.com/repos/savez/prompt-for-ai/contents/:path*', ({ params }) => {
    const filePath = Array.isArray(params.path) ? params.path.join('/') : String(params['path*'] ?? params.path ?? '')
    if (status !== 200) {
      return HttpResponse.json({ message: 'Not Found' }, { status })
    }
    const content = contentMap[filePath]
    if (content === undefined) {
      return HttpResponse.json({ message: 'Not Found' }, { status: 404 })
    }
    return HttpResponse.json({
      type: 'file',
      encoding: 'base64',
      content: toBase64(content),
      path: filePath,
    })
  })
}

describe('listPrompts', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const shell = await import('../../../src/services/shell.js')
    vi.mocked(shell.exec).mockResolvedValue({ stdout: 'fake-gh-token', stderr: '', exitCode: 0 })
  })

  it('returns parsed Prompt[] from repository tree + file contents', async () => {
    server.use(
      treeHandler([
        { type: 'blob', path: 'coding/refactor-prompt.md', sha: 'abc' },
        { type: 'blob', path: 'testing/test-generator.md', sha: 'def' },
        { type: 'tree', path: 'coding', sha: 'xyz' }, // directories should be skipped
      ]),
      contentsHandler({
        'coding/refactor-prompt.md': PROMPT_1_CONTENT,
        'testing/test-generator.md': PROMPT_2_CONTENT,
      }),
    )

    const { listPrompts } = await import('../../../src/services/prompts.js')
    const prompts = await listPrompts()

    expect(prompts).toHaveLength(2)

    const refactor = prompts.find((p) => p.path === 'coding/refactor-prompt.md')
    expect(refactor).toBeDefined()
    expect(refactor?.title).toBe('Refactor Prompt')
    expect(refactor?.category).toBe('coding')
    expect(refactor?.description).toBe('A coding refactor helper')
    expect(refactor?.tags).toEqual(['refactor', 'coding'])
    expect(refactor?.body).toContain('Please refactor')

    const testGen = prompts.find((p) => p.path === 'testing/test-generator.md')
    expect(testGen?.title).toBe('Test Generator')
    expect(testGen?.category).toBe('testing')
  })

  it('returns empty array when repository has no markdown files', async () => {
    server.use(
      treeHandler([{ type: 'tree', path: 'coding', sha: 'xyz' }]),
    )

    const { listPrompts } = await import('../../../src/services/prompts.js')
    const prompts = await listPrompts()
    expect(Array.isArray(prompts)).toBe(true)
    expect(prompts).toHaveLength(0)
  })

  it('throws DvmiError when repository returns 404', async () => {
    server.use(
      http.get('https://api.github.com/repos/savez/prompt-for-ai/git/trees/:sha', () =>
        HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
      ),
    )

    const { listPrompts } = await import('../../../src/services/prompts.js')
    const { DvmiError } = await import('../../../src/utils/errors.js')

    await expect(listPrompts()).rejects.toThrow(DvmiError)
  })

  it('derives title and category from path when frontmatter is missing', async () => {
    server.use(
      treeHandler([{ type: 'blob', path: 'general/my-plain-prompt.md', sha: 'aaa' }]),
      contentsHandler({ 'general/my-plain-prompt.md': PLAIN_CONTENT }),
    )

    const { listPrompts } = await import('../../../src/services/prompts.js')
    const prompts = await listPrompts()

    expect(prompts).toHaveLength(1)
    expect(prompts[0].title).toBe('My Plain Prompt') // derived from filename
    expect(prompts[0].category).toBe('general') // derived from directory
    expect(prompts[0].body).toBe(PLAIN_CONTENT)
  })
})

describe('fetchPromptByPath', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const shell = await import('../../../src/services/shell.js')
    vi.mocked(shell.exec).mockResolvedValue({ stdout: 'fake-gh-token', stderr: '', exitCode: 0 })
  })

  it('fetches and parses a single prompt by path', async () => {
    server.use(
      contentsHandler({ 'coding/refactor-prompt.md': PROMPT_1_CONTENT }),
    )

    const { fetchPromptByPath } = await import('../../../src/services/prompts.js')
    const prompt = await fetchPromptByPath('coding/refactor-prompt.md')

    expect(prompt.title).toBe('Refactor Prompt')
    expect(prompt.path).toBe('coding/refactor-prompt.md')
    expect(prompt.body).toContain('Please refactor')
  })

  it('throws DvmiError with actionable hint when path does not exist', async () => {
    server.use(
      contentsHandler({}, 404),
    )

    const { fetchPromptByPath } = await import('../../../src/services/prompts.js')
    const { DvmiError } = await import('../../../src/utils/errors.js')

    await expect(fetchPromptByPath('nonexistent/file.md')).rejects.toThrow(DvmiError)
    await expect(fetchPromptByPath('nonexistent/file.md')).rejects.toThrow(/not found/i)
  })
})

describe('downloadPrompt', () => {
  const LOCAL_DIR = '/tmp/test-prompts'

  beforeEach(async () => {
    // Reset in-memory filesystem before each test
    vol.reset()
    vi.clearAllMocks()
    const shell = await import('../../../src/services/shell.js')
    vi.mocked(shell.exec).mockResolvedValue({ stdout: 'fake-gh-token', stderr: '', exitCode: 0 })
  })

  it('writes file at the correct path with frontmatter preserved', async () => {
    server.use(
      contentsHandler({ 'coding/refactor-prompt.md': PROMPT_1_CONTENT }),
    )

    const { downloadPrompt } = await import('../../../src/services/prompts.js')
    const result = await downloadPrompt('coding/refactor-prompt.md', LOCAL_DIR)

    expect(result.skipped).toBe(false)
    expect(result.path).toBe(`${LOCAL_DIR}/coding/refactor-prompt.md`)

    const { fs } = await import('memfs')
    const written = fs.readFileSync(result.path, 'utf8')
    expect(written).toContain('title: Refactor Prompt')
    expect(written).toContain('category: coding')
    expect(written).toContain('Please refactor the following code')
  })

  it('creates intermediate directories if they do not exist', async () => {
    server.use(
      contentsHandler({ 'deep/nested/dir/prompt.md': PROMPT_2_CONTENT }),
    )

    const { downloadPrompt } = await import('../../../src/services/prompts.js')
    const result = await downloadPrompt('deep/nested/dir/prompt.md', LOCAL_DIR)

    expect(result.skipped).toBe(false)
    const { fs } = await import('memfs')
    expect(fs.existsSync(`${LOCAL_DIR}/deep/nested/dir/prompt.md`)).toBe(true)
  })

  it('skips without network call when file already exists and overwrite is not set', async () => {
    const { fs } = await import('memfs')
    fs.mkdirSync(`${LOCAL_DIR}/coding`, { recursive: true })
    fs.writeFileSync(`${LOCAL_DIR}/coding/refactor-prompt.md`, 'existing content')

    const { downloadPrompt } = await import('../../../src/services/prompts.js')
    const result = await downloadPrompt('coding/refactor-prompt.md', LOCAL_DIR)

    expect(result.skipped).toBe(true)
    expect(result.path).toBe(`${LOCAL_DIR}/coding/refactor-prompt.md`)
    // File should remain unchanged
    expect(fs.readFileSync(result.path, 'utf8')).toBe('existing content')
  })

  it('overwrites existing file when opts.overwrite is true', async () => {
    server.use(
      contentsHandler({ 'coding/refactor-prompt.md': PROMPT_1_CONTENT }),
    )

    const { fs } = await import('memfs')
    fs.mkdirSync(`${LOCAL_DIR}/coding`, { recursive: true })
    fs.writeFileSync(`${LOCAL_DIR}/coding/refactor-prompt.md`, 'old content')

    const { downloadPrompt } = await import('../../../src/services/prompts.js')
    const result = await downloadPrompt('coding/refactor-prompt.md', LOCAL_DIR, { overwrite: true })

    expect(result.skipped).toBe(false)
    const written = fs.readFileSync(result.path, 'utf8')
    expect(written).toContain('Refactor Prompt')
    expect(written).not.toContain('old content')
  })

  it('throws DvmiError when prompt path does not exist in repo', async () => {
    server.use(contentsHandler({}, 404))

    const { downloadPrompt } = await import('../../../src/services/prompts.js')
    const { DvmiError } = await import('../../../src/utils/errors.js')

    await expect(downloadPrompt('nonexistent/prompt.md', LOCAL_DIR)).rejects.toThrow(DvmiError)
  })
})

// ---------------------------------------------------------------------------
// resolveLocalPrompt
// ---------------------------------------------------------------------------

describe('resolveLocalPrompt', () => {
  const LOCAL_DIR = '/tmp/test-local-prompts'

  // Redirect Node's fs/promises to memfs so resolveLocalPrompt reads from an in-memory FS
  vi.mock('node:fs/promises', async () => {
    const { fs } = await import('memfs')
    return fs.promises
  })

  beforeEach(() => {
    vol.reset()
  })

  it('reads and parses a prompt from the local filesystem', async () => {
    const content = `---
title: Local Refactor
description: A local prompt
category: coding
tags:
  - local
---
Do something locally.`

    const { fs } = await import('memfs')
    fs.mkdirSync(`${LOCAL_DIR}/coding`, { recursive: true })
    fs.writeFileSync(`${LOCAL_DIR}/coding/local-refactor.md`, content)

    const { resolveLocalPrompt } = await import('../../../src/services/prompts.js')
    const prompt = await resolveLocalPrompt('coding/local-refactor.md', LOCAL_DIR)

    expect(prompt.title).toBe('Local Refactor')
    expect(prompt.path).toBe('coding/local-refactor.md')
    expect(prompt.category).toBe('coding')
    expect(prompt.body).toContain('Do something locally.')
  })

  it('derives title from path when frontmatter is absent', async () => {
    const { fs } = await import('memfs')
    fs.mkdirSync(`${LOCAL_DIR}/general`, { recursive: true })
    fs.writeFileSync(`${LOCAL_DIR}/general/my-plain-prompt.md`, 'Plain text prompt.')

    const { resolveLocalPrompt } = await import('../../../src/services/prompts.js')
    const prompt = await resolveLocalPrompt('general/my-plain-prompt.md', LOCAL_DIR)

    expect(prompt.title).toBe('My Plain Prompt')
    expect(prompt.body).toBe('Plain text prompt.')
  })

  it('throws DvmiError with actionable hint when file does not exist', async () => {
    const { resolveLocalPrompt } = await import('../../../src/services/prompts.js')
    const { DvmiError } = await import('../../../src/utils/errors.js')

    await expect(
      resolveLocalPrompt('nonexistent/prompt.md', LOCAL_DIR),
    ).rejects.toThrow(DvmiError)

    await expect(
      resolveLocalPrompt('nonexistent/prompt.md', LOCAL_DIR),
    ).rejects.toThrow(/not found/i)
  })
})

// ---------------------------------------------------------------------------
// invokeTool
// ---------------------------------------------------------------------------

describe('invokeTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls execa with correct args for opencode', async () => {
    const shell = await import('../../../src/services/shell.js')
    const { execa: mockedExeca } = await import('execa')
    vi.mocked(shell.which).mockResolvedValue('/usr/local/bin/opencode')
    vi.mocked(mockedExeca).mockResolvedValue(/** @type {any} */ ({}))

    const { invokeTool } = await import('../../../src/services/prompts.js')
    await invokeTool('opencode', 'Refactor my code')

    expect(mockedExeca).toHaveBeenCalledWith(
      'opencode',
      ['--prompt', 'Refactor my code'],
      expect.objectContaining({ stdio: 'inherit' }),
    )
  })

  it('calls execa with correct args for copilot (gh copilot -p)', async () => {
    const shell = await import('../../../src/services/shell.js')
    const { execa: mockedExeca } = await import('execa')
    vi.mocked(shell.which).mockResolvedValue('/usr/local/bin/gh')
    vi.mocked(mockedExeca).mockResolvedValue(/** @type {any} */ ({}))

    const { invokeTool } = await import('../../../src/services/prompts.js')
    await invokeTool('copilot', 'Write tests for me')

    expect(mockedExeca).toHaveBeenCalledWith(
      'gh',
      ['copilot', '-p', 'Write tests for me'],
      expect.objectContaining({ stdio: 'inherit' }),
    )
  })

  it('throws DvmiError when the tool binary is not in PATH', async () => {
    const shell = await import('../../../src/services/shell.js')
    vi.mocked(shell.which).mockResolvedValue(null)

    const { invokeTool } = await import('../../../src/services/prompts.js')
    const { DvmiError } = await import('../../../src/utils/errors.js')

    await expect(invokeTool('opencode', 'some prompt')).rejects.toThrow(DvmiError)
    await expect(invokeTool('opencode', 'some prompt')).rejects.toThrow(/not installed/i)
  })

  it('throws DvmiError for an unknown tool name', async () => {
    const { invokeTool } = await import('../../../src/services/prompts.js')
    const { DvmiError } = await import('../../../src/utils/errors.js')

    await expect(
      invokeTool(/** @type {any} */ ('unknown-tool'), 'some prompt'),
    ).rejects.toThrow(DvmiError)
  })
})

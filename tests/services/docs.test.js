import {describe, it, expect, vi, beforeEach} from 'vitest'
import {http, HttpResponse} from 'msw'
import {server} from '../setup.js'

// Mock exec so detectCurrentRepo returns a fake GitHub remote
vi.mock('../../src/services/shell.js', () => ({
  exec: vi.fn(async (cmd, args) => {
    if (cmd === 'gh' && args[0] === 'auth') {
      return {stdout: 'test-token', stderr: '', exitCode: 0}
    }
    if (cmd === 'git' && args[0] === 'remote') {
      return {stdout: 'https://github.com/my-org/my-repo.git', stderr: '', exitCode: 0}
    }
    return {stdout: '', stderr: 'unknown command', exitCode: 1}
  }),
}))

const TREE_RESPONSE = {
  truncated: false,
  tree: [
    {type: 'blob', path: 'README.md', size: 1024},
    {type: 'blob', path: 'openapi.yaml', size: 4096},
    {type: 'blob', path: 'asyncapi.yaml', size: 2048},
    {type: 'blob', path: 'docs/architecture.md', size: 2048},
    {type: 'blob', path: 'docs/deploy.md', size: 512},
    {type: 'blob', path: 'src/index.js', size: 300},
    {type: 'blob', path: 'package.json', size: 800},
    {type: 'blob', path: 'readme.md', size: 0}, // empty → excluded
    {type: 'tree', path: 'docs', size: 0}, // dir entry → excluded
  ],
}

function setupDocHandlers() {
  server.use(
    http.get('https://api.github.com/repos/:owner/:repo', () =>
      HttpResponse.json({default_branch: 'main', name: 'my-repo', full_name: 'my-org/my-repo'}),
    ),
    http.get('https://api.github.com/repos/:owner/:repo/git/ref/*', () =>
      HttpResponse.json({object: {sha: 'abc123def456'}}),
    ),
    http.get('https://api.github.com/repos/:owner/:repo/git/trees/:sha', () => HttpResponse.json(TREE_RESPONSE)),
    http.get('https://api.github.com/repos/:owner/:repo/contents/:path', ({params}) => {
      const content = `# Doc: ${params.path}\n\nThis is the content of ${params.path}`
      return HttpResponse.json({
        type: 'file',
        content: Buffer.from(content).toString('base64'),
        encoding: 'base64',
      })
    }),
  )
}

describe('detectCurrentRepo()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('detects owner and repo from git remote URL', async () => {
    const {detectCurrentRepo} = await import('../../src/services/docs.js')
    const result = await detectCurrentRepo()
    expect(result.owner).toBe('my-org')
    expect(result.repo).toBe('my-repo')
  })
})

describe('listDocs()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDocHandlers()
  })

  it('returns only classified doc files', async () => {
    const {listDocs} = await import('../../src/services/docs.js')
    const entries = await listDocs('my-org', 'my-repo')

    // Should NOT include: src/index.js, package.json, readme.md (empty), docs (tree)
    const paths = entries.map((e) => e.path)
    expect(paths).not.toContain('src/index.js')
    expect(paths).not.toContain('package.json')
    expect(paths).not.toContain('readme.md') // empty (size=0)

    // Should include: README.md, openapi.yaml, asyncapi.yaml, docs/*.md
    expect(paths).toContain('README.md')
    expect(paths).toContain('openapi.yaml')
    expect(paths).toContain('asyncapi.yaml')
    expect(paths).toContain('docs/architecture.md')
    expect(paths).toContain('docs/deploy.md')
  })

  it('classifies types correctly', async () => {
    const {listDocs} = await import('../../src/services/docs.js')
    const entries = await listDocs('my-org', 'my-repo')

    expect(entries.find((e) => e.path === 'README.md')?.type).toBe('readme')
    expect(entries.find((e) => e.path === 'openapi.yaml')?.type).toBe('swagger')
    expect(entries.find((e) => e.path === 'asyncapi.yaml')?.type).toBe('asyncapi')
    expect(entries.find((e) => e.path === 'docs/architecture.md')?.type).toBe('doc')
  })

  it('sorts by type priority (readme first, then swagger, asyncapi, doc)', async () => {
    const {listDocs} = await import('../../src/services/docs.js')
    const entries = await listDocs('my-org', 'my-repo')

    const types = entries.map((e) => e.type)
    const readmeIdx = types.indexOf('readme')
    const swaggerIdx = types.indexOf('swagger')
    const asyncapiIdx = types.indexOf('asyncapi')
    const docIdx = types.indexOf('doc')

    expect(readmeIdx).toBeLessThan(swaggerIdx)
    expect(swaggerIdx).toBeLessThan(asyncapiIdx)
    expect(asyncapiIdx).toBeLessThan(docIdx)
  })
})

describe('readFile()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDocHandlers()
  })

  it('decodes base64 content correctly', async () => {
    const {readFile} = await import('../../src/services/docs.js')
    const content = await readFile('my-org', 'my-repo', 'README.md')
    expect(typeof content).toBe('string')
    expect(content).toContain('README.md')
  })
})

describe('searchDocs()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDocHandlers()
  })

  it('finds matches in doc files', async () => {
    const {searchDocs} = await import('../../src/services/docs.js')
    // The mock returns "# Doc: {path}\n\nThis is the content of {path}"
    // searching for "content" should match every file
    const matches = await searchDocs('my-org', 'my-repo', 'content')
    expect(matches.length).toBeGreaterThan(0)
    for (const m of matches) {
      expect(m.file).toBeTruthy()
      expect(m.line).toBeGreaterThan(0)
      expect(m.context.toLowerCase()).toContain('content')
      expect(m.occurrences).toBeGreaterThan(0)
    }
  })

  it('returns empty array when term not found', async () => {
    const {searchDocs} = await import('../../src/services/docs.js')
    const matches = await searchDocs('my-org', 'my-repo', 'xyz_nonexistent_string_99999')
    expect(matches).toHaveLength(0)
  })
})

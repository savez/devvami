import {describe, it, expect, beforeAll, afterAll} from 'vitest'
import {runCli, runCliWithMockGitHub, createMockServer, jsonResponse} from '../helpers.js'

function toBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64')
}

const AGENTS_MD = `# Awesome Copilot Agents

| Name | Description |
|------|-------------|
| [Super Coder](https://github.com/example/super-coder) | Writes clean code automatically |
| [Test Writer](https://github.com/example/test-writer) | Generates comprehensive tests |
`

/** @type {{ port: number, stop: () => Promise<void> }} */
let githubMock

/** Mock server for skills.sh (plain HTTP server, MSW not available in subprocess) */
/** @type {{ port: number, stop: () => Promise<void> }} */
let skillsMock

beforeAll(async () => {
  // Mock GitHub API for awesome-copilot content
  githubMock = await createMockServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname

    const contentsMatch = path.match(/\/repos\/github\/awesome-copilot\/contents\/(.+)$/)
    if (req.method === 'GET' && contentsMatch) {
      return jsonResponse(res, {
        type: 'file',
        encoding: 'base64',
        content: toBase64(AGENTS_MD),
        path: contentsMatch[1],
      })
    }

    if (req.method === 'GET' && path === '/user') {
      return jsonResponse(res, {login: 'testdev', id: 1})
    }

    return jsonResponse(res, {message: 'Not Found'}, 404)
  })

  // Mock skills.sh API
  skillsMock = await createMockServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/api/search') {
      return jsonResponse(res, {
        query: url.searchParams.get('q') ?? '',
        searchType: 'fuzzy',
        skills: [
          {id: 'code-review', name: 'Code Review', description: 'Review code', installs: 1200},
          {id: 'sql-gen', name: 'SQL Generator', description: 'Generate SQL', installs: 800},
        ],
        count: 2,
      })
    }
    return jsonResponse(res, {message: 'Not Found'}, 404)
  })
})

afterAll(async () => {
  await Promise.all([githubMock.stop(), skillsMock.stop()])
})

describe('dvmi prompts browse', () => {
  it('--help exits 0 and shows usage', async () => {
    const {stdout, exitCode} = await runCli(['prompts', 'browse', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('USAGE')
    expect(stdout).toContain('prompts browse')
  })

  it('--help shows source argument', async () => {
    const {stdout} = await runCli(['prompts', 'browse', '--help'])
    expect(stdout).toContain('SOURCE')
  })

  it('browse skills --json returns skills array', async () => {
    const {stdout, exitCode} = await runCli(['prompts', 'browse', 'skills', '--query', 'review', '--json'], {
      SKILLS_SH_BASE_URL: `http://127.0.0.1:${skillsMock.port}`,
    })
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data).toHaveProperty('skills')
    expect(data).toHaveProperty('total')
    expect(Array.isArray(data.skills)).toBe(true)
    expect(data.total).toBe(2)

    for (const skill of data.skills) {
      expect(skill).toHaveProperty('id')
      expect(skill).toHaveProperty('name')
      expect(skill).toHaveProperty('source', 'skills.sh')
    }
  })

  it('browse skills without --query exits non-zero with actionable error', async () => {
    const {stdout, stderr, exitCode} = await runCli(['prompts', 'browse', 'skills', '--json'], {
      SKILLS_SH_BASE_URL: `http://127.0.0.1:${skillsMock.port}`,
    })
    expect(exitCode).not.toBe(0)
    const combined = stdout + stderr
    expect(combined).toMatch(/query/i)
  })

  it('browse awesome --json returns entries array', async () => {
    const {stdout, exitCode} = await runCliWithMockGitHub(
      ['prompts', 'browse', 'awesome', '--category', 'agents', '--json'],
      githubMock.port,
    )
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data).toHaveProperty('entries')
    expect(data).toHaveProperty('total')
    expect(data).toHaveProperty('category', 'agents')
    expect(Array.isArray(data.entries)).toBe(true)
    expect(data.total).toBeGreaterThan(0)

    for (const entry of data.entries) {
      expect(entry).toHaveProperty('name')
      expect(entry).toHaveProperty('source', 'awesome-copilot')
    }
  })

  it('exits non-zero with invalid source argument', async () => {
    const {exitCode} = await runCli(['prompts', 'browse', 'invalid-source', '--json'])
    expect(exitCode).not.toBe(0)
  })
})

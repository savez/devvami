import {describe, it, expect, beforeAll, afterAll} from 'vitest'
import {runCli, runCliWithMockGitHub, createMockServer, jsonResponse} from '../helpers.js'

function toBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64')
}

const REFACTOR_CONTENT = `---
title: Refactor Prompt
description: Improve code readability
category: coding
tags:
  - refactor
---
Please refactor the following code to improve readability and maintainability.`

const TEST_GEN_CONTENT = `---
title: Test Generator
description: Generate unit tests for a function
category: testing
---
Generate unit tests for the provided function.`

const README_CONTENT = `# My Prompt Repo\nThis is the README.`
const CONTRIBUTING_CONTENT = `# Contributing\nPlease follow the guidelines.`
const PR_TEMPLATE_CONTENT = `## Summary\n- [ ] Changes made`

const contentMap = {
  'coding/refactor-prompt.md': REFACTOR_CONTENT,
  'testing/test-generator.md': TEST_GEN_CONTENT,
  'README.md': README_CONTENT,
  'CONTRIBUTING.md': CONTRIBUTING_CONTENT,
  'PULL_REQUEST_TEMPLATE.md': PR_TEMPLATE_CONTENT,
}

/** @type {{ port: number, stop: () => Promise<void> }} */
let mock

beforeAll(async () => {
  mock = await createMockServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname

    // GET /repos/savez/prompt-for-ai/git/trees/HEAD
    if (req.method === 'GET' && /\/repos\/savez\/prompt-for-ai\/git\/trees\//.test(path)) {
      return jsonResponse(res, {
        tree: [
          {type: 'blob', path: 'coding/refactor-prompt.md', sha: 'abc'},
          {type: 'blob', path: 'testing/test-generator.md', sha: 'def'},
          {type: 'blob', path: 'README.md', sha: 'r1'},
          {type: 'blob', path: 'CONTRIBUTING.md', sha: 'c1'},
          {type: 'blob', path: 'PULL_REQUEST_TEMPLATE.md', sha: 'p1'},
        ],
        truncated: false,
      })
    }

    // GET /repos/savez/prompt-for-ai/contents/<path>
    const contentsMatch = path.match(/\/repos\/savez\/prompt-for-ai\/contents\/(.+)$/)
    if (req.method === 'GET' && contentsMatch) {
      const filePath = decodeURIComponent(contentsMatch[1])
      const content = contentMap[filePath]
      if (!content) return jsonResponse(res, {message: 'Not Found'}, 404)
      return jsonResponse(res, {
        type: 'file',
        encoding: 'base64',
        content: toBase64(content),
        path: filePath,
      })
    }

    // GET /user (Octokit auth check)
    if (req.method === 'GET' && path === '/user') {
      return jsonResponse(res, {login: 'testdev', id: 1})
    }

    return jsonResponse(res, {message: 'Not Found'}, 404)
  })
})

afterAll(async () => {
  await mock.stop()
})

describe('dvmi prompts list', () => {
  it('--help exits 0 and shows usage', async () => {
    const {stdout, exitCode} = await runCli(['prompts', 'list', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('USAGE')
    expect(stdout).toContain('prompts list')
  })

  it('--help shows --filter flag', async () => {
    const {stdout, exitCode} = await runCli(['prompts', 'list', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--filter')
  })

  it('--json returns only prompt files (excludes README/CONTRIBUTING/PULL_REQUEST_TEMPLATE)', async () => {
    const {stdout, exitCode} = await runCliWithMockGitHub(['prompts', 'list', '--json'], mock.port)
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data.total).toBe(2)
    const paths = data.prompts.map((p) => p.path)
    expect(paths).not.toContain('README.md')
    expect(paths).not.toContain('CONTRIBUTING.md')
    expect(paths).not.toContain('PULL_REQUEST_TEMPLATE.md')
  })

  it('--json returns prompts array with expected shape', async () => {
    const {stdout, exitCode} = await runCliWithMockGitHub(['prompts', 'list', '--json'], mock.port)
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data).toHaveProperty('prompts')
    expect(data).toHaveProperty('total')
    expect(Array.isArray(data.prompts)).toBe(true)
    expect(data.total).toBe(2)

    for (const prompt of data.prompts) {
      expect(prompt).toHaveProperty('path')
      expect(prompt).toHaveProperty('title')
      expect(prompt).toHaveProperty('body')
    }
  })

  it('--json returns prompts with correct titles and categories', async () => {
    const {stdout, exitCode} = await runCliWithMockGitHub(['prompts', 'list', '--json'], mock.port)
    expect(exitCode).toBe(0)
    const {prompts} = JSON.parse(stdout)

    const refactor = prompts.find((p) => p.path === 'coding/refactor-prompt.md')
    expect(refactor?.title).toBe('Refactor Prompt')
    expect(refactor?.category).toBe('coding')
    expect(refactor?.description).toBe('Improve code readability')

    const testGen = prompts.find((p) => p.path === 'testing/test-generator.md')
    expect(testGen?.title).toBe('Test Generator')
    expect(testGen?.category).toBe('testing')
  })

  it('--filter narrows results by title/category', async () => {
    const {stdout, exitCode} = await runCliWithMockGitHub(
      ['prompts', 'list', '--filter', 'refactor', '--json'],
      mock.port,
    )
    expect(exitCode).toBe(0)
    const {prompts, total} = JSON.parse(stdout)
    expect(total).toBe(1)
    expect(prompts[0].title).toBe('Refactor Prompt')
  })

  it('--filter with no matches returns empty array', async () => {
    const {stdout, exitCode} = await runCliWithMockGitHub(
      ['prompts', 'list', '--filter', 'zzznonexistent', '--json'],
      mock.port,
    )
    expect(exitCode).toBe(0)
    const {prompts, total} = JSON.parse(stdout)
    expect(Array.isArray(prompts)).toBe(true)
    expect(total).toBe(0)
  })

  it('exits with code 1 and actionable error when GitHub API is unreachable', async () => {
    const {stdout, stderr, exitCode} = await runCli(['prompts', 'list', '--json'], {
      GITHUB_API_URL: 'http://127.0.0.1:1', // unreachable port
    })
    expect(exitCode).not.toBe(0)
    const combined = stdout + stderr
    expect(combined.length).toBeGreaterThan(0)
  })
})

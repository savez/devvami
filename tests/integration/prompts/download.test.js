import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runCli, runCliWithMockGitHub, createMockServer, jsonResponse } from '../helpers.js'

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

const contentMap = {
  'coding/refactor-prompt.md': REFACTOR_CONTENT,
}

/** @type {{ port: number, stop: () => Promise<void> }} */
let mock

/** @type {string} Temp directory used as CWD for each test */
let tmpDir

beforeAll(async () => {
  mock = await createMockServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname

    // Tree endpoint (used by interactive select in list)
    if (req.method === 'GET' && /\/repos\/savez\/prompt-for-ai\/git\/trees\//.test(path)) {
      return jsonResponse(res, {
        tree: [{ type: 'blob', path: 'coding/refactor-prompt.md', sha: 'abc' }],
        truncated: false,
      })
    }

    // Contents endpoint
    const contentsMatch = path.match(/\/repos\/savez\/prompt-for-ai\/contents\/(.+)$/)
    if (req.method === 'GET' && contentsMatch) {
      const filePath = decodeURIComponent(contentsMatch[1])
      const content = contentMap[filePath]
      if (!content) return jsonResponse(res, { message: 'Not Found' }, 404)
      return jsonResponse(res, {
        type: 'file',
        encoding: 'base64',
        content: toBase64(content),
        path: filePath,
      })
    }

    if (req.method === 'GET' && path === '/user') {
      return jsonResponse(res, { login: 'testdev', id: 1 })
    }

    return jsonResponse(res, { message: 'Not Found' }, 404)
  })
})

afterAll(async () => {
  await mock.stop()
})

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'dvmi-download-test-'))
})

// afterEach is intentionally omitted — temp dirs will be cleaned up by the OS
// but we remove them explicitly for cleanliness
afterAll(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true })
})

/**
 * Run CLI with mock GitHub + custom prompts dir inside tmpDir.
 * @param {string[]} args
 * @param {Record<string, string>} [extra]
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function run(args, extra = {}) {
  return runCliWithMockGitHub(args, mock.port, { DVMI_PROMPTS_DIR: join(tmpDir, '.prompts'), ...extra })
}

describe('dvmi prompts download', () => {
  it('--help exits 0 and shows usage', async () => {
    const { stdout, exitCode } = await runCli(['prompts', 'download', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('USAGE')
    expect(stdout).toContain('prompts download')
  })

  it('--help shows --overwrite flag', async () => {
    const { stdout } = await runCli(['prompts', 'download', '--help'])
    expect(stdout).toContain('--overwrite')
  })

  it('--json with explicit path downloads and returns downloaded array', async () => {
    const { stdout, exitCode } = await run([
      'prompts', 'download', 'coding/refactor-prompt.md', '--json',
    ])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data).toHaveProperty('downloaded')
    expect(data).toHaveProperty('skipped')
    expect(Array.isArray(data.downloaded)).toBe(true)
    expect(data.downloaded).toHaveLength(1)
    expect(data.downloaded[0]).toMatch(/coding[\\/]refactor-prompt\.md$/)
    expect(data.skipped).toHaveLength(0)
  })

  it('--json with explicit path skips when file already exists', async () => {
    // Pre-create the destination file inside the prompts dir
    const promptsDir = join(tmpDir, '.prompts', 'coding')
    await mkdir(promptsDir, { recursive: true })
    await writeFile(join(promptsDir, 'refactor-prompt.md'), 'existing content')

    const { stdout, exitCode } = await run([
      'prompts', 'download', 'coding/refactor-prompt.md', '--json',
    ])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data.skipped).toHaveLength(1)
    expect(data.downloaded).toHaveLength(0)
  })

  it('--json --overwrite replaces existing file', async () => {
    const promptsDir = join(tmpDir, '.prompts', 'coding')
    await mkdir(promptsDir, { recursive: true })
    await writeFile(join(promptsDir, 'refactor-prompt.md'), 'old content')

    const { stdout, exitCode } = await run([
      'prompts', 'download', 'coding/refactor-prompt.md', '--overwrite', '--json',
    ])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data.downloaded).toHaveLength(1)
    expect(data.skipped).toHaveLength(0)
  })

  it('--json exits 1 when path argument is missing', async () => {
    const { stdout, stderr, exitCode } = await run(['prompts', 'download', '--json'])
    expect(exitCode).not.toBe(0)
    // oclif outputs errors to stdout as JSON in --json mode
    const combined = stdout + stderr
    expect(combined.length).toBeGreaterThan(0)
  })

  it('--json exits non-zero when prompt path does not exist in repo', async () => {
    const { exitCode } = await run([
      'prompts', 'download', 'nonexistent/prompt.md', '--json',
    ])
    expect(exitCode).not.toBe(0)
  })
})

import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runCli } from '../helpers.js'

const REFACTOR_CONTENT = `---
title: Refactor Prompt
description: Improve code readability
category: coding
tags:
  - refactor
---
Please refactor the following code to improve readability and maintainability.`

/** @type {string} Temp directory used as prompts dir for each test */
let promptsDir

beforeEach(async () => {
  promptsDir = await mkdtemp(join(tmpdir(), 'dvmi-run-test-'))
})

afterAll(async () => {
  // Cleanup any leftover temp dirs
  if (promptsDir) await rm(promptsDir, { recursive: true, force: true }).catch(() => {})
})

/**
 * Run CLI with DVMI_PROMPTS_DIR pointing to the temp directory.
 * @param {string[]} args
 * @param {Record<string, string>} [extra]
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
function run(args, extra = {}) {
  return runCli(args, { DVMI_PROMPTS_DIR: promptsDir, ...extra })
}

describe('dvmi prompts run', () => {
  it('--help exits 0 and shows usage', async () => {
    const { stdout, exitCode } = await runCli(['prompts', 'run', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('USAGE')
    expect(stdout).toContain('prompts run')
  })

  it('--help shows --tool flag', async () => {
    const { stdout } = await runCli(['prompts', 'run', '--help'])
    expect(stdout).toContain('--tool')
  })

  describe('--json mode', () => {
    it('outputs invocation plan when prompt exists and tool is configured', async () => {
      // Write a local prompt file
      await mkdir(join(promptsDir, 'coding'), { recursive: true })
      await writeFile(join(promptsDir, 'coding', 'refactor-prompt.md'), REFACTOR_CONTENT)

      const { stdout, exitCode } = await run([
        'prompts', 'run', 'coding/refactor-prompt.md', '--tool', 'opencode', '--json',
      ])

      expect(exitCode).toBe(0)
      const data = JSON.parse(stdout)
      expect(data).toHaveProperty('tool', 'opencode')
      expect(data).toHaveProperty('promptPath', 'coding/refactor-prompt.md')
      expect(data).toHaveProperty('invocation')
      expect(data).toHaveProperty('preview')
      expect(typeof data.preview).toBe('string')
    })

    it('invocation field includes the tool binary and flag', async () => {
      await mkdir(join(promptsDir, 'coding'), { recursive: true })
      await writeFile(join(promptsDir, 'coding', 'refactor-prompt.md'), REFACTOR_CONTENT)

      const { stdout, exitCode } = await run([
        'prompts', 'run', 'coding/refactor-prompt.md', '--tool', 'opencode', '--json',
      ])
      expect(exitCode).toBe(0)
      const data = JSON.parse(stdout)
      expect(data.invocation).toContain('opencode')
      expect(data.invocation).toContain('--prompt')
    })

    it('exits 1 when no path is provided in --json mode', async () => {
      const { stdout, stderr, exitCode } = await run(['prompts', 'run', '--tool', 'opencode', '--json'])
      expect(exitCode).not.toBe(0)
      const combined = stdout + stderr
      expect(combined.length).toBeGreaterThan(0)
    })

    it('exits 1 when no tool is configured and --tool is not passed', async () => {
      await mkdir(join(promptsDir, 'coding'), { recursive: true })
      await writeFile(join(promptsDir, 'coding', 'refactor-prompt.md'), REFACTOR_CONTENT)

      const { stdout, stderr, exitCode } = await run([
        'prompts', 'run', 'coding/refactor-prompt.md', '--json',
      ])
      expect(exitCode).not.toBe(0)
      const combined = stdout + stderr
      // oclif --json mode puts the error in stdout as JSON; match against suggestions
      expect(combined).toMatch(/dvmi init/i)
    })

    it('exits 1 when the local prompt file does not exist', async () => {
      const { stdout, stderr, exitCode } = await run([
        'prompts', 'run', 'nonexistent/prompt.md', '--tool', 'opencode', '--json',
      ])
      expect(exitCode).not.toBe(0)
      const combined = stdout + stderr
      // hint points to dvmi prompts download
      expect(combined).toMatch(/dvmi prompts download/i)
    })
  })
})

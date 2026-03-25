import { describe, it, expect } from 'vitest'
import { runCli } from './helpers.js'

const commands = [
  ['--help'],
  ['doctor', '--help'],
  ['init', '--help'],
  ['upgrade', '--help'],
  ['whoami', '--help'],
  ['auth', 'login', '--help'],
  ['create', 'repo', '--help'],
  ['pr', 'create', '--help'],
  ['pr', 'status', '--help'],
  ['pr', 'detail', '--help'],
  ['pr', 'review', '--help'],
  ['repo', 'list', '--help'],
  ['pipeline', 'status', '--help'],
  ['pipeline', 'rerun', '--help'],
  ['pipeline', 'logs', '--help'],
  ['tasks', 'list', '--help'],
  ['tasks', 'today', '--help'],
  ['open', '--help'],
  ['search', '--help'],
  ['changelog', '--help'],
  ['costs', 'get', '--help'],
  ['security', 'setup', '--help'],
  ['docs', 'list', '--help'],
  ['docs', 'read', '--help'],
  ['docs', 'search', '--help'],
  ['docs', 'projects', '--help'],
]

describe('--help output', () => {
  for (const args of commands) {
    it(`dvmi ${args.join(' ')}`, async () => {
      const { stdout, exitCode } = await runCli(args)
      expect(exitCode).toBe(0)
      expect(stdout.length).toBeGreaterThan(10)
      expect(stdout).toContain('USAGE')
    })
  }

  // T022 (US3): branch create must not appear in top-level --help
  it('dvmi --help does not list branch create', async () => {
    const { stdout, exitCode } = await runCli(['--help'])
    expect(exitCode).toBe(0)
    expect(stdout).not.toContain('branch create')
  })
})

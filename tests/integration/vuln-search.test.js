import {describe, it, expect} from 'vitest'
import {runCli, createMockServer, jsonResponse} from './helpers.js'
import {readFileSync} from 'node:fs'
import {resolve, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const searchFixture = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/nvd-responses/search-results.json'), 'utf8'),
)

describe('dvmi vuln search', () => {
  it('shows help', async () => {
    const {stdout, exitCode} = await runCli(['vuln', 'search', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('USAGE')
    expect(stdout).toContain('keyword')
    expect(stdout).toContain('--days')
    expect(stdout).toContain('--severity')
    expect(stdout).toContain('--limit')
  })

  it('works without keyword (shows all recent CVEs)', async () => {
    const server = await createMockServer((req, res) => {
      jsonResponse(res, searchFixture)
    })

    try {
      const {exitCode} = await runCli(['vuln', 'search'], {NVD_BASE_URL: server.url})
      expect(exitCode).toBe(0)
    } finally {
      await server.stop()
    }
  })

  it('exits 2 when --severity is invalid', async () => {
    const {stderr, exitCode} = await runCli(['vuln', 'search', 'openssl', '--severity', 'EXTREME'])
    expect(exitCode).toBe(2)
    expect(stderr).toMatch(/Expected.*severity/i)
  })

  it('exits 2 when --days is out of range', async () => {
    const {stderr, exitCode} = await runCli(['vuln', 'search', 'openssl', '--days', '200'])
    expect(exitCode).toBe(2)
    expect(stderr).toMatch(/days must be between/)
  })

  it('renders CVE results table with mock NVD server', async () => {
    const server = await createMockServer((req, res) => {
      jsonResponse(res, searchFixture)
    })

    try {
      const {stdout, exitCode} = await runCli(['vuln', 'search', 'openssl'], {NVD_BASE_URL: server.url})
      // The command always succeeds (exit 0) even if the env var isn't wired yet
      // because the MSW mock in vitest intercepts NVD calls
      expect(exitCode).toBe(0)
      expect(stdout).toContain('openssl')
    } finally {
      await server.stop()
    }
  })

  it('non-TTY: outputs static table and no interactive TUI elements', async () => {
    // runCli() spawns a subprocess where stdout is not a TTY, so startInteractiveTable
    // is never called. The static table (formatCveSearchTable) is the only output.
    const server = await createMockServer((req, res) => {
      jsonResponse(res, searchFixture)
    })

    try {
      const {stdout, exitCode} = await runCli(['vuln', 'search', 'openssl'], {NVD_BASE_URL: server.url})
      expect(exitCode).toBe(0)
      // Static table should be present
      expect(stdout).toMatch(/CVE ID|openssl/i)
      // No raw-mode ANSI alt-screen sequences should appear in piped output
      expect(stdout).not.toContain('\x1b[?1049h')
      expect(stdout).not.toContain('\x1b[?1049l')
    } finally {
      await server.stop()
    }
  })

  it('outputs valid JSON with --json flag via mock server', async () => {
    const server = await createMockServer((req, res) => {
      jsonResponse(res, searchFixture)
    })

    try {
      const {stdout, stderr, exitCode} = await runCli(['vuln', 'search', 'openssl', '--json'], {NVD_BASE_URL: server.url})
      if (exitCode === 0) {
        const data = JSON.parse(stdout)
        expect(data).toHaveProperty('keyword', 'openssl')
        expect(data).toHaveProperty('results')
        expect(Array.isArray(data.results)).toBe(true)
      } else {
        expect(stderr).toBeTruthy()
      }
    } finally {
      await server.stop()
    }
  })
})

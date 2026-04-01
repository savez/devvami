import {describe, it, expect} from 'vitest'
import {runCli, createMockServer, jsonResponse} from './helpers.js'
import {readFileSync} from 'node:fs'
import {resolve, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const detailFixture = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/nvd-responses/cve-detail.json'), 'utf8'))

describe('dvmi vuln detail', () => {
  it('shows help', async () => {
    const {stdout, exitCode} = await runCli(['vuln', 'detail', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('USAGE')
    expect(stdout).toContain('CVEID')
    expect(stdout).toContain('--open')
  })

  it('exits 2 when CVE ID is missing', async () => {
    const {exitCode} = await runCli(['vuln', 'detail'])
    expect(exitCode).toBe(2)
  })

  it('exits 1 when CVE ID format is invalid', async () => {
    const {stderr, exitCode} = await runCli(['vuln', 'detail', 'not-a-cve'])
    expect(exitCode).toBeGreaterThanOrEqual(1)
    expect(stderr).toMatch(/Invalid CVE ID/i)
  })

  it('renders CVE detail output with mock server', async () => {
    const server = await createMockServer((req, res) => {
      jsonResponse(res, detailFixture)
    })

    try {
      const {stdout, exitCode} = await runCli(['vuln', 'detail', 'CVE-2021-44228'], {NVD_BASE_URL: server.url})
      expect(exitCode).toBe(0)
      expect(stdout).toContain('CVE-2021-44228')
    } finally {
      await server.stop()
    }
  })

  it('outputs valid JSON structure with --json flag', async () => {
    const {stdout, stderr, exitCode} = await runCli(['vuln', 'detail', 'CVE-2021-44228', '--json'], {})
    if (exitCode === 0) {
      const data = JSON.parse(stdout)
      expect(data).toHaveProperty('id', 'CVE-2021-44228')
      expect(data).toHaveProperty('severity')
      expect(data).toHaveProperty('references')
    } else {
      expect(stderr).toBeTruthy()
    }
  })
})

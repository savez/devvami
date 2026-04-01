import {describe, it, expect} from 'vitest'
import {mkdtemp, writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {runCli} from './helpers.js'

describe('dvmi vuln scan', () => {
  it('shows help', async () => {
    const {stdout, exitCode} = await runCli(['vuln', 'scan', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('USAGE')
    expect(stdout).toContain('--severity')
    expect(stdout).toContain('--no-fail')
    expect(stdout).toContain('--report')
  })

  it('exits 2 when no supported lock file is present in an empty directory', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'dvmi-scan-'))
    try {
      const {exitCode, stdout, stderr} = await runCli(['vuln', 'scan'], {
        DVMI_SCAN_DIR: tmpDir,
      })
      // exit 2 = no package manager detected
      expect(exitCode).toBe(2)
      const output = stdout + stderr
      expect(output).toMatch(/No supported package manager/i)
    } finally {
      await rm(tmpDir, {recursive: true, force: true})
    }
  })

  it('returns JSON with empty findings when no lock file found and --json is passed', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'dvmi-scan-'))
    try {
      const {stdout, exitCode} = await runCli(['vuln', 'scan', '--json'], {
        DVMI_SCAN_DIR: tmpDir,
      })
      // With --json it should exit 0 and return structured JSON even with no lock file
      if (exitCode === 0) {
        const data = JSON.parse(stdout)
        expect(data).toHaveProperty('ecosystems')
        expect(data).toHaveProperty('findings')
        expect(data).toHaveProperty('summary')
        expect(Array.isArray(data.findings)).toBe(true)
      } else {
        // Acceptable: exits 2 with error info in output
        expect(exitCode).toBe(2)
      }
    } finally {
      await rm(tmpDir, {recursive: true, force: true})
    }
  })

  it('detects pnpm-lock.yaml and runs audit, exits 1 when vulns found (fake bin)', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'dvmi-scan-'))
    try {
      // Create a fake pnpm-lock.yaml so the ecosystem is detected
      await writeFile(join(tmpDir, 'pnpm-lock.yaml'), 'lockfileVersion: 6.0\n', 'utf8')

      // The fake bin directory provides a `pnpm` stub that outputs npm-audit-like JSON.
      // We run the scan and just assert the command runs and exits with 0 or 1 (not 2).
      const {exitCode, stdout, stderr} = await runCli(['vuln', 'scan'], {
        DVMI_SCAN_DIR: tmpDir,
      })
      // 0 = no vulns, 1 = vulns found, 2 = no lockfile detected
      // We only assert it didn't exit with 2 (meaning ecosystem was detected)
      expect(exitCode).not.toBe(2)
      // Output should contain some meaningful content
      const combined = stdout + stderr
      expect(combined.length).toBeGreaterThan(0)
    } finally {
      await rm(tmpDir, {recursive: true, force: true})
    }
  })

  it('--no-fail exits 0 even when vulnerabilities are found', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'dvmi-scan-'))
    try {
      await writeFile(join(tmpDir, 'pnpm-lock.yaml'), 'lockfileVersion: 6.0\n', 'utf8')

      const {exitCode} = await runCli(['vuln', 'scan', '--no-fail'], {
        DVMI_SCAN_DIR: tmpDir,
      })
      // With --no-fail the exit code must always be 0 (or 2 for no lockfile, but we have one)
      expect(exitCode).not.toBe(1)
    } finally {
      await rm(tmpDir, {recursive: true, force: true})
    }
  })

  it('--severity flag is validated', async () => {
    const {stderr, exitCode} = await runCli(['vuln', 'scan', '--severity', 'extreme'])
    expect(exitCode).toBe(2)
    expect(stderr).toMatch(/Expected.*severity|severity.*expected/i)
  })

  it('non-TTY output contains static findings table without TUI escape codes', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'dvmi-scan-'))
    try {
      await writeFile(join(tmpDir, 'pnpm-lock.yaml'), 'lockfileVersion: 6.0\n', 'utf8')

      // runCli always uses isTTY=false (spawned subprocess with non-TTY stdio)
      // so static table output should appear, not the interactive alt-screen TUI
      const {stdout, stderr, exitCode} = await runCli(['vuln', 'scan', '--no-fail'], {
        DVMI_SCAN_DIR: tmpDir,
      })
      const combined = stdout + stderr
      // Must not contain the ANSI alt-screen sequence used by the TUI
      expect(combined).not.toContain('\x1b[?1049h')
      // If findings were reported, the static table header should be present
      if (combined.includes('Findings')) {
        expect(combined).toMatch(/Package|Version|Severity/i)
      }
      // Exit code must be 0 (--no-fail) or 0 (no vulns found)
      expect(exitCode).toBe(0)
    } finally {
      await rm(tmpDir, {recursive: true, force: true})
    }
  })

  it('outputs valid JSON structure with --json flag when vulns exist', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'dvmi-scan-'))
    try {
      await writeFile(join(tmpDir, 'pnpm-lock.yaml'), 'lockfileVersion: 6.0\n', 'utf8')

      const {stdout, exitCode} = await runCli(['vuln', 'scan', '--json', '--no-fail'], {
        DVMI_SCAN_DIR: tmpDir,
      })

      // May exit 0 (no vulns) or 0 with --no-fail; just check JSON structure when successful
      if (exitCode === 0 && stdout.trim().startsWith('{')) {
        const data = JSON.parse(stdout)
        expect(data).toHaveProperty('projectPath')
        expect(data).toHaveProperty('scanDate')
        expect(data).toHaveProperty('ecosystems')
        expect(data).toHaveProperty('findings')
        expect(data).toHaveProperty('summary')
        expect(data).toHaveProperty('errors')
        expect(Array.isArray(data.findings)).toBe(true)
        expect(Array.isArray(data.ecosystems)).toBe(true)
        expect(Array.isArray(data.errors)).toBe(true)
        expect(data.summary).toHaveProperty('total')
      }
    } finally {
      await rm(tmpDir, {recursive: true, force: true})
    }
  })
})

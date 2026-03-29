import { Command, Flags } from '@oclif/core'
import { writeFile } from 'node:fs/promises'
import ora from 'ora'
import chalk from 'chalk'
import { detectEcosystems, supportedEcosystemsMessage } from '../../services/audit-detector.js'
import { runAudit, summarizeFindings, filterBySeverity } from '../../services/audit-runner.js'
import { formatFindingsTable, formatScanSummary, formatMarkdownReport, truncate, colorSeverity } from '../../formatters/vuln.js'
import { getCveDetail } from '../../services/nvd.js'
import { startInteractiveTable } from '../../utils/tui/navigable-table.js'

// Minimum terminal rows required to show the interactive TUI (same threshold as vuln search)
const MIN_TTY_ROWS = 6

// Column widths for the navigable table (match the static findings table)
const COL_WIDTHS = {
  pkg: 20,
  version: 12,
  severity: 10,
  cve: 20,
}

export default class VulnScan extends Command {
  static description = 'Scan the current directory for known vulnerabilities in dependencies'

  static examples = [
    '<%= config.bin %> vuln scan',
    '<%= config.bin %> vuln scan --severity high',
    '<%= config.bin %> vuln scan --no-fail',
    '<%= config.bin %> vuln scan --report vuln-report.md',
    '<%= config.bin %> vuln scan --json',
  ]

  static enableJsonFlag = true

  static flags = {
    severity: Flags.string({
      char: 's',
      description: 'Minimum severity filter',
      options: ['low', 'medium', 'high', 'critical'],
    }),
    'no-fail': Flags.boolean({
      description: 'Exit with code 0 even when vulnerabilities are found',
      default: false,
    }),
    report: Flags.string({
      char: 'r',
      description: 'Export vulnerability report to file path (Markdown format)',
    }),
  }

  async run() {
    const { flags } = await this.parse(VulnScan)
    const isJson = flags.json
    const { severity, 'no-fail': noFail, report } = flags

    const projectPath = process.env.DVMI_SCAN_DIR ?? process.cwd()
    const scanDate = new Date().toISOString()

    // Detect ecosystems
    const ecosystems = detectEcosystems(projectPath)

    if (ecosystems.length === 0) {
      if (isJson) {
        return {
          projectPath,
          scanDate,
          ecosystems: [],
          findings: [],
          summary: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 },
          errors: [{ ecosystem: 'none', message: 'No supported package manager detected.' }],
        }
      }

      this.log(chalk.red('  ✘ No supported package manager detected.'))
      this.log('')
      this.log('  Supported ecosystems:')
      this.log(supportedEcosystemsMessage())
      this.log('')
      this.log('  Tip: Make sure you have a lock file in the current directory.')
      this.exit(2)
      return
    }

    // Display detected ecosystems
    if (!isJson) {
      this.log(chalk.bold('Vulnerability Scan'))
      this.log('')
      this.log('  Detected ecosystems:')
      for (const eco of ecosystems) {
        this.log(`  ${chalk.green('●')} ${eco.name} (${eco.lockFile})`)
      }
      this.log('')
    }

    // Run audits
    const allFindings = []
    const errors = []

    for (const eco of ecosystems) {
      const spinner = isJson ? null : ora(`  Scanning ${eco.name} dependencies...`).start()

      const { findings, error } = await runAudit(eco)

      if (error) {
        spinner?.fail(`  Scanning ${eco.name} dependencies... failed`)
        errors.push({ ecosystem: eco.name, message: error })
      } else {
        spinner?.succeed(`  Scanning ${eco.name} dependencies... done`)
        allFindings.push(...findings)
      }
    }

    // Apply severity filter
    const filteredFindings = filterBySeverity(allFindings, severity)

    // Build summary
    const summary = summarizeFindings(filteredFindings)

    const result = {
      projectPath,
      scanDate,
      ecosystems,
      findings: filteredFindings,
      summary,
      errors,
    }

    // Write report if requested (always, regardless of TTY mode)
    if (report) {
      const markdown = formatMarkdownReport(result)
      await writeFile(report, markdown, 'utf8')
      if (!isJson) this.log(`\n  Report saved to: ${report}`)
    }

    if (isJson) return result

    this.log('')

    if (filteredFindings.length === 0 && errors.length === 0) {
      this.log(chalk.green('  ✔ No known vulnerabilities found.'))
      return result
    }

    // ── TTY interactive table ──────────────────────────────────────────────────
    // In a real TTY with enough rows and at least one finding, replace the static
    // table with the navigable TUI (same experience as `dvmi vuln search`).
    const ttyRows = process.stdout.rows ?? 0
    const useTUI = process.stdout.isTTY && filteredFindings.length > 0 && ttyRows >= MIN_TTY_ROWS

    if (useTUI) {
      const count = filteredFindings.length
      const label = count === 1 ? 'finding' : 'findings'
      const heading = `Vulnerability Scan: ${count} ${label}`

      const termCols = process.stdout.columns || 80
      // Title width: whatever is left after Package + Version + Severity + CVE + separators
      const fixedCols = COL_WIDTHS.pkg + COL_WIDTHS.version + COL_WIDTHS.severity + COL_WIDTHS.cve
      const separators = 5 * 2 // 5 gaps between 5 columns
      const titleWidth = Math.max(15, Math.min(50, termCols - fixedCols - separators))

      const rows = filteredFindings.map((f) => ({
        id: f.cveId ?? null,
        pkg: f.package,
        version: f.installedVersion ?? '—',
        severity: f.severity,
        cve: f.cveId ?? '—',
        title: truncate(f.title ?? '—', titleWidth),
        advisoryUrl: f.advisoryUrl ?? null,
      }))

      /** @type {import('../../utils/tui/navigable-table.js').TableColumnDef[]} */
      const columns = [
        { header: 'Package',  key: 'pkg',      width: COL_WIDTHS.pkg },
        { header: 'Version',  key: 'version',  width: COL_WIDTHS.version },
        { header: 'Severity', key: 'severity', width: COL_WIDTHS.severity, colorize: (v) => colorSeverity(v) },
        { header: 'CVE',      key: 'cve',      width: COL_WIDTHS.cve,      colorize: (v) => (v !== '—' ? chalk.cyan(v) : chalk.gray(v)) },
        { header: 'Title',    key: 'title',    width: titleWidth },
      ]

      await startInteractiveTable(rows, columns, heading, filteredFindings.length, getCveDetail)
    } else {
      // Non-TTY fallback: static table + summary (unchanged from pre-TUI behaviour)
      if (filteredFindings.length > 0) {
        this.log(chalk.bold(`  Findings (${filteredFindings.length} ${filteredFindings.length === 1 ? 'vulnerability' : 'vulnerabilities'})`))
        this.log('')
        this.log(formatFindingsTable(filteredFindings))
        this.log('')
        this.log(chalk.bold('  Summary'))
        this.log(formatScanSummary(summary))
        this.log('')
        this.log(chalk.yellow(`  ⚠ ${filteredFindings.length} ${filteredFindings.length === 1 ? 'vulnerability' : 'vulnerabilities'} found. Run \`dvmi vuln detail <CVE-ID>\` for details.`))
      }
    }

    // Always print audit errors (e.g. tool not installed) after findings/TUI
    if (errors.length > 0) {
      this.log('')
      for (const err of errors) {
        this.log(chalk.red(`  ✘ ${err.ecosystem}: ${err.message}`))
      }
    }

    // Preserve exit code semantics: exit 1 when vulns found (unless --no-fail)
    if (filteredFindings.length > 0 && !noFail) {
      this.exit(1)
    }

    return result
  }
}

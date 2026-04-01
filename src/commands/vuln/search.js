import {Command, Args, Flags} from '@oclif/core'
import ora from 'ora'
import chalk from 'chalk'
import {searchCves, getCveDetail} from '../../services/nvd.js'
import {formatCveSearchTable, colorSeverity, formatScore, formatDate, truncate} from '../../formatters/vuln.js'
import {startInteractiveTable} from '../../utils/tui/navigable-table.js'
import {ValidationError} from '../../utils/errors.js'

// Minimum terminal rows required to show the interactive TUI
const MIN_TTY_ROWS = 6

// Column widths for the navigable table
const COL_WIDTHS = {
  id: 20,
  severity: 10,
  score: 5,
  published: 10,
  reference: 30,
}

export default class VulnSearch extends Command {
  static description = 'Search for recent CVEs by keyword (omit keyword to see all recent CVEs)'

  static examples = [
    '<%= config.bin %> vuln search openssl',
    '<%= config.bin %> vuln search openssl --days 30',
    '<%= config.bin %> vuln search log4j --severity critical',
    '<%= config.bin %> vuln search nginx --limit 10 --json',
    '<%= config.bin %> vuln search',
    '<%= config.bin %> vuln search --days 7 --severity high',
  ]

  static enableJsonFlag = true

  static args = {
    keyword: Args.string({
      description: 'Product, library, or keyword to search for (optional — omit to see all recent CVEs)',
      required: false,
    }),
  }

  static flags = {
    days: Flags.integer({
      char: 'd',
      description: 'Time window in days (search CVEs published within last N days)',
      default: 14,
    }),
    severity: Flags.string({
      char: 's',
      description: 'Minimum severity filter',
      options: ['low', 'medium', 'high', 'critical'],
    }),
    limit: Flags.integer({
      char: 'l',
      description: 'Maximum number of results to display',
      default: 20,
    }),
  }

  async run() {
    const {args, flags} = await this.parse(VulnSearch)
    const isJson = flags.json

    const {keyword} = args
    const {days, severity, limit} = flags

    if (days < 1 || days > 120) {
      throw new ValidationError(
        `--days must be between 1 and 120, got ${days}`,
        'The NVD API supports a maximum 120-day date range per request.',
      )
    }

    if (limit < 1 || limit > 2000) {
      throw new ValidationError(
        `--limit must be between 1 and 2000, got ${limit}`,
        'The NVD API returns at most 2000 results per page.',
      )
    }

    const spinner = isJson
      ? null
      : ora(keyword ? `Searching NVD for "${keyword}"...` : `Fetching recent CVEs (last ${days} days)...`).start()

    try {
      const {results, totalResults} = await searchCves({keyword, days, severity, limit})
      spinner?.stop()

      const result = {keyword: keyword ?? null, days, severity: severity ?? null, totalResults, results}

      if (isJson) return result

      this.log(formatCveSearchTable(results, keyword, days, totalResults))

      // Interactive navigable table — only in a real TTY with enough rows, skipped in CI / --json / piped output
      const ttyRows = process.stdout.rows ?? 0
      if (process.stdout.isTTY && results.length > 0 && ttyRows >= MIN_TTY_ROWS) {
        const heading = keyword
          ? `CVE Search: "${keyword}" (last ${days} days)`
          : `CVE Search: all recent (last ${days} days)`

        const termCols = process.stdout.columns || 80
        const descWidth = Math.max(20, Math.min(60, termCols - 84))

        const rows = results.map((r) => ({
          id: r.id,
          severity: r.severity,
          score: formatScore(r.score),
          published: formatDate(r.publishedDate),
          description: truncate(r.description, descWidth),
          reference: r.firstReference ? truncate(r.firstReference, COL_WIDTHS.reference) : '—',
        }))

        /** @type {import('../../utils/tui/navigable-table.js').TableColumnDef[]} */
        const columns = [
          {header: 'CVE ID', key: 'id', width: COL_WIDTHS.id, colorize: (v) => chalk.cyan(v)},
          {header: 'Severity', key: 'severity', width: COL_WIDTHS.severity, colorize: (v) => colorSeverity(v)},
          {header: 'Score', key: 'score', width: COL_WIDTHS.score},
          {header: 'Published', key: 'published', width: COL_WIDTHS.published},
          {header: 'Description', key: 'description', width: descWidth},
          {header: 'Reference', key: 'reference', width: COL_WIDTHS.reference},
        ]

        await startInteractiveTable(rows, columns, heading, totalResults, getCveDetail)
      }

      return result
    } catch (err) {
      spinner?.stop()
      throw err
    }
  }
}

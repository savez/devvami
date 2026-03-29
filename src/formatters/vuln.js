import chalk from 'chalk'
import { renderTable } from './table.js'
import { NVD_ATTRIBUTION } from '../services/nvd.js'

/** @import { CveSearchResult, CveDetail, VulnerabilityFinding, ScanResult } from '../types.js' */

/**
 * Colorize a severity string for terminal output.
 * @param {string} severity
 * @returns {string}
 */
export function colorSeverity(severity) {
  switch (severity) {
    case 'Critical': return chalk.red.bold(severity)
    case 'High':     return chalk.red(severity)
    case 'Medium':   return chalk.yellow(severity)
    case 'Low':      return chalk.blue(severity)
    default:         return chalk.gray(severity)
  }
}

/**
 * Format a CVE score as a fixed-precision string or "N/A".
 * @param {number|null} score
 * @returns {string}
 */
export function formatScore(score) {
  if (score === null || score === undefined) return 'N/A'
  return score.toFixed(1)
}

/**
 * Format an ISO-8601 date string as YYYY-MM-DD.
 * @param {string} iso
 * @returns {string}
 */
export function formatDate(iso) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

/**
 * Truncate a string to max length, appending … if needed.
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
export function truncate(str, max) {
  if (!str) return ''
  if (str.length <= max) return str
  return str.slice(0, max - 1) + '…'
}

/**
 * Format a list of CVE search results as a terminal table string.
 * @param {CveSearchResult[]} results
 * @param {string|null|undefined} keyword
 * @param {number} days
 * @param {number} totalResults
 * @returns {string}
 */
export function formatCveSearchTable(results, keyword, days, totalResults) {
  const lines = []
  const heading = keyword
    ? `CVE Search: "${keyword}" (last ${days} days)`
    : `CVE Search: all recent (last ${days} days)`
  lines.push(chalk.bold(`${heading}\n`))

  if (results.length === 0) {
    lines.push(keyword ? '  No CVEs found for this search.' : '  No CVEs published in this time window.')
    lines.push('')
    lines.push(chalk.dim(NVD_ATTRIBUTION))
    return lines.join('\n')
  }

  const rows = results.map((r) => ({
    id: r.id,
    severity: r.severity,
    score: formatScore(r.score),
    published: formatDate(r.publishedDate),
    description: truncate(r.description, 90),
    reference: r.firstReference ? truncate(r.firstReference, 45) : '—',
  }))

  const table = renderTable(rows, [
    { header: 'CVE ID',      key: 'id',          colorize: (v) => chalk.cyan(v) },
    { header: 'Severity',    key: 'severity',     colorize: (v) => colorSeverity(v) },
    { header: 'Score',       key: 'score',        width: 5 },
    { header: 'Published',   key: 'published',    width: 10 },
    { header: 'Description', key: 'description',  width: 90 },
    { header: 'Reference',   key: 'reference',    width: 45 },
  ])

  // Indent table by 2 spaces
  lines.push(table.split('\n').map((l) => `  ${l}`).join('\n'))
  lines.push('')
  lines.push(`Showing ${results.length} of ${totalResults} results.`)
  lines.push(chalk.dim(NVD_ATTRIBUTION))
  return lines.join('\n')
}

/**
 * Format a full CVE detail record for terminal output.
 * @param {CveDetail} cve
 * @returns {string}
 */
export function formatCveDetail(cve) {
  const lines = []

  const scoreStr = cve.score !== null ? ` (${formatScore(cve.score)})` : ''
  lines.push(chalk.bold.cyan(`${cve.id}`) + chalk.bold(` — `) + colorSeverity(cve.severity) + chalk.bold(scoreStr))
  lines.push('')

  // Description
  lines.push(chalk.bold('  Description'))
  // Word-wrap at ~80 chars, indented 2 spaces
  lines.push(wordWrap(cve.description, 78, '  '))
  lines.push('')

  // Details
  lines.push(chalk.bold('  Details'))
  lines.push(`  Status:        ${cve.status}`)
  lines.push(`  Published:     ${formatDate(cve.publishedDate)}`)
  lines.push(`  Last Modified: ${formatDate(cve.lastModified)}`)
  if (cve.cvssVector) lines.push(`  CVSS Vector:   ${cve.cvssVector}`)
  if (cve.weaknesses.length > 0) {
    const cweIds = [...new Set(cve.weaknesses.map((w) => w.id))].join(', ')
    lines.push(`  Weaknesses:    ${cweIds}`)
  }
  lines.push('')

  // Affected products
  if (cve.affectedProducts.length > 0) {
    lines.push(chalk.bold('  Affected Products'))
    lines.push('  ' + chalk.dim('─'.repeat(40)))
    for (const p of cve.affectedProducts) {
      lines.push(`  ${p.vendor} / ${p.product} / ${p.versions}`)
    }
    lines.push('')
  }

  // References
  if (cve.references.length > 0) {
    lines.push(chalk.bold('  References'))
    cve.references.slice(0, 5).forEach((ref, i) => {
      const tagStr = ref.tags.length > 0 ? ` (${ref.tags.join(', ')})` : ''
      lines.push(`  [${i + 1}] ${ref.url}${tagStr}`)
    })
    lines.push('')
    lines.push(chalk.dim('  Tip: Use --open to open the first reference in your browser.'))
    lines.push('')
  }

  lines.push(chalk.dim(NVD_ATTRIBUTION))
  return lines.join('\n')
}

/**
 * Format a full CVE detail record as an array of plain-text lines (no chalk/ANSI).
 * Used by the modal overlay in the navigable table TUI.
 * @param {CveDetail} cve
 * @returns {string[]}
 */
export function formatCveDetailPlain(cve) {
  const lines = []

  const scoreStr = cve.score !== null ? ` (${formatScore(cve.score)})` : ''
  lines.push(`${cve.id} — ${cve.severity}${scoreStr}`)
  lines.push('')

  lines.push('  Description')
  const wrappedDesc = wordWrap(cve.description, 78, '  ')
  for (const l of wrappedDesc.split('\n')) lines.push(l)
  lines.push('')

  lines.push('  Details')
  lines.push(`  Status:        ${cve.status}`)
  lines.push(`  Published:     ${formatDate(cve.publishedDate)}`)
  lines.push(`  Last Modified: ${formatDate(cve.lastModified)}`)
  if (cve.cvssVector) lines.push(`  CVSS Vector:   ${cve.cvssVector}`)
  if (cve.weaknesses.length > 0) {
    const cweIds = [...new Set(cve.weaknesses.map((w) => w.id))].join(', ')
    lines.push(`  Weaknesses:    ${cweIds}`)
  }
  lines.push('')

  if (cve.affectedProducts.length > 0) {
    lines.push('  Affected Products')
    lines.push('  ' + '─'.repeat(40))
    for (const p of cve.affectedProducts) {
      lines.push(`  ${p.vendor} / ${p.product} / ${p.versions}`)
    }
    lines.push('')
  }

  if (cve.references.length > 0) {
    lines.push('  References')
    cve.references.slice(0, 5).forEach((ref, i) => {
      const tagStr = ref.tags.length > 0 ? ` (${ref.tags.join(', ')})` : ''
      lines.push(`  [${i + 1}] ${ref.url}${tagStr}`)
    })
    lines.push('')
    lines.push('  Tip: Press o to open the first reference in your browser.')
    lines.push('')
  }

  lines.push(NVD_ATTRIBUTION)
  return lines
}

/**
 * Word-wrap a string to a max line length with an indent prefix.
 * @param {string} text
 * @param {number} maxLen
 * @param {string} indent
 * @returns {string}
 */
function wordWrap(text, maxLen, indent) {
  if (!text) return ''
  const words = text.split(' ')
  const wrappedLines = []
  let current = indent

  for (const word of words) {
    if (current.length + word.length + 1 > maxLen && current.trim().length > 0) {
      wrappedLines.push(current.trimEnd())
      current = indent + word + ' '
    } else {
      current += word + ' '
    }
  }
  if (current.trim()) wrappedLines.push(current.trimEnd())
  return wrappedLines.join('\n')
}

/**
 * Format a list of VulnerabilityFindings as a terminal table string.
 * @param {VulnerabilityFinding[]} findings
 * @returns {string}
 */
export function formatFindingsTable(findings) {
  if (findings.length === 0) return ''

  const rows = findings.map((f) => ({
    pkg: f.package,
    version: f.installedVersion,
    severity: f.severity,
    cve: f.cveId ?? '—',
    title: truncate(f.title ?? '—', 40),
  }))

  const table = renderTable(rows, [
    { header: 'Package',  key: 'pkg',      width: 20 },
    { header: 'Version',  key: 'version',  width: 12 },
    { header: 'Severity', key: 'severity', colorize: (v) => colorSeverity(v) },
    { header: 'CVE',      key: 'cve',      colorize: (v) => (v !== '—' ? chalk.cyan(v) : chalk.gray(v)) },
    { header: 'Title',    key: 'title',    width: 40 },
  ])

  return table.split('\n').map((l) => `  ${l}`).join('\n')
}

/**
 * Format a ScanResult summary block for terminal output.
 * @param {import('../types.js').ScanSummary} summary
 * @returns {string}
 */
export function formatScanSummary(summary) {
  const lines = []
  lines.push('  ' + chalk.dim('─'.repeat(21)))
  lines.push(`  Critical:  ${summary.critical}`)
  lines.push(`  High:      ${summary.high}`)
  lines.push(`  Medium:    ${summary.medium}`)
  lines.push(`  Low:       ${summary.low}`)
  lines.push(`  Total:     ${summary.total}`)
  return lines.join('\n')
}

/**
 * Generate a Markdown vulnerability report.
 * @param {ScanResult} result
 * @returns {string}
 */
export function formatMarkdownReport(result) {
  const lines = []
  lines.push('# Vulnerability Report')
  lines.push('')
  lines.push(`**Project**: ${result.projectPath}  `)
  lines.push(`**Date**: ${result.scanDate}  `)
  lines.push(`**Ecosystems scanned**: ${result.ecosystems.map((e) => e.name).join(', ')}`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('| Severity | Count |')
  lines.push('|----------|-------|')
  lines.push(`| Critical | ${result.summary.critical} |`)
  lines.push(`| High     | ${result.summary.high} |`)
  lines.push(`| Medium   | ${result.summary.medium} |`)
  lines.push(`| Low      | ${result.summary.low} |`)
  lines.push(`| **Total** | **${result.summary.total}** |`)
  lines.push('')

  if (result.findings.length > 0) {
    lines.push('## Findings')
    lines.push('')
    lines.push('| Package | Version | Severity | CVE | Title |')
    lines.push('|---------|---------|----------|-----|-------|')
    for (const f of result.findings) {
      lines.push(`| ${f.package} | ${f.installedVersion} | ${f.severity} | ${f.cveId ?? '—'} | ${f.title ?? '—'} |`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push(`*${NVD_ATTRIBUTION}*`)
  return lines.join('\n')
}

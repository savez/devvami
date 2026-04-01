/** @import { AWSCostEntry, CostGroupMode } from '../types.js' */

/**
 * Format a USD amount as currency string.
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  return `$${amount.toFixed(2)}`
}

/**
 * Calculate total cost from entries.
 * @param {AWSCostEntry[]} entries
 * @returns {number}
 */
export function calculateTotal(entries) {
  return entries.reduce((sum, e) => sum + e.amount, 0)
}

/**
 * Format a trend percentage.
 * @param {number} current
 * @param {number} previous
 * @returns {string}
 */
export function formatTrend(current, previous) {
  if (previous === 0) return 'N/A'
  const pct = ((current - previous) / previous) * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

/**
 * Derive the display row label for a cost entry based on the grouping mode.
 * @param {AWSCostEntry} entry
 * @param {CostGroupMode} groupBy
 * @returns {string}
 */
export function rowLabel(entry, groupBy) {
  if (groupBy === 'tag') return entry.tagValue ?? entry.serviceName
  if (groupBy === 'both') return `${entry.serviceName} / ${entry.tagValue ?? '(untagged)'}`
  return entry.serviceName
}

/**
 * Format cost entries as a printable table string.
 * @param {AWSCostEntry[]} entries
 * @param {string} label - Display label for the header
 * @param {CostGroupMode} [groupBy] - Grouping mode (default: 'service')
 * @returns {string}
 */
export function formatCostTable(entries, label, groupBy = 'service') {
  const total = calculateTotal(entries)
  const rows = entries
    .sort((a, b) => b.amount - a.amount)
    .map((e) => `  ${rowLabel(e, groupBy).padEnd(40)} ${formatCurrency(e.amount)}`)
    .join('\n')
  const divider = '─'.repeat(50)
  return [`Costs for: ${label}`, divider, rows, divider, `  ${'Total'.padEnd(40)} ${formatCurrency(total)}`].join('\n')
}

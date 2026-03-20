/** @import { AWSCostEntry } from '../types.js' */

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
 * Format cost entries as a printable table string.
 * @param {AWSCostEntry[]} entries
 * @param {string} serviceName
 * @returns {string}
 */
export function formatCostTable(entries, serviceName) {
  const total = calculateTotal(entries)
  const rows = entries
    .sort((a, b) => b.amount - a.amount)
    .map((e) => `  ${e.serviceName.padEnd(40)} ${formatCurrency(e.amount)}`)
    .join('\n')
  const divider = '─'.repeat(50)
  return [
    `Costs for: ${serviceName}`,
    divider,
    rows,
    divider,
    `  ${'Total'.padEnd(40)} ${formatCurrency(total)}`,
  ].join('\n')
}

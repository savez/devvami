import chalk from 'chalk'
import { colorStatus } from './table.js'

/** @import { DoctorCheck } from '../types.js' */

/**
 * Format a DoctorCheck for terminal output.
 * @param {DoctorCheck} check
 * @returns {string}
 */
export function formatDoctorCheck(check) {
  const badge = colorStatus(check.status)
  const version = check.version ? chalk.gray(`  ${check.version}`) : ''
  const hint = check.status !== 'ok' && check.hint ? chalk.dim(`\n    → ${check.hint}`) : ''
  return `${badge}  ${check.name}${version}${hint}`
}

/**
 * Format a summary line for doctor output.
 * @param {{ ok: number, warn: number, fail: number }} summary
 * @returns {string}
 */
export function formatDoctorSummary(summary) {
  const parts = [
    chalk.green(`${summary.ok} ok`),
    chalk.yellow(`${summary.warn} warnings`),
    chalk.red(`${summary.fail} failures`),
  ]
  return parts.join(', ')
}

/**
 * Format a CI status badge.
 * @param {'pass'|'fail'|'pending'|string} status
 * @returns {string}
 */
export function formatCIStatus(status) {
  return colorStatus(status)
}

/**
 * Format a review status badge.
 * @param {'approved'|'changes_requested'|'pending'|string} status
 * @returns {string}
 */
export function formatReviewStatus(status) {
  return colorStatus(status)
}

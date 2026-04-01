import chalk from 'chalk'
import {deriveOverallStatus} from '../services/security.js'

/** @import { SetupSession, SecurityToolStatus, PlatformInfo } from '../types.js' */

/**
 * Format the educational introduction about credential security.
 * @returns {string}
 */
export function formatEducationalIntro() {
  const border = chalk.dim('─'.repeat(60))
  const lines = [
    border,
    chalk.bold.yellow('  Why credential security matters'),
    border,
    '',
    chalk.white('  Storing secrets in plaintext (shell history, .env files,'),
    chalk.white('  ~/.aws/credentials) is the leading cause of supply chain'),
    chalk.white('  attacks. One leaked key can compromise your entire org.'),
    '',
    chalk.bold('  What this setup installs:'),
    '',
    chalk.cyan('  aws-vault') + chalk.white('   — stores AWS credentials in an encrypted vault'),
    chalk.cyan('             ') + chalk.white('  (macOS Keychain, pass on Linux).'),
    chalk.cyan('  pass     ') + chalk.white('   — GPG-encrypted password store (Linux/WSL2).'),
    chalk.cyan('  GCM      ') + chalk.white('   — Git Credential Manager: no more PATs in files.'),
    chalk.cyan('  Keychain ') + chalk.white('   — macOS Keychain as Git credential helper.'),
    '',
    chalk.dim('  References: https://aws.github.io/aws-vault  |  https://www.passwordstore.org'),
    border,
  ]
  return lines.join('\n')
}

/**
 * Format a step header line for the setup flow.
 * @param {{ id: string, label: string, type: string }} step
 * @returns {string}
 */
export function formatStepHeader(step) {
  const typeColor = {
    check: chalk.blue,
    install: chalk.yellow,
    configure: chalk.cyan,
    verify: chalk.green,
  }
  const colorFn = typeColor[step.type] ?? chalk.white
  return `  ${colorFn(`[${step.type}]`)}  ${step.label}`
}

/**
 * Format the completion summary table for a setup session.
 * @param {SetupSession} session
 * @param {PlatformInfo} platformInfo
 * @returns {string}
 */
export function formatSecuritySummary(session, platformInfo) {
  const border = chalk.dim('─'.repeat(60))
  const lines = [
    '',
    border,
    chalk.bold('  Security Setup — Summary'),
    border,
    '',
    chalk.bold(`  Platform: ${chalk.cyan(platformInfo.platform)}`),
    chalk.bold(`  Selection: ${chalk.cyan(session.selection)}`),
    '',
  ]

  // Build a per-step result table
  for (const step of session.steps) {
    const result = session.results.get(step.id)
    const status = result?.status ?? 'pending'
    let badge
    if (status === 'success') badge = chalk.green('✔')
    else if (status === 'skipped') badge = chalk.dim('─')
    else if (status === 'failed') badge = chalk.red('✗')
    else badge = chalk.gray('○')

    const label = chalk.white(step.label.padEnd(45))
    const msg = result?.message ? chalk.gray(`  ${result.message}`) : ''
    lines.push(`  ${badge}  ${label}${msg}`)

    if (status === 'failed' && result?.hint) {
      lines.push(chalk.dim(`       → ${result.hint}`))
      if (result.hintUrl) lines.push(chalk.dim(`         ${result.hintUrl}`))
    }
  }

  lines.push('')

  // Overall status
  const successful = [...session.results.values()].filter((r) => r.status === 'success').length
  const failed = [...session.results.values()].filter((r) => r.status === 'failed').length
  const skipped = [...session.results.values()].filter((r) => r.status === 'skipped').length

  lines.push(
    `  ${chalk.green(`${successful} succeeded`)}  ${chalk.dim(`${skipped} skipped`)}  ${failed > 0 ? chalk.red(`${failed} failed`) : chalk.dim('0 failed')}`,
  )

  if (failed === 0) {
    lines.push('')
    lines.push(chalk.bold.green('  All done! Restart your terminal to apply shell profile changes.'))
    lines.push(chalk.dim('  Then run: dvmi auth login'))
  } else {
    lines.push('')
    lines.push(chalk.bold.red('  Setup incomplete — see failure hints above.'))
  }

  lines.push(border)
  return lines.join('\n')
}

/**
 * Derive an overall status label from tool statuses (re-exported for convenience).
 * @param {SecurityToolStatus[]} tools
 * @returns {'success'|'partial'|'not-configured'}
 */
export {deriveOverallStatus}

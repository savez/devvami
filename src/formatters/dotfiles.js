import chalk from 'chalk'

/** @import { DotfilesSetupResult, DotfilesStatusResult, DotfilesAddResult, DotfilesSyncResult, DotfileEntry } from '../types.js' */

const BORDER = chalk.dim('─'.repeat(60))

// ---------------------------------------------------------------------------
// formatDotfilesSetup (T020)
// ---------------------------------------------------------------------------

/**
 * Format the output of `dvmi dotfiles setup` completion.
 * @param {DotfilesSetupResult} result
 * @returns {string}
 */
export function formatDotfilesSetup(result) {
  const lines = [
    '',
    BORDER,
    chalk.bold('  Dotfiles Setup — Summary'),
    BORDER,
    '',
    chalk.bold(`  Platform:    ${chalk.cyan(result.platform)}`),
    chalk.bold(`  Status:      ${result.status === 'success' ? chalk.green('success') : result.status === 'skipped' ? chalk.dim('skipped') : chalk.red('failed')}`),
  ]

  if (result.sourceDir) {
    lines.push(chalk.white(`  Source dir:  ${chalk.cyan(result.sourceDir)}`))
  }

  if (result.publicKey) {
    lines.push('')
    lines.push(chalk.white(`  Age public key:`))
    lines.push(chalk.cyan(`    ${result.publicKey}`))
    lines.push('')
    lines.push(chalk.yellow('  IMPORTANT: Back up your age key!'))
    lines.push(chalk.dim(`    Key file: ~/.config/chezmoi/key.txt`))
    lines.push(chalk.dim('    Without this key you cannot decrypt your dotfiles on a new machine.'))
  }

  if (result.status === 'success') {
    lines.push('')
    lines.push(chalk.bold.green('  Chezmoi configured with age encryption!'))
    lines.push(chalk.dim('  Run `dvmi dotfiles add` to start tracking files'))
  } else if (result.status === 'failed') {
    lines.push('')
    lines.push(chalk.bold.red('  Setup failed.'))
    if (result.message) lines.push(chalk.dim(`  → ${result.message}`))
  } else if (result.status === 'skipped') {
    lines.push('')
    if (result.message) lines.push(chalk.dim(`  ${result.message}`))
  }

  lines.push(BORDER)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// formatDotfilesSummary (T012)
// ---------------------------------------------------------------------------

/**
 * Format the file count summary line.
 * @param {{ total: number, encrypted: number, plaintext: number }} summary
 * @returns {string}
 */
export function formatDotfilesSummary(summary) {
  return `${summary.total} total: ${summary.plaintext} plaintext, ${summary.encrypted} encrypted`
}

// ---------------------------------------------------------------------------
// formatDotfilesStatus (T012 / T032)
// ---------------------------------------------------------------------------

/**
 * Infer a display category from a file path.
 * @param {string} filePath
 * @returns {string}
 */
function inferCategory(filePath) {
  const lower = filePath.toLowerCase()
  if (lower.includes('.ssh') || lower.includes('.gnupg') || lower.includes('gpg') || lower.includes('secret') || lower.includes('credential') || lower.includes('token') || lower.includes('password')) return 'Security'
  if (lower.includes('.gitconfig') || lower.includes('.gitignore') || lower.includes('.git')) return 'Git'
  if (lower.includes('zshrc') || lower.includes('bashrc') || lower.includes('bash_profile') || lower.includes('zprofile') || lower.includes('fish')) return 'Shell'
  if (lower.includes('vim') || lower.includes('nvim') || lower.includes('emacs') || lower.includes('vscode') || lower.includes('cursor')) return 'Editor'
  if (lower.includes('brew') || lower.includes('npm') || lower.includes('yarn') || lower.includes('pip') || lower.includes('gem')) return 'Package'
  return 'Other'
}

/**
 * Format the full `dvmi dotfiles status` interactive output.
 * @param {DotfilesStatusResult} result
 * @returns {string}
 */
export function formatDotfilesStatus(result) {
  const lines = [
    '',
    BORDER,
    chalk.bold('  Dotfiles Status'),
    BORDER,
    '',
    chalk.white(`  Platform:    ${chalk.cyan(result.platform)}`),
  ]

  if (result.sourceDir) {
    lines.push(chalk.white(`  Source dir:  ${chalk.cyan(result.sourceDir)}`))
  }

  const encLabel = result.encryptionConfigured ? chalk.green('age (configured)') : chalk.dim('not configured')
  lines.push(chalk.white(`  Encryption:  ${encLabel}`))

  if (result.repo) {
    lines.push(chalk.white(`  Remote:      ${chalk.cyan(result.repo)}`))
  } else {
    lines.push(chalk.white(`  Remote:      ${chalk.dim('not configured')}`))
  }

  if (!result.enabled) {
    lines.push('')
    lines.push(chalk.dim('  Dotfiles management not configured.'))
    lines.push(chalk.dim('  Run `dvmi dotfiles setup` to get started.'))
    lines.push(BORDER)
    return lines.join('\n')
  }

  // Group files by category
  /** @type {Record<string, DotfileEntry[]>} */
  const grouped = {}
  for (const file of result.files) {
    const category = inferCategory(file.path)
    if (!grouped[category]) grouped[category] = []
    grouped[category].push(file)
  }

  const summaryLine = formatDotfilesSummary(result.summary)
  lines.push('')
  lines.push(chalk.bold(`  Managed Files (${summaryLine})`))
  lines.push(BORDER)

  for (const [category, files] of Object.entries(grouped)) {
    const catLabel = category === 'Security' ? `  ${category} 🔒` : `  ${category}`
    lines.push('')
    lines.push(chalk.bold(catLabel))
    for (const file of files) {
      const encTag = file.encrypted ? chalk.dim('  encrypted') : ''
      lines.push(`    ${file.path}${encTag}`)
    }
  }

  if (result.files.length === 0) {
    lines.push('')
    lines.push(chalk.dim('  No files managed yet. Run `dvmi dotfiles add` to start tracking files.'))
  }

  lines.push('')
  lines.push(BORDER)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// formatDotfilesAdd (T027)
// ---------------------------------------------------------------------------

/**
 * Format the output of `dvmi dotfiles add` completion.
 * @param {DotfilesAddResult} result
 * @returns {string}
 */
export function formatDotfilesAdd(result) {
  const lines = [
    '',
    BORDER,
    chalk.bold('  Dotfiles Add — Summary'),
    BORDER,
    '',
  ]

  if (result.added.length > 0) {
    lines.push(chalk.bold(`  Added (${result.added.length}):`))
    for (const item of result.added) {
      const encTag = item.encrypted ? chalk.dim(' [encrypted]') : ''
      lines.push(chalk.green(`    ✔ ${item.path}${encTag}`))
    }
    lines.push('')
  }

  if (result.skipped.length > 0) {
    lines.push(chalk.bold(`  Skipped (${result.skipped.length}):`))
    for (const item of result.skipped) {
      lines.push(chalk.dim(`    ─ ${item.path}  ${item.reason}`))
    }
    lines.push('')
  }

  if (result.rejected.length > 0) {
    lines.push(chalk.bold(`  Rejected (${result.rejected.length}):`))
    for (const item of result.rejected) {
      lines.push(chalk.red(`    ✗ ${item.path}  ${item.reason}`))
    }
    lines.push('')
  }

  if (result.added.length === 0 && result.skipped.length === 0 && result.rejected.length === 0) {
    lines.push(chalk.dim('  No files processed.'))
    lines.push('')
  }

  lines.push(BORDER)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// formatDotfilesSync (T039 / T044)
// ---------------------------------------------------------------------------

/**
 * Format the output of `dvmi dotfiles sync` completion.
 * @param {DotfilesSyncResult} result
 * @returns {string}
 */
export function formatDotfilesSync(result) {
  const actionLabel = {
    push: 'Push',
    pull: 'Pull',
    'init-remote': 'Remote Setup',
    skipped: 'Skipped',
  }[result.action] ?? result.action

  const lines = [
    '',
    BORDER,
    chalk.bold(`  Dotfiles Sync — ${actionLabel}`),
    BORDER,
    '',
    chalk.white(`  Action:  ${chalk.cyan(actionLabel)}`),
    chalk.white(`  Status:  ${result.status === 'success' ? chalk.green('success') : result.status === 'skipped' ? chalk.dim('skipped') : chalk.red('failed')}`),
  ]

  if (result.repo) {
    lines.push(chalk.white(`  Remote:  ${chalk.cyan(result.repo)}`))
  }

  if (result.message) {
    lines.push('')
    lines.push(chalk.white(`  ${result.message}`))
  }

  if (result.conflicts && result.conflicts.length > 0) {
    lines.push('')
    lines.push(chalk.bold.red(`  Conflicts (${result.conflicts.length}):`))
    for (const conflict of result.conflicts) {
      lines.push(chalk.red(`    ✗ ${conflict}`))
    }
    lines.push(chalk.dim('  Resolve conflicts manually and run `chezmoi apply` to continue.'))
  }

  lines.push(BORDER)
  return lines.join('\n')
}

import { Command, Flags, Args } from '@oclif/core'
import ora from 'ora'
import chalk from 'chalk'
import { confirm, input, select } from '@inquirer/prompts'
import { detectPlatform } from '../../services/platform.js'
import { isChezmoiInstalled, getChezmoiRemote, hasLocalChanges } from '../../services/dotfiles.js'
import { loadConfig, saveConfig } from '../../services/config.js'
import { exec, execOrThrow } from '../../services/shell.js'
import { formatDotfilesSync } from '../../formatters/dotfiles.js'
import { DvmiError } from '../../utils/errors.js'

/** @import { DotfilesSyncResult } from '../../types.js' */

export default class DotfilesSync extends Command {
  static description = 'Sync dotfiles with remote repository: push local changes or pull from remote'

  static examples = [
    '<%= config.bin %> dotfiles sync',
    '<%= config.bin %> dotfiles sync --push',
    '<%= config.bin %> dotfiles sync --pull',
    '<%= config.bin %> dotfiles sync --pull git@github.com:user/dotfiles.git',
    '<%= config.bin %> dotfiles sync --dry-run --push',
    '<%= config.bin %> dotfiles sync --json',
  ]

  static enableJsonFlag = true

  static flags = {
    help: Flags.help({ char: 'h' }),
    push: Flags.boolean({ description: 'Push local changes to remote', default: false }),
    pull: Flags.boolean({ description: 'Pull remote changes and apply', default: false }),
    'dry-run': Flags.boolean({ description: 'Show what would change without applying', default: false }),
  }

  static args = {
    repo: Args.string({ description: 'Remote repository URL (for initial remote setup)', required: false }),
  }

  async run() {
    const { flags, args } = await this.parse(DotfilesSync)
    const isJson = flags.json
    const isPush = flags.push
    const isPull = flags.pull
    const isDryRun = flags['dry-run']
    const repoArg = args.repo

    // Flag validation: --push and --pull are mutually exclusive
    if (isPush && isPull) {
      throw new DvmiError(
        'Cannot use --push and --pull together — they are mutually exclusive.',
        'Use --push to upload local changes or --pull to download remote changes.',
      )
    }

    // Non-interactive guard
    const isCI = process.env.CI === 'true'
    const isNonInteractive = !process.stdout.isTTY
    if ((isCI || isNonInteractive) && !isJson) {
      this.error(
        'This command requires an interactive terminal (TTY). Run with --json for a non-interactive sync.',
        { exit: 1 },
      )
    }

    const config = await loadConfig()
    if (!config.dotfiles?.enabled) {
      throw new DvmiError(
        'Chezmoi dotfiles management is not configured',
        'Run `dvmi dotfiles setup` first',
      )
    }

    const chezmoiInstalled = await isChezmoiInstalled()
    if (!chezmoiInstalled) {
      const platformInfo = await detectPlatform()
      const hint = platformInfo.platform === 'macos'
        ? 'Run `brew install chezmoi` or visit https://chezmoi.io/install'
        : 'Run `sh -c "$(curl -fsLS get.chezmoi.io)"` or visit https://chezmoi.io/install'
      throw new DvmiError('chezmoi is not installed', hint)
    }

    const remote = config.dotfiles?.repo ?? await getChezmoiRemote()

    // --json mode: attempt push/pull or report status
    if (isJson) {
      if (!remote && !repoArg) {
        /** @type {DotfilesSyncResult} */
        return {
          action: 'skipped',
          repo: null,
          status: 'skipped',
          message: 'No remote repository configured. Run `dvmi dotfiles sync <repo-url>` to set up remote.',
          conflicts: [],
        }
      }

      const effectiveRemote = repoArg ?? remote

      if (isPull) {
        return await this._pull(effectiveRemote, isDryRun, isJson)
      }

      if (isPush || remote) {
        return await this._push(effectiveRemote, isDryRun, isJson)
      }

      /** @type {DotfilesSyncResult} */
      return { action: 'skipped', repo: effectiveRemote ?? null, status: 'skipped', message: 'No action specified', conflicts: [] }
    }

    // ---------------------------------------------------------------------------
    // Interactive mode
    // ---------------------------------------------------------------------------

    // No remote — initial setup flow
    if (!remote && !repoArg) {
      return await this._setupRemote(config, isDryRun)
    }

    const effectiveRemote = repoArg ?? remote
    const localChanges = await hasLocalChanges()

    if (isPush) {
      const result = await this._push(effectiveRemote, isDryRun, false)
      this.log(formatDotfilesSync(result))
      return result
    }

    if (isPull) {
      const result = await this._pull(effectiveRemote, isDryRun, false)
      this.log(formatDotfilesSync(result))
      return result
    }

    // Interactive menu
    this.log(chalk.bold(`\n  Remote: ${chalk.cyan(effectiveRemote)}`))
    this.log(chalk.white(`  Local changes: ${localChanges ? chalk.yellow('yes') : chalk.dim('none')}`))
    this.log('')

    const action = await select({
      message: 'What would you like to do?',
      choices: [
        { name: 'Push local changes to remote', value: 'push' },
        { name: 'Pull remote changes and apply', value: 'pull' },
        { name: 'Cancel', value: 'cancel' },
      ],
    })

    if (action === 'cancel') {
      /** @type {DotfilesSyncResult} */
      const cancelResult = { action: 'skipped', repo: effectiveRemote ?? null, status: 'skipped', message: 'Cancelled by user', conflicts: [] }
      this.log(formatDotfilesSync(cancelResult))
      return cancelResult
    }

    const result = action === 'push'
      ? await this._push(effectiveRemote, isDryRun, false)
      : await this._pull(effectiveRemote, isDryRun, false)

    this.log(formatDotfilesSync(result))
    return result
  }

  // ---------------------------------------------------------------------------
  // _setupRemote — initial remote connection
  // ---------------------------------------------------------------------------

  /**
   * @param {import('../../types.js').CLIConfig} config
   * @param {boolean} isDryRun
   * @returns {Promise<DotfilesSyncResult>}
   */
  async _setupRemote(config, isDryRun) {
    const choice = await select({
      message: 'Connect to an existing dotfiles repository or create a new one?',
      choices: [
        { name: 'Connect to existing repository', value: 'existing' },
        { name: 'Create new repository on GitHub', value: 'new' },
      ],
    })

    let repoUrl = ''

    if (choice === 'existing') {
      repoUrl = await input({ message: 'Repository URL (SSH or HTTPS):' })
    } else {
      const repoName = await input({ message: 'Repository name:', default: 'dotfiles' })
      const isPrivate = await confirm({ message: 'Make repository private?', default: true })

      if (!isDryRun) {
        try {
          const visFlag = isPrivate ? '--private' : '--public'
          await execOrThrow('gh', ['repo', 'create', repoName, visFlag, '--confirm'])
          // Get the SSH URL from the created repo
          const { exec } = await import('../../services/shell.js')
          const result = await exec('gh', ['repo', 'view', repoName, '--json', 'sshUrl', '--jq', '.sshUrl'])
          repoUrl = result.stdout.trim() || `git@github.com:${repoName}.git`
        } catch {
          throw new DvmiError(
            'Failed to create repository on GitHub',
            'Verify your GitHub authentication: `gh auth status`',
          )
        }
      } else {
        repoUrl = `git@github.com:<user>/${repoName}.git`
      }
    }

    if (!isDryRun) {
      try {
        await execOrThrow('chezmoi', ['git', '--', 'remote', 'add', 'origin', repoUrl])
        await execOrThrow('chezmoi', ['git', '--', 'push', '-u', 'origin', 'main'])
        // Save repo to dvmi config
        config.dotfiles = { ...(config.dotfiles ?? { enabled: true }), repo: repoUrl }
        await saveConfig(config)
      } catch (err) {
        /** @type {DotfilesSyncResult} */
        const failResult = {
          action: 'init-remote',
          repo: repoUrl,
          status: 'failed',
          message: err instanceof Error ? err.message : String(err),
          conflicts: [],
        }
        this.log(formatDotfilesSync(failResult))
        return failResult
      }
    }

    /** @type {DotfilesSyncResult} */
    const result = {
      action: 'init-remote',
      repo: repoUrl,
      status: isDryRun ? 'skipped' : 'success',
      message: isDryRun ? `Would configure remote: ${repoUrl}` : 'Remote repository configured and initial push completed',
      conflicts: [],
    }
    this.log(formatDotfilesSync(result))
    return result
  }

  // ---------------------------------------------------------------------------
  // _push
  // ---------------------------------------------------------------------------

  /**
   * @param {string|null|undefined} remote
   * @param {boolean} isDryRun
   * @param {boolean} isJson
   * @returns {Promise<DotfilesSyncResult>}
   */
  async _push(remote, isDryRun, isJson) {
    if (!remote) {
      return {
        action: 'push',
        repo: null,
        status: 'failed',
        message: 'No remote repository configured. Run `dvmi dotfiles sync <repo-url>` to set up remote.',
        conflicts: [],
      }
    }

    if (isDryRun) {
      const diffResult = await exec('chezmoi', ['git', '--', 'diff', '--cached'])
      return {
        action: 'push',
        repo: remote,
        status: 'skipped',
        message: diffResult.stdout.trim() || 'No staged changes to push',
        conflicts: [],
      }
    }

    const spinner = isJson ? null : ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Pushing to remote...') }).start()

    try {
      // Stage all changes
      await execOrThrow('chezmoi', ['git', '--', 'add', '-A'])
      // Commit
      await exec('chezmoi', ['git', '--', 'commit', '-m', 'chore: update dotfiles'])
      // Push
      await execOrThrow('chezmoi', ['git', '--', 'push', 'origin', 'HEAD'])
      spinner?.succeed(chalk.green('Pushed to remote'))

      return { action: 'push', repo: remote, status: 'success', message: 'Changes pushed to remote', conflicts: [] }
    } catch (err) {
      spinner?.fail(chalk.red('Push failed'))
      return {
        action: 'push',
        repo: remote,
        status: 'failed',
        message: err instanceof Error ? err.message : String(err),
        conflicts: [],
      }
    }
  }

  // ---------------------------------------------------------------------------
  // _pull (US4 + US5)
  // ---------------------------------------------------------------------------

  /**
   * @param {string|null|undefined} remote
   * @param {boolean} isDryRun
   * @param {boolean} isJson
   * @returns {Promise<DotfilesSyncResult>}
   */
  async _pull(remote, isDryRun, isJson) {
    if (!remote) {
      return {
        action: 'pull',
        repo: null,
        status: 'failed',
        message: 'No remote repository configured. Run `dvmi dotfiles sync <repo-url>` to set up remote.',
        conflicts: [],
      }
    }

    if (isDryRun) {
      const dryResult = await exec('chezmoi', ['apply', '--dry-run', '--verbose'])
      return {
        action: 'pull',
        repo: remote,
        status: 'skipped',
        message: dryResult.stdout.trim() || 'Would apply remote changes',
        conflicts: [],
      }
    }

    const spinner = isJson ? null : ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Pulling from remote...') }).start()

    try {
      // Check if chezmoi init was done with this remote (first-time pull)
      const currentRemote = await getChezmoiRemote()
      if (!currentRemote) {
        // First time: chezmoi init <repo>
        await execOrThrow('chezmoi', ['init', remote])
      } else {
        // Subsequent: git pull + apply
        await execOrThrow('chezmoi', ['git', '--', 'pull', '--rebase', 'origin', 'HEAD'])
      }

      // Apply changes
      const applyResult = await exec('chezmoi', ['apply', '--verbose'])
      spinner?.succeed(chalk.green('Applied remote changes'))

      // Check for conflicts in apply output
      const conflictLines = (applyResult.stdout + applyResult.stderr)
        .split('\n')
        .filter((l) => l.toLowerCase().includes('conflict'))
        .map((l) => l.trim())

      if (conflictLines.length > 0) {
        return {
          action: 'pull',
          repo: remote,
          status: 'failed',
          message: `Merge conflicts detected in ${conflictLines.length} file(s)`,
          conflicts: conflictLines,
        }
      }

      return { action: 'pull', repo: remote, status: 'success', message: 'Remote changes applied', conflicts: [] }
    } catch (err) {
      spinner?.fail(chalk.red('Pull failed'))
      return {
        action: 'pull',
        repo: remote,
        status: 'failed',
        message: err instanceof Error ? err.message : String(err),
        conflicts: [],
      }
    }
  }
}

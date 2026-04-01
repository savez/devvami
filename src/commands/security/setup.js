import {Command, Flags} from '@oclif/core'
import {confirm, select} from '@inquirer/prompts'
import ora from 'ora'
import chalk from 'chalk'
import {execa} from 'execa'
import {detectPlatform} from '../../services/platform.js'
import {exec} from '../../services/shell.js'
import {buildSteps, checkToolStatus, listGpgKeys, deriveOverallStatus} from '../../services/security.js'
import {formatEducationalIntro, formatStepHeader, formatSecuritySummary} from '../../formatters/security.js'
/** @import { SetupSession, SetupStep, StepResult, PlatformInfo } from '../../types.js' */

export default class SecuritySetup extends Command {
  static description =
    'Interactive wizard to install and configure credential protection tools (aws-vault, pass, GPG, Git Credential Manager, macOS Keychain)'

  static examples = ['<%= config.bin %> security setup', '<%= config.bin %> security setup --json']

  static enableJsonFlag = true

  static flags = {
    help: Flags.help({char: 'h'}),
  }

  async run() {
    const {flags} = await this.parse(SecuritySetup)
    const isJson = flags.json

    // FR-018: Detect non-interactive environments
    const isCI = process.env.CI === 'true'
    const isNonInteractive = !process.stdout.isTTY

    if ((isCI || isNonInteractive) && !isJson) {
      this.error(
        'This command requires an interactive terminal (TTY). Run with --json for a non-interactive health check.',
        {exit: 1},
      )
    }

    // Detect platform
    const platformInfo = await detectPlatform()
    const {platform} = platformInfo

    // FR-019: Sudo pre-flight on Linux/WSL2
    if (platform !== 'macos' && !isJson) {
      const sudoCheck = await exec('sudo', ['-n', 'true'])
      if (sudoCheck.exitCode !== 0) {
        this.error('sudo access is required to install packages. Run `sudo -v` to authenticate and retry.', {exit: 1})
      }
    }

    // --json branch: health check only (no interaction)
    if (isJson) {
      const tools = await checkToolStatus(platform)
      const overallStatus = deriveOverallStatus(tools)
      return {
        platform,
        selection: null,
        tools,
        overallStatus,
      }
    }

    // ---------------------------------------------------------------------------
    // Pre-check: show current tool status
    // ---------------------------------------------------------------------------
    const spinner = ora({
      spinner: 'arc',
      color: false,
      text: chalk.hex('#FF6B2B')('Checking current tool status...'),
    }).start()
    const currentStatus = await checkToolStatus(platform)
    spinner.stop()

    const anyInstalled = currentStatus.some((t) => t.status === 'installed' && t.status !== 'n/a')
    if (anyInstalled) {
      this.log(chalk.bold('\nCurrent security tool status:'))
      for (const tool of currentStatus) {
        if (tool.status === 'n/a') continue
        let badge
        if (tool.status === 'installed') badge = chalk.green('✔')
        else if (tool.status === 'misconfigured') badge = chalk.yellow('⚠')
        else badge = chalk.red('✗')
        const versionStr = tool.version ? chalk.gray(` ${tool.version}`) : ''
        this.log(`  ${badge}  ${tool.displayName}${versionStr}`)
        if (tool.hint) this.log(chalk.dim(`       → ${tool.hint}`))
      }
      this.log('')
    }

    // ---------------------------------------------------------------------------
    // FR-002 / FR-003: Educational intro + confirmation
    // ---------------------------------------------------------------------------
    this.log(formatEducationalIntro())
    this.log('')

    const understood = await confirm({
      message: 'I understand and want to protect my credentials',
      default: true,
    })
    if (!understood) {
      this.log('Setup cancelled.')
      return {platform, selection: null, tools: currentStatus, overallStatus: deriveOverallStatus(currentStatus)}
    }

    // ---------------------------------------------------------------------------
    // FR-004: Selection menu
    // ---------------------------------------------------------------------------
    const selectionValue = await select({
      message: 'What would you like to set up?',
      choices: [
        {name: 'Both AWS and Git credentials (recommended)', value: 'both'},
        {name: 'AWS credentials only (aws-vault)', value: 'aws'},
        {name: 'Git credentials only (macOS Keychain / GCM)', value: 'git'},
      ],
    })

    /** @type {'aws'|'git'|'both'} */
    const selection = /** @type {any} */ (selectionValue)

    // ---------------------------------------------------------------------------
    // GPG key prompt (Linux/WSL2 + AWS selected)
    // ---------------------------------------------------------------------------
    let gpgId = ''
    if (platform !== 'macos' && (selection === 'aws' || selection === 'both')) {
      const existingKeys = await listGpgKeys()

      if (existingKeys.length > 0) {
        const choices = [
          ...existingKeys.map((k) => ({
            name: `${k.name} <${k.email}> (${k.id})`,
            value: k.id,
          })),
          {name: 'Create a new GPG key', value: '__new__'},
        ]
        const chosen = await select({
          message: 'Select a GPG key for pass and Git Credential Manager:',
          choices,
        })
        if (chosen !== '__new__') gpgId = /** @type {string} */ (chosen)
      }
      // If no keys or user chose __new__, gpgId stays '' and the create-gpg-key step will run interactively
    }

    // ---------------------------------------------------------------------------
    // Build steps
    // ---------------------------------------------------------------------------
    const steps = buildSteps(platformInfo, selection, {gpgId})

    /** @type {SetupSession} */
    const session = {
      platform,
      selection,
      steps,
      results: new Map(),
      overallStatus: 'in-progress',
    }

    this.log('')

    // ---------------------------------------------------------------------------
    // Step execution loop
    // ---------------------------------------------------------------------------
    for (const step of steps) {
      this.log(formatStepHeader(step))

      // FR-014: confirmation prompt before system-level changes
      if (step.requiresConfirmation) {
        const proceed = await confirm({message: `Proceed with: ${step.label}?`, default: true})
        if (!proceed) {
          session.results.set(step.id, {status: 'skipped', message: 'Skipped by user'})
          this.log(chalk.dim('  Skipped.'))
          continue
        }
      }

      // Special handling for GPG interactive steps (FR-010)
      if (step.gpgInteractive && !gpgId) {
        this.log(chalk.cyan('\n  GPG will now prompt you for a passphrase in your terminal.'))
        this.log(chalk.dim('  Follow the interactive prompts to complete key generation.\n'))
        try {
          await execa('gpg', ['--full-generate-key'], {stdio: 'inherit', reject: true})
          // Refresh the gpgId from newly created key
          const newKeys = await listGpgKeys()
          if (newKeys.length > 0) {
            gpgId = newKeys[0].id
            // gpgId is now set — subsequent step closures capture it via the shared context object
          }
          session.results.set(step.id, {status: 'success', message: `GPG key created (${gpgId || 'new key'})`})
          this.log(chalk.green('  ✔ GPG key created'))
        } catch {
          const result = {status: /** @type {'failed'} */ ('failed'), hint: 'Run manually: gpg --full-generate-key'}
          session.results.set(step.id, result)
          this.log(chalk.red('  ✗ GPG key creation failed'))
          this.log(chalk.dim(`  → ${result.hint}`))
          session.overallStatus = 'failed'
          break
        }
        continue
      }

      // Regular step with spinner
      const stepSpinner = ora({spinner: 'arc', color: false, text: chalk.dim(step.label)}).start()

      let result
      try {
        result = await step.run()
      } catch (err) {
        result = {
          status: /** @type {'failed'} */ ('failed'),
          hint: err instanceof Error ? err.message : String(err),
        }
      }

      session.results.set(step.id, result)

      if (result.status === 'success') {
        stepSpinner.succeed(chalk.green(result.message ?? step.label))
      } else if (result.status === 'skipped') {
        stepSpinner.info(chalk.dim(result.message ?? 'Skipped'))
      } else {
        // Failed — FR-015: abort immediately
        stepSpinner.fail(chalk.red(`${step.label} — failed`))
        if (result.hint) this.log(chalk.dim(`  → ${result.hint}`))
        if (result.hintUrl) this.log(chalk.dim(`     ${result.hintUrl}`))
        session.overallStatus = 'failed'
        break
      }
    }

    // Determine final overall status
    if (session.overallStatus !== 'failed') {
      const anyFailed = [...session.results.values()].some((r) => r.status === 'failed')
      session.overallStatus = anyFailed ? 'failed' : 'completed'
    }

    // ---------------------------------------------------------------------------
    // FR-016: Completion summary
    // ---------------------------------------------------------------------------
    this.log(formatSecuritySummary(session, platformInfo))

    return {
      platform,
      selection,
      tools: currentStatus,
      overallStatus:
        session.overallStatus === 'completed'
          ? 'success'
          : session.overallStatus === 'failed'
            ? 'partial'
            : 'not-configured',
    }
  }
}

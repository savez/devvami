import {Command, Flags} from '@oclif/core'
import ora from 'ora'
import chalk from 'chalk'
import {confirm} from '@inquirer/prompts'
import {detectPlatform} from '../../services/platform.js'
import {isChezmoiInstalled, getChezmoiConfig, buildSetupSteps} from '../../services/dotfiles.js'
import {formatDotfilesSetup} from '../../formatters/dotfiles.js'
import {DvmiError} from '../../utils/errors.js'

/** @import { DotfilesSetupResult, SetupStep, StepResult } from '../../types.js' */

export default class DotfilesSetup extends Command {
  static description = 'Interactive wizard to configure chezmoi with age encryption for dotfile management'

  static examples = ['<%= config.bin %> dotfiles setup', '<%= config.bin %> dotfiles setup --json']

  static enableJsonFlag = true

  static flags = {
    help: Flags.help({char: 'h'}),
  }

  async run() {
    const {flags} = await this.parse(DotfilesSetup)
    const isJson = flags.json

    // Non-interactive guard
    const isCI = process.env.CI === 'true'
    const isNonInteractive = !process.stdout.isTTY
    if ((isCI || isNonInteractive) && !isJson) {
      this.error(
        'This command requires an interactive terminal (TTY). Run with --json for a non-interactive status check.',
        {exit: 1},
      )
    }

    const platformInfo = await detectPlatform()
    const {platform} = platformInfo

    // --json branch: non-interactive setup attempt
    if (isJson) {
      const chezmoiInstalled = await isChezmoiInstalled()
      if (!chezmoiInstalled) {
        /** @type {DotfilesSetupResult} */
        return {
          platform,
          chezmoiInstalled: false,
          encryptionConfigured: false,
          sourceDir: null,
          publicKey: null,
          status: 'failed',
          message:
            platform === 'macos'
              ? 'chezmoi is not installed. Run `brew install chezmoi` or visit https://chezmoi.io/install'
              : 'chezmoi is not installed. Run `sh -c "$(curl -fsLS get.chezmoi.io)"` or visit https://chezmoi.io/install',
        }
      }

      const existingConfig = await getChezmoiConfig()
      const encryptionConfigured = existingConfig?.encryption?.tool === 'age' || !!existingConfig?.age?.identity

      /** @type {DotfilesSetupResult} */
      return {
        platform,
        chezmoiInstalled: true,
        encryptionConfigured,
        sourceDir: existingConfig?.sourceDir ?? existingConfig?.sourcePath ?? null,
        publicKey: null,
        status: 'success',
        message: encryptionConfigured ? 'Chezmoi configured with age encryption' : 'Chezmoi configured (no encryption)',
      }
    }

    // ---------------------------------------------------------------------------
    // Interactive mode
    // ---------------------------------------------------------------------------
    const preSpinner = ora({
      spinner: 'arc',
      color: false,
      text: chalk.hex('#FF6B2B')('Checking chezmoi status...'),
    }).start()
    const chezmoiInstalled = await isChezmoiInstalled()
    const existingConfig = await getChezmoiConfig()
    preSpinner.stop()

    if (!chezmoiInstalled) {
      const hint =
        platform === 'macos'
          ? 'Run `brew install chezmoi` or visit https://chezmoi.io/install'
          : 'Run `sh -c "$(curl -fsLS get.chezmoi.io)"` or visit https://chezmoi.io/install'
      throw new DvmiError('chezmoi is not installed', hint)
    }

    // Check existing config state
    const hasEncryption = existingConfig?.encryption?.tool === 'age' || !!existingConfig?.age?.identity
    if (existingConfig && hasEncryption) {
      this.log(chalk.green('  ✔ chezmoi is already configured with age encryption'))
      const reconfigure = await confirm({message: 'Reconfigure encryption (regenerate age key)?', default: false})
      if (!reconfigure) {
        const sourceDir = existingConfig?.sourceDir ?? existingConfig?.sourcePath ?? null
        this.log(chalk.dim('  Skipped. Existing encryption configuration kept.'))
        return {
          platform,
          chezmoiInstalled: true,
          encryptionConfigured: true,
          sourceDir,
          publicKey: null,
          status: 'skipped',
          message: 'Existing encryption configuration kept',
        }
      }
    } else if (existingConfig) {
      this.log(chalk.yellow('  chezmoi is initialised but encryption is not configured — adding age encryption'))
    }

    // Build and run steps
    const steps = buildSetupSteps(platform, {existingConfig})

    this.log('')

    let publicKey = null
    let sourceDir = null

    for (const step of steps) {
      const typeColor = {check: chalk.blue, install: chalk.yellow, configure: chalk.cyan, verify: chalk.green}
      const colorFn = typeColor[step.type] ?? chalk.white
      this.log(`  ${colorFn(`[${step.type}]`)}  ${step.label}`)

      if (step.requiresConfirmation) {
        const proceed = await confirm({message: `Proceed with: ${step.label}?`, default: true})
        if (!proceed) {
          this.log(chalk.dim('  Skipped.'))
          continue
        }
      }

      const stepSpinner = ora({spinner: 'arc', color: false, text: chalk.dim(step.label)}).start()
      let result
      try {
        result = await step.run()
      } catch (err) {
        result = {status: /** @type {'failed'} */ ('failed'), hint: err instanceof Error ? err.message : String(err)}
      }

      if (result.status === 'success') {
        stepSpinner.succeed(chalk.green(result.message ?? step.label))
        // Extract public key and source dir from relevant steps
        if (step.id === 'configure-encryption' && result.message) {
          const match = result.message.match(/\(public key: (age1[a-z0-9]+)/)
          if (match) publicKey = match[1]
        }
        if (step.id === 'init-chezmoi' && result.message) {
          const match = result.message.match(/Source dir: (.+)/)
          if (match) sourceDir = match[1]
        }
      } else if (result.status === 'skipped') {
        stepSpinner.info(chalk.dim(result.message ?? 'Skipped'))
      } else {
        stepSpinner.fail(chalk.red(`${step.label} — failed`))
        if (result.hint) this.log(chalk.dim(`  → ${result.hint}`))
        this.log(
          formatDotfilesSetup({
            platform,
            chezmoiInstalled: true,
            encryptionConfigured: false,
            sourceDir: null,
            publicKey: null,
            status: 'failed',
            message: result.hint,
          }),
        )
        return {
          platform,
          chezmoiInstalled: true,
          encryptionConfigured: false,
          sourceDir: null,
          publicKey: null,
          status: 'failed',
          message: result.hint,
        }
      }
    }

    // Get final config
    const finalConfig = await getChezmoiConfig()
    if (!sourceDir) {
      sourceDir = finalConfig?.sourceDir ?? finalConfig?.sourcePath ?? null
    }

    // Try to get public key from key file
    if (!publicKey) {
      try {
        const {homedir} = await import('node:os')
        const {join} = await import('node:path')
        const {readFile} = await import('node:fs/promises')
        const keyPath = join(homedir(), '.config', 'chezmoi', 'key.txt')
        const keyContent = await readFile(keyPath, 'utf8').catch(() => '')
        const match = keyContent.match(/# public key: (age1[a-z0-9]+)/i)
        if (match) publicKey = match[1]
      } catch {
        // ignore
      }
    }

    /** @type {DotfilesSetupResult} */
    const finalResult = {
      platform,
      chezmoiInstalled: true,
      encryptionConfigured: true,
      sourceDir,
      publicKey,
      status: 'success',
      message: 'Chezmoi configured with age encryption',
    }

    this.log(formatDotfilesSetup(finalResult))
    return finalResult
  }
}

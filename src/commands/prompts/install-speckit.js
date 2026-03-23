import { Command, Flags } from '@oclif/core'
import ora from 'ora'
import chalk from 'chalk'
import { confirm } from '@inquirer/prompts'
import { detectSpeckit, installSpeckit } from '../../services/speckit.js'
import { DvmiError } from '../../utils/errors.js'

export default class PromptsInstallSpeckit extends Command {
  static description = 'Initialise the speckit SDD structure (.specify/) in the current project'

  static examples = [
    '<%= config.bin %> prompts install-speckit',
    '<%= config.bin %> prompts install-speckit --force',
    '<%= config.bin %> prompts install-speckit --json',
  ]

  static enableJsonFlag = true

  static flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'Overwrite existing .specify/ without prompting',
      default: false,
    }),
    dir: Flags.string({
      description: 'Target project directory (defaults to current working directory)',
      default: process.cwd(),
    }),
  }

  async run() {
    const { flags } = await this.parse(PromptsInstallSpeckit)
    const isJson = flags.json
    const targetDir = flags.dir
    const sourceRoot = this.config.root

    // Detect existing installation
    const already = await detectSpeckit(targetDir)

    if (already && !flags.force) {
      if (isJson) {
        return { created: [], skipped: true, reason: 'already_installed' }
      }

      this.log(chalk.yellow(`\nSpeckit is already installed at ${chalk.white(`${targetDir}/.specify`)}`))

      let proceed
      try {
        proceed = await confirm({
          message: 'Reinitialise speckit? (existing files will be overwritten)',
          default: false,
        })
      } catch {
        proceed = false
      }

      if (!proceed) {
        this.log(chalk.dim('Skipped.'))
        return { created: [], skipped: true, reason: 'user_cancelled' }
      }
    }

    const spinner = isJson
      ? null
      : ora({
          spinner: 'arc',
          color: false,
          text: chalk.hex('#FF6B2B')('Installing speckit...'),
        }).start()

    let result
    try {
      result = await installSpeckit(targetDir, sourceRoot, { force: flags.force || already })
    } catch (err) {
      spinner?.fail()
      if (err instanceof DvmiError) {
        this.error(err.message, { exit: err.exitCode, suggestions: [err.hint] })
      }
      // Surface permission errors with an actionable hint
      const code = /** @type {{ code?: string }} */ (err).code
      if (code === 'EACCES' || code === 'EPERM') {
        this.error(`Permission denied writing to ${targetDir}`, {
          exit: 1,
          suggestions: ['Check directory permissions or run with elevated privileges'],
        })
      }
      throw err
    }

    spinner?.stop()

    if (isJson) {
      return { created: result.created, skipped: false }
    }

    this.log(chalk.green(`\n✓ Speckit initialised at ${chalk.white(`${targetDir}/.specify`)}\n`))
    for (const file of result.created) {
      this.log(chalk.dim(`  + ${file.replace(targetDir + '/', '')}`))
    }
    this.log('')

    return { created: result.created, skipped: false }
  }
}

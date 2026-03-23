import { Command, Args, Flags } from '@oclif/core'
import ora from 'ora'
import chalk from 'chalk'
import { select, confirm } from '@inquirer/prompts'
import { join } from 'node:path'
import { listPrompts, downloadPrompt } from '../../services/prompts.js'
import { loadConfig } from '../../services/config.js'
import { DvmiError } from '../../utils/errors.js'

/** @import { Prompt } from '../../types.js' */

const DEFAULT_PROMPTS_DIR = '.prompts'

export default class PromptsDownload extends Command {
  static description = 'Download a prompt from your personal repository to .prompts/'

  static examples = [
    '<%= config.bin %> prompts download',
    '<%= config.bin %> prompts download coding/refactor-prompt.md',
    '<%= config.bin %> prompts download coding/refactor-prompt.md --overwrite',
    '<%= config.bin %> prompts download --json',
  ]

  static enableJsonFlag = true

  static args = {
    path: Args.string({
      description: 'Relative path of the prompt in the repository (e.g. coding/refactor-prompt.md)',
      required: false,
    }),
  }

  static flags = {
    overwrite: Flags.boolean({
      description: 'Overwrite existing local file without prompting',
      default: false,
    }),
  }

  async run() {
    const { args, flags } = await this.parse(PromptsDownload)
    const isJson = flags.json

    // Determine local prompts directory from config or default to cwd/.prompts
    let config = {}
    try {
      config = await loadConfig()
    } catch {
      /* use defaults */
    }
    const localDir =
      process.env.DVMI_PROMPTS_DIR ?? config.promptsDir ?? join(process.cwd(), DEFAULT_PROMPTS_DIR)

    // Resolve path interactively if not provided (only in interactive mode)
    let relativePath = args.path
    if (!relativePath) {
      if (isJson) {
        this.error('Prompt path is required in --json mode', {
          exit: 1,
          suggestions: ['Run `dvmi prompts download <path> --json`'],
        })
      }

      const spinner = ora({
        spinner: 'arc',
        color: false,
        text: chalk.hex('#FF6B2B')('Fetching prompts...'),
      }).start()

      /** @type {Prompt[]} */
      let prompts
      try {
        prompts = await listPrompts()
      } catch (err) {
        spinner.fail()
        if (err instanceof DvmiError) {
          this.error(err.message, { exit: err.exitCode, suggestions: [err.hint] })
        }
        throw err
      }
      spinner.stop()

      if (prompts.length === 0) {
        this.log(chalk.yellow('No prompts found in the repository.'))
        return { downloaded: [], skipped: [] }
      }

      const choices = prompts.map((p) => ({
        name: `${p.path}  ${chalk.dim(p.title)}`,
        value: p.path,
      }))
      relativePath = await select({ message: 'Select a prompt to download:', choices })
    }

    // Attempt download (skips automatically if file exists and --overwrite not set)
    const spinner = isJson
      ? null
      : ora({
          spinner: 'arc',
          color: false,
          text: chalk.hex('#FF6B2B')(`Downloading ${relativePath}...`),
        }).start()

    let result
    try {
      result = await downloadPrompt(relativePath, localDir, { overwrite: flags.overwrite })
    } catch (err) {
      spinner?.fail()
      if (err instanceof DvmiError) {
        this.error(err.message, { exit: err.exitCode, suggestions: [err.hint] })
      }
      throw err
    }

    spinner?.stop()

    // Conflict: file exists and user didn't pass --overwrite → ask interactively
    if (result.skipped && !flags.overwrite && !isJson) {
      const shouldOverwrite = await confirm({
        message: chalk.yellow(`File already exists at ${result.path}. Overwrite?`),
        default: false,
      })
      if (shouldOverwrite) {
        try {
          result = await downloadPrompt(relativePath, localDir, { overwrite: true })
        } catch (err) {
          if (err instanceof DvmiError) {
            this.error(err.message, { exit: err.exitCode, suggestions: [err.hint] })
          }
          throw err
        }
      }
    }

    if (isJson) {
      return {
        downloaded: result.skipped ? [] : [result.path],
        skipped: result.skipped ? [result.path] : [],
      }
    }

    if (result.skipped) {
      this.log(chalk.dim(`Skipped (already exists): ${result.path}`))
      this.log(chalk.dim('  Run with --overwrite to replace it.'))
    } else {
      this.log(chalk.green(`✓ Downloaded: ${result.path}`))
    }

    return {
      downloaded: result.skipped ? [] : [result.path],
      skipped: result.skipped ? [result.path] : [],
    }
  }
}

import {Command, Flags} from '@oclif/core'
import ora from 'ora'
import chalk from 'chalk'
import {loadConfig} from '../../services/config.js'
import {isUvInstalled, isSpecifyInstalled, installSpecifyCli, runSpecifyInit} from '../../services/speckit.js'
import {DvmiError} from '../../utils/errors.js'

/**
 * Map from dvmi's `aiTool` config values to spec-kit's `--ai` flag values.
 * @type {Record<string, string>}
 */
const AI_TOOL_MAP = {
  opencode: 'opencode',
  copilot: 'copilot',
}

export default class PromptsInstallSpeckit extends Command {
  static description = 'Install spec-kit (specify-cli) and run `specify init` to set up Spec-Driven Development'

  static examples = [
    '<%= config.bin %> prompts install-speckit',
    '<%= config.bin %> prompts install-speckit --ai opencode',
    '<%= config.bin %> prompts install-speckit --force',
    '<%= config.bin %> prompts install-speckit --reinstall',
  ]

  static flags = {
    ai: Flags.string({
      description: 'AI agent to pass to `specify init --ai` (defaults to the aiTool set in `dvmi init`)',
      options: ['opencode', 'copilot', 'claude', 'gemini', 'cursor-agent', 'codex', 'windsurf', 'kiro-cli', 'amp'],
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'Pass --force to `specify init` (safe to run in a non-empty directory)',
      default: false,
    }),
    reinstall: Flags.boolean({
      description: 'Reinstall specify-cli even if it is already installed',
      default: false,
    }),
  }

  async run() {
    const {flags} = await this.parse(PromptsInstallSpeckit)

    // ── 1. Require uv ────────────────────────────────────────────────────────
    if (!(await isUvInstalled())) {
      this.error('uv is not installed — spec-kit requires the uv Python package manager', {
        exit: 1,
        suggestions: ['Install uv: https://docs.astral.sh/uv/getting-started/installation/'],
      })
    }

    // ── 2. Install specify-cli (skip if already present unless --reinstall) ──
    const alreadyInstalled = await isSpecifyInstalled()

    if (!alreadyInstalled || flags.reinstall) {
      const label = alreadyInstalled ? 'Reinstalling specify-cli...' : 'Installing specify-cli...'
      const spinner = ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')(label)}).start()

      try {
        await installSpecifyCli({force: flags.reinstall})
        spinner.succeed(chalk.green('specify-cli installed'))
      } catch (err) {
        spinner.fail()
        if (err instanceof DvmiError) {
          this.error(err.message, {exit: 1, suggestions: [err.hint]})
        }
        throw err
      }
    } else {
      this.log(chalk.dim('specify-cli already installed'))
    }

    // ── 3. Resolve --ai flag (flag > config > let specify prompt) ────────────
    let aiFlag = flags.ai
    if (!aiFlag) {
      const config = await loadConfig()
      aiFlag = config.aiTool ? (AI_TOOL_MAP[config.aiTool] ?? undefined) : undefined
    }

    // ── 4. Run `specify init --here` (interactive — inherits stdio) ──────────
    this.log('')
    this.log(chalk.bold('Running specify init — follow the prompts to set up your project:'))
    this.log('')

    try {
      await runSpecifyInit(process.cwd(), {ai: aiFlag, force: flags.force})
    } catch (err) {
      if (err instanceof DvmiError) {
        this.error(err.message, {exit: 1, suggestions: [err.hint]})
      }
      throw err
    }
  }
}

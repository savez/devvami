import { Command, Args, Flags } from '@oclif/core'
import ora from 'ora'
import chalk from 'chalk'
import { select, confirm } from '@inquirer/prompts'
import { join } from 'node:path'
import { readdir } from 'node:fs/promises'
import { resolveLocalPrompt, invokeTool, SUPPORTED_TOOLS } from '../../services/prompts.js'
import { loadConfig } from '../../services/config.js'
import { DvmiError } from '../../utils/errors.js'

/** @import { AITool } from '../../types.js' */

const DEFAULT_PROMPTS_DIR = '.prompts'

/**
 * Walk a directory recursively and collect `.md` file paths relative to `base`.
 * @param {string} dir
 * @param {string} base
 * @returns {Promise<string[]>}
 */
async function walkPrompts(dir, base) {
  /** @type {string[]} */
  const results = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const sub = await walkPrompts(full, base)
      results.push(...sub)
    } else if (entry.name.endsWith('.md')) {
      results.push(full.replace(base + '/', ''))
    }
  }
  return results
}

export default class PromptsRun extends Command {
  static description = 'Execute a local prompt with a configured AI tool'

  static examples = [
    '<%= config.bin %> prompts run',
    '<%= config.bin %> prompts run coding/refactor-prompt.md',
    '<%= config.bin %> prompts run coding/refactor-prompt.md --tool opencode',
    '<%= config.bin %> prompts run coding/refactor-prompt.md --json',
  ]

  static enableJsonFlag = true

  static args = {
    path: Args.string({
      description: 'Relative path of the local prompt (e.g. coding/refactor-prompt.md)',
      required: false,
    }),
  }

  static flags = {
    tool: Flags.string({
      char: 't',
      description: `AI tool to use (${Object.keys(SUPPORTED_TOOLS).join(', ')})`,
      options: Object.keys(SUPPORTED_TOOLS),
    }),
  }

  async run() {
    const { args, flags } = await this.parse(PromptsRun)
    const isJson = flags.json

    // Load config
    let config = {}
    try {
      config = await loadConfig()
    } catch {
      /* use defaults */
    }

    const localDir =
      process.env.DVMI_PROMPTS_DIR ?? config.promptsDir ?? join(process.cwd(), DEFAULT_PROMPTS_DIR)

    // Resolve tool: --tool flag > config.aiTool
    const toolName = /** @type {AITool | undefined} */ (flags.tool ?? config.aiTool)

    // In --json mode, output the invocation plan without spawning
    if (isJson) {
      if (!args.path) {
        this.error('Prompt path is required in --json mode', {
          exit: 1,
          suggestions: ['Run `dvmi prompts run <path> --json`'],
        })
      }

      if (!toolName) {
        this.error('No AI tool configured', {
          exit: 1,
          suggestions: ['Run `dvmi init` to configure your preferred AI tool, or pass --tool <name>'],
        })
      }

      if (!SUPPORTED_TOOLS[toolName]) {
        this.error(`Unknown tool: "${toolName}". Supported: ${Object.keys(SUPPORTED_TOOLS).join(', ')}`, {
          exit: 1,
        })
      }

      let prompt
      try {
        prompt = await resolveLocalPrompt(args.path, localDir)
      } catch (err) {
        if (err instanceof DvmiError) {
          this.error(err.message, { exit: err.exitCode, suggestions: [err.hint] })
        }
        throw err
      }

      const tool = SUPPORTED_TOOLS[toolName]
      const invocation = [tool.bin.join(' '), tool.promptFlag, '<prompt content>'].join(' ')
      return {
        tool: toolName,
        promptPath: args.path,
        invocation,
        preview: prompt.body.slice(0, 200),
      }
    }

    // --- Interactive mode ---

    // Resolve path interactively if not provided
    let relativePath = args.path
    if (!relativePath) {
      const localPaths = await walkPrompts(localDir, localDir)

      if (localPaths.length === 0) {
        this.error('No local prompts found', {
          exit: 1,
          suggestions: [`Run \`dvmi prompts download\` to download prompts to ${localDir}`],
        })
      }

      relativePath = await select({
        message: 'Select a local prompt to run:',
        choices: localPaths.map((p) => ({ name: p, value: p })),
      })
    }

    // Verify tool is configured
    if (!toolName) {
      this.error('No AI tool configured', {
        exit: 1,
        suggestions: ['Run `dvmi init` to configure your preferred AI tool, or pass --tool <name>'],
      })
    }

    // Load prompt
    const spinner = ora({
      spinner: 'arc',
      color: false,
      text: chalk.hex('#FF6B2B')('Loading prompt...'),
    }).start()

    let prompt
    try {
      prompt = await resolveLocalPrompt(relativePath, localDir)
      spinner.stop()
    } catch (err) {
      spinner.fail()
      if (err instanceof DvmiError) {
        this.error(err.message, { exit: err.exitCode, suggestions: [err.hint] })
      }
      throw err
    }

    this.log(chalk.bold(`\nRunning: ${chalk.hex('#FF9A5C')(prompt.title)}`))
    this.log(chalk.dim(`  Tool: ${toolName}`) + '\n')

    // Security: show a preview of the prompt content and ask for confirmation.
    // This protects against prompt injection from tampered local files (originally
    // downloaded from remote repositories). Skipped in CI/non-interactive environments.
    if (!process.env.CI && process.stdin.isTTY) {
      const preview = prompt.body.length > 500
        ? prompt.body.slice(0, 500) + chalk.dim('\n…[truncated]')
        : prompt.body
      this.log(chalk.yellow('Prompt preview:'))
      this.log(chalk.dim('─'.repeat(50)))
      this.log(chalk.dim(preview))
      this.log(chalk.dim('─'.repeat(50)) + '\n')
      const ok = await confirm({ message: `Run this prompt with ${toolName}?`, default: true })
      if (!ok) {
        this.log(chalk.dim('Aborted.'))
        return
      }
    }

    // Invoke tool
    try {
      await invokeTool(toolName, prompt.body)
    } catch (err) {
      if (err instanceof DvmiError) {
        this.error(err.message, { exit: err.exitCode, suggestions: [err.hint] })
      }
      throw err
    }
  }
}

import {Command, Flags} from '@oclif/core'
import ora from 'ora'
import chalk from 'chalk'
import {select} from '@inquirer/prompts'
import {listPrompts} from '../../services/prompts.js'
import {formatPromptTable, formatPromptBody} from '../../formatters/prompts.js'
import {DvmiError} from '../../utils/errors.js'

/** @import { Prompt } from '../../types.js' */

export default class PromptsList extends Command {
  static description = 'List prompts from your personal prompt repository'

  static examples = [
    '<%= config.bin %> prompts list',
    '<%= config.bin %> prompts list --filter refactor',
    '<%= config.bin %> prompts list --json',
  ]

  static enableJsonFlag = true

  static flags = {
    filter: Flags.string({
      char: 'f',
      description: 'Filter prompts by title, category, description, or tag (case-insensitive)',
    }),
  }

  async run() {
    const {flags} = await this.parse(PromptsList)
    const isJson = flags.json

    const spinner = isJson
      ? null
      : ora({
          spinner: 'arc',
          color: false,
          text: chalk.hex('#FF6B2B')('Fetching prompts...'),
        }).start()

    /** @type {Prompt[]} */
    let prompts
    try {
      prompts = await listPrompts()
    } catch (err) {
      spinner?.fail()
      if (err instanceof DvmiError) {
        this.error(err.message, {exit: err.exitCode, suggestions: [err.hint]})
      }
      throw err
    }

    spinner?.stop()

    // Apply filter
    const query = flags.filter?.toLowerCase()
    const filtered = query
      ? prompts.filter(
          (p) =>
            p.title.toLowerCase().includes(query) ||
            p.category?.toLowerCase().includes(query) ||
            p.description?.toLowerCase().includes(query) ||
            p.tags?.some((t) => t.toLowerCase().includes(query)),
        )
      : prompts

    if (isJson) {
      return {prompts: filtered, total: filtered.length}
    }

    if (filtered.length === 0) {
      const msg = query
        ? chalk.dim(`No prompts matching "${flags.filter}".`)
        : chalk.yellow('No prompts found in the repository.')
      this.log(msg)
      return {prompts: [], total: 0}
    }

    const filterInfo = query ? chalk.dim(`  —  filter: ${chalk.white(`"${flags.filter}"`)}`) : ''
    this.log(
      chalk.bold(`\nPrompts`) +
        filterInfo +
        chalk.dim(`  (${filtered.length}${filtered.length < prompts.length ? `/${prompts.length}` : ''})\n`),
    )
    this.log(formatPromptTable(filtered))
    this.log('')

    // Interactive selection to view full prompt content
    try {
      const choices = filtered.map((p) => ({name: p.title, value: p}))
      choices.push({name: chalk.dim('← Exit'), value: /** @type {Prompt} */ (null)})

      const selected = await select({
        message: 'Select a prompt to view its content (or Exit):',
        choices,
      })

      if (selected) {
        this.log('\n' + formatPromptBody(selected) + '\n')
      }
    } catch {
      // User pressed Ctrl+C — exit gracefully
    }

    return {prompts: filtered, total: filtered.length}
  }
}

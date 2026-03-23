import { Command, Args, Flags } from '@oclif/core'
import ora from 'ora'
import chalk from 'chalk'
import { select } from '@inquirer/prompts'
import { searchSkills } from '../../services/skills-sh.js'
import { fetchAwesomeEntries, AWESOME_CATEGORIES } from '../../services/awesome-copilot.js'
import { formatSkillTable, formatAwesomeTable } from '../../formatters/prompts.js'
import { DvmiError } from '../../utils/errors.js'

/** @import { Skill, AwesomeEntry } from '../../types.js' */

const VALID_SOURCES = ['skills', 'awesome']

export default class PromptsBrowse extends Command {
  static description = 'Browse prompts and skills from external sources (skills.sh, awesome-copilot)'

  static examples = [
    '<%= config.bin %> prompts browse skills --query refactor',
    '<%= config.bin %> prompts browse skills --query testing --json',
    '<%= config.bin %> prompts browse awesome',
    '<%= config.bin %> prompts browse awesome --category agents',
    '<%= config.bin %> prompts browse awesome --category instructions --json',
  ]

  static enableJsonFlag = true

  static args = {
    source: Args.string({
      description: `Source to browse: ${VALID_SOURCES.join(' | ')}`,
      required: true,
      options: VALID_SOURCES,
    }),
  }

  static flags = {
    query: Flags.string({
      char: 'q',
      description: 'Search query (only applies to skills source)',
    }),
    category: Flags.string({
      char: 'c',
      description: `awesome-copilot category (${AWESOME_CATEGORIES.join(', ')})`,
      default: 'instructions',
    }),
  }

  async run() {
    const { args, flags } = await this.parse(PromptsBrowse)
    const isJson = flags.json
    const source = args.source

    if (!VALID_SOURCES.includes(source)) {
      this.error(`Invalid source: "${source}". Must be one of: ${VALID_SOURCES.join(', ')}`, {
        exit: 1,
        suggestions: VALID_SOURCES.map((s) => `dvmi prompts browse ${s}`),
      })
    }

    const spinner = isJson
      ? null
      : ora({
          spinner: 'arc',
          color: false,
          text: chalk.hex('#FF6B2B')(
            source === 'skills' ? 'Searching skills.sh...' : `Fetching awesome-copilot (${flags.category})...`,
          ),
        }).start()

    if (source === 'skills') {
      if (!flags.query || flags.query.length < 2) {
        this.error('skills.sh requires a search query (min 2 characters)', {
          exit: 1,
          suggestions: ['dvmi prompts browse skills --query refactor'],
        })
      }

      /** @type {Skill[]} */
      let skills
      try {
        skills = await searchSkills(flags.query ?? '', 50)
      } catch (err) {
        spinner?.fail()
        if (err instanceof DvmiError) {
          this.error(err.message, { exit: err.exitCode, suggestions: [err.hint] })
        }
        throw err
      }

      spinner?.stop()

      if (isJson) {
        return { skills, total: skills.length }
      }

      this.log(
        chalk.bold('\nSkills') +
          (flags.query ? chalk.dim(`  —  query: "${flags.query}"`) : '') +
          chalk.dim(`  (${skills.length})\n`),
      )
      this.log(formatSkillTable(skills))

      return { skills, total: skills.length }
    }

    // source === 'awesome'
    const category = flags.category

    if (!AWESOME_CATEGORIES.includes(category)) {
      this.error(`Invalid category: "${category}". Valid: ${AWESOME_CATEGORIES.join(', ')}`, {
        exit: 1,
      })
    }

    /** @type {AwesomeEntry[]} */
    let entries
    try {
      entries = await fetchAwesomeEntries(category)
    } catch (err) {
      spinner?.fail()
      if (err instanceof DvmiError) {
        this.error(err.message, { exit: err.exitCode, suggestions: [err.hint] })
      }
      throw err
    }

    spinner?.stop()

    if (isJson) {
      return { entries, total: entries.length, category }
    }

    this.log(
      chalk.bold('\nAwesome Copilot') +
        chalk.dim(`  —  category: `) +
        chalk.hex('#4A9EFF')(category) +
        chalk.dim(`  (${entries.length})\n`),
    )
    this.log(formatAwesomeTable(entries, category))
    this.log('')

    if (entries.length > 0) {
      try {
        const choices = entries.map((e) => ({ name: `${e.name}  ${chalk.dim(e.url)}`, value: e }))
        choices.push({ name: chalk.dim('← Exit'), value: /** @type {AwesomeEntry} */ (null) })

        const selected = await select({
          message: 'Select an entry to view its URL (or Exit):',
          choices,
        })

        if (selected) {
          this.log(`\n${chalk.bold(selected.name)}\n${chalk.hex('#4A9EFF')(selected.url)}\n`)
          if (selected.description) {
            this.log(chalk.white(selected.description) + '\n')
          }
        }
      } catch {
        // User pressed Ctrl+C — exit gracefully
      }
    }

    return { entries, total: entries.length, category }
  }
}

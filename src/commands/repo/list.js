import { Command, Flags } from '@oclif/core'
import ora from 'ora'
import chalk from 'chalk'
import { listRepos } from '../../services/github.js'
import { loadConfig } from '../../services/config.js'
import { renderTable } from '../../formatters/table.js'

/**
 * @param {string} lang
 * @returns {string}
 */
function langColor(lang) {
  const map = {
    javascript: chalk.yellow,
    typescript: chalk.blue,
    python:     chalk.green,
    java:       chalk.red,
    go:         chalk.cyan,
    ruby:       chalk.magenta,
    rust:       chalk.hex('#CE422B'),
    kotlin:     chalk.hex('#7F52FF'),
    swift:      chalk.hex('#F05138'),
    php:        chalk.hex('#777BB4'),
    shell:      chalk.greenBright,
  }
  const fn = map[lang.toLowerCase()]
  return fn ? fn(lang) : chalk.dim(lang)
}

export default class RepoList extends Command {
  static description = 'Lista repository dell\'organizzazione'

  static examples = [
    '<%= config.bin %> repo list',
    '<%= config.bin %> repo list --language typescript',
    '<%= config.bin %> repo list --search "lambda"',
    '<%= config.bin %> repo list --topic microservice --search "api"',
    '<%= config.bin %> repo list --json',
  ]

  static enableJsonFlag = true

  static flags = {
    language: Flags.string({ description: 'Filtra per linguaggio' }),
    topic:    Flags.string({ description: 'Filtra per topic' }),
    search:   Flags.string({ char: 's', description: 'Cerca in nome e descrizione (case-insensitive)' }),
  }

  async run() {
    const { flags } = await this.parse(RepoList)
    const isJson = flags.json
    const config = await loadConfig()

    if (!config.org) {
      this.error('GitHub org not configured. Run `dvmi init` to set up your environment.')
    }

    const spinner = isJson ? null : ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Fetching repositories...') }).start()
    const repos = await listRepos(config.org, {
      language: flags.language,
      topic: flags.topic,
    })
    spinner?.stop()

    // Search filter (name + description)
    const searchQuery = flags.search?.toLowerCase()
    const filtered = searchQuery
      ? repos.filter((r) =>
          r.name.toLowerCase().includes(searchQuery) ||
          r.description.toLowerCase().includes(searchQuery),
        )
      : repos

    if (isJson) return { repositories: filtered, total: filtered.length }

    if (repos.length === 0) {
      this.log(chalk.yellow('No repositories found matching your filters.'))
      return { repositories: [], total: 0 }
    }

    if (filtered.length === 0) {
      this.log(chalk.dim(`No repositories matching "${flags.search}".`))
      return { repositories: [], total: 0 }
    }

    // Build filter info line
    const filterInfo = [
      flags.language && chalk.dim(`language: ${chalk.white(flags.language)}`),
      flags.topic    && chalk.dim(`topic: ${chalk.white(flags.topic)}`),
      flags.search   && chalk.dim(`search: ${chalk.white(`"${flags.search}"`)}`),
    ].filter(Boolean).join(chalk.dim('  ·  '))

    this.log(
      chalk.bold(`\nRepositories in ${config.org}`) +
      (filterInfo ? chalk.dim('  —  ') + filterInfo : '') +
      chalk.dim(`  (${filtered.length}${filtered.length < repos.length ? `/${repos.length}` : ''})`) +
      '\n',
    )

    this.log(renderTable(filtered, [
      { header: 'Name',        key: 'name',        width: 40 },
      { header: 'Language',    key: 'language',     width: 14, format: (v) => v || '—', colorize: (v) => v === '—' ? chalk.dim(v) : langColor(v) },
      { header: 'Last push',   key: 'pushedAt',     width: 12, format: (v) => {
        const d = new Date(String(v))
        return isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
      }},
      { header: 'Description', key: 'description',  width: 60, format: (v) => String(v || '—') },
    ]))

    this.log('')
    return { repositories: filtered, total: filtered.length }
  }
}

import { Command, Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import { searchCode } from '../services/github.js'
import { loadConfig } from '../services/config.js'
import { renderTable } from '../formatters/table.js'

export default class Search extends Command {
  static description = 'Cerca codice nei repository dell\'organizzazione'

  static examples = [
    '<%= config.bin %> search "getUserById"',
    '<%= config.bin %> search "TODO" --language typescript',
    '<%= config.bin %> search "config" --repo my-service --json',
  ]

  static enableJsonFlag = true

  static args = {
    term: Args.string({ description: 'Termine di ricerca', required: true }),
  }

  static flags = {
    language: Flags.string({ description: 'Filtra per linguaggio' }),
    repo: Flags.string({ description: 'Cerca in un repo specifico' }),
    limit: Flags.integer({ description: 'Max risultati', default: 20 }),
  }

  async run() {
    const { args, flags } = await this.parse(Search)
    const isJson = flags.json
    const config = await loadConfig()

    if (!config.org) {
      this.error('GitHub org not configured. Run `dvmi init` to set up your environment.')
    }

    const spinner = isJson ? null : ora(`Searching for "${args.term}"...`).start()
    const results = await searchCode(config.org, args.term, {
      language: flags.language,
      repo: flags.repo,
      limit: flags.limit,
    })
    spinner?.stop()

    if (isJson) return { results, total: results.length }

    if (results.length === 0) {
      this.log(chalk.yellow(`No results found for "${args.term}" in the organization.`))
      return { results: [], total: 0 }
    }

    this.log(chalk.bold(`\n${results.length} result(s) for "${args.term}":\n`))
    this.log(renderTable(results, [
      { header: 'Repo', key: 'repo', width: 25 },
      { header: 'File', key: 'file', width: 45 },
      { header: 'Match', key: 'match' },
    ]))

    return { results, total: results.length }
  }
}

import {Command, Args, Flags} from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import {loadConfig} from '../../services/config.js'
import {searchDocs, detectCurrentRepo} from '../../services/docs.js'
import {renderTable} from '../../formatters/table.js'

const MAX_MATCHES_PER_FILE = 3

export default class DocsSearch extends Command {
  static description = 'Cerca testo nella documentazione del repository'

  static examples = [
    '<%= config.bin %> docs search "authentication"',
    '<%= config.bin %> docs search "deploy" --repo my-service',
    '<%= config.bin %> docs search "endpoint" --json',
  ]

  static enableJsonFlag = true

  static args = {
    term: Args.string({description: 'Termine di ricerca (case-insensitive)', required: true}),
  }

  static flags = {
    repo: Flags.string({char: 'r', description: 'Nome del repository (default: repo nella directory corrente)'}),
  }

  async run() {
    const {args, flags} = await this.parse(DocsSearch)
    const isJson = flags.json
    const config = await loadConfig()

    // Resolve owner/repo
    let owner, repo
    if (flags.repo) {
      owner = config.org
      if (!owner) this.error('GitHub org not configured. Run `dvmi init` to set up your environment.')
      repo = flags.repo
    } else {
      try {
        ;({owner, repo} = await detectCurrentRepo())
      } catch (err) {
        this.error(/** @type {Error} */ (err).message)
      }
    }

    const spinner = isJson
      ? null
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')(`Searching "${args.term}" in docs...`)}).start()
    let matches
    try {
      matches = await searchDocs(owner, repo, args.term)
    } catch (err) {
      spinner?.stop()
      this.error(/** @type {Error} */ (err).message)
    }
    spinner?.stop()

    if (isJson) return {repo, owner, term: args.term, matches, total: matches.length}

    if (matches.length === 0) {
      this.log(chalk.dim(`No matches found for "${args.term}" in ${owner}/${repo} documentation.`))
      return {repo, owner, term: args.term, matches: [], total: 0}
    }

    this.log(
      chalk.bold(`\nSearch results for "${args.term}" in ${owner}/${repo}`) +
        chalk.dim(` (${matches.length} match${matches.length === 1 ? '' : 'es'})\n`),
    )

    // Group by file and limit rows
    /** @type {Map<string, import('../../types.js').SearchMatch[]>} */
    const byFile = new Map()
    for (const m of matches) {
      const list = byFile.get(m.file) ?? []
      list.push(m)
      byFile.set(m.file, list)
    }

    /** @type {Array<import('../../types.js').SearchMatch & { _extra?: string }>} */
    const rows = []
    for (const [, fileMatches] of byFile) {
      const shown = fileMatches.slice(0, MAX_MATCHES_PER_FILE)
      rows.push(...shown)
      const extra = fileMatches.length - shown.length
      if (extra > 0) {
        rows.push({file: '', line: 0, context: chalk.dim(`(+${extra} more in this file)`), occurrences: 0})
      }
    }

    const q = args.term.toLowerCase()
    this.log(
      renderTable(rows, [
        {header: 'File', key: 'file', width: 35},
        {header: 'Line', key: 'line', width: 5, format: (v) => (Number(v) === 0 ? '' : String(v))},
        {
          header: 'Context',
          key: 'context',
          width: 65,
          format: (v) => {
            const s = String(v)
            // highlight term
            const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
            return s.replace(re, (m) => chalk.yellow.bold(m))
          },
        },
        {header: 'Matches', key: 'occurrences', width: 8, format: (v) => (Number(v) === 0 ? '' : `${v}`)},
      ]),
    )
    this.log('')

    return {repo, owner, term: args.term, matches, total: matches.length}
  }
}

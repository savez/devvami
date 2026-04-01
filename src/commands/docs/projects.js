import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import {loadConfig} from '../../services/config.js'
import {listRepos} from '../../services/github.js'
import {listProjectsDocs} from '../../services/docs.js'
import {renderTable} from '../../formatters/table.js'

export default class DocsProjects extends Command {
  static description = "Mostra la documentazione disponibile per ogni repository dell'organizzazione"

  static examples = [
    '<%= config.bin %> docs projects',
    '<%= config.bin %> docs projects --search "service"',
    '<%= config.bin %> docs projects --json',
  ]

  static enableJsonFlag = true

  static flags = {
    search: Flags.string({char: 's', description: 'Filtra per nome repository (case-insensitive)'}),
  }

  async run() {
    const {flags} = await this.parse(DocsProjects)
    const isJson = flags.json
    const config = await loadConfig()

    if (!config.org) {
      this.error('GitHub org not configured. Run `dvmi init` to set up your environment.')
    }

    // 1. Fetch all repos
    const repoSpinner = isJson
      ? null
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Fetching repositories...')}).start()
    let repos
    try {
      repos = await listRepos(config.org)
    } catch (err) {
      repoSpinner?.stop()
      this.error(/** @type {Error} */ (err).message)
    }
    repoSpinner?.stop()

    if (repos.length === 0) {
      this.log(chalk.dim(`No repositories found in organization "${config.org}".`))
      return {org: config.org, projects: [], total: 0}
    }

    // 2. Filter by search
    const q = flags.search?.toLowerCase()
    const filteredRepos = q ? repos.filter((r) => r.name.toLowerCase().includes(q)) : repos

    if (filteredRepos.length === 0) {
      this.log(chalk.dim(`No repositories matching "${flags.search}" in ${config.org}.`))
      return {org: config.org, projects: [], total: 0}
    }

    // 3. Scan each repo for docs
    const scanSpinner = isJson
      ? null
      : ora({
          spinner: 'arc',
          color: false,
          text: chalk.hex('#FF6B2B')(`Scanning docs in ${filteredRepos.length} repositories...`),
        }).start()

    const repoNames = filteredRepos.map((r) => r.name)
    let projects
    try {
      projects = await listProjectsDocs(config.org, repoNames)
    } catch (err) {
      scanSpinner?.stop()
      this.error(/** @type {Error} */ (err).message)
    }
    scanSpinner?.stop()

    if (isJson) return {org: config.org, projects, total: projects.length}

    const filterInfo = q ? chalk.dim(`  —  search: ${chalk.white(`"${flags.search}"`)}`) : ''
    this.log(
      chalk.bold(`\nDocumentation overview for ${config.org}`) +
        filterInfo +
        chalk.dim(`  (${projects.length}${projects.length < repos.length ? `/${repos.length}` : ''})`) +
        '\n',
    )

    this.log(
      renderTable(projects, [
        {header: 'Repository', key: 'repo', width: 40},
        {
          header: 'README',
          key: 'hasReadme',
          width: 8,
          format: (v) => (v ? '✓' : '—'),
          colorize: (v) => (v === '✓' ? chalk.green(v) : chalk.dim(v)),
        },
        {
          header: 'Docs',
          key: 'docsCount',
          width: 6,
          format: (v) => (Number(v) > 0 ? String(v) : '—'),
          colorize: (v) => (v !== '—' ? chalk.cyan(v) : chalk.dim(v)),
        },
        {
          header: 'Swagger',
          key: 'hasSwagger',
          width: 9,
          format: (v) => (v ? '✓' : '—'),
          colorize: (v) => (v === '✓' ? chalk.yellow(v) : chalk.dim(v)),
        },
        {
          header: 'AsyncAPI',
          key: 'hasAsyncApi',
          width: 10,
          format: (v) => (v ? '✓' : '—'),
          colorize: (v) => (v === '✓' ? chalk.green(v) : chalk.dim(v)),
        },
      ]),
    )
    this.log('')

    return {org: config.org, projects, total: projects.length}
  }
}

import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import {loadConfig} from '../../services/config.js'
import {listDocs, detectCurrentRepo} from '../../services/docs.js'
import {renderTable} from '../../formatters/table.js'

/**
 * @param {string} type
 * @returns {string}
 */
function typeColor(type) {
  if (type === 'readme') return chalk.cyan(type)
  if (type === 'swagger') return chalk.yellow(type)
  if (type === 'asyncapi') return chalk.green(type)
  return chalk.dim(type)
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${bytes}B`
}

export default class DocsList extends Command {
  static description = 'Lista i file di documentazione del repository'

  static examples = [
    '<%= config.bin %> docs list',
    '<%= config.bin %> docs list --repo my-service',
    '<%= config.bin %> docs list --search "arch"',
    '<%= config.bin %> docs list --json',
  ]

  static enableJsonFlag = true

  static flags = {
    repo: Flags.string({char: 'r', description: 'Nome del repository (default: repo nella directory corrente)'}),
    search: Flags.string({char: 's', description: 'Filtra per nome o percorso (case-insensitive)'}),
  }

  async run() {
    const {flags} = await this.parse(DocsList)
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
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Fetching documentation...')}).start()
    let entries
    try {
      entries = await listDocs(owner, repo)
    } catch (err) {
      spinner?.stop()
      this.error(/** @type {Error} */ (err).message)
    }
    spinner?.stop()

    // Search filter
    const q = flags.search?.toLowerCase()
    const filtered = q
      ? entries.filter((e) => e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q))
      : entries

    if (isJson) return {repo, owner, entries: filtered, total: filtered.length}

    if (entries.length === 0) {
      this.log(chalk.dim(`No documentation found in ${owner}/${repo}.`))
      return {repo, owner, entries: [], total: 0}
    }

    if (filtered.length === 0) {
      this.log(chalk.dim(`No documentation matching "${flags.search}" in ${owner}/${repo}.`))
      return {repo, owner, entries: [], total: 0}
    }

    const filterInfo = q ? chalk.dim(`  —  search: ${chalk.white(`"${flags.search}"`)}`) : ''
    this.log(
      chalk.bold(`\nDocumentation in ${owner}/${repo}`) +
        filterInfo +
        chalk.dim(`  (${filtered.length}${filtered.length < entries.length ? `/${entries.length}` : ''})`) +
        '\n',
    )

    this.log(
      renderTable(filtered, [
        {header: 'Type', key: 'type', width: 10, colorize: typeColor},
        {header: 'Name', key: 'name', width: 30},
        {header: 'Path', key: 'path', width: 50},
        {header: 'Size', key: 'size', width: 8, format: (v) => formatSize(Number(v))},
      ]),
    )
    this.log('')

    return {repo, owner, entries: filtered, total: filtered.length}
  }
}

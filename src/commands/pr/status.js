import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import { listMyPRs } from '../../services/github.js'
import { loadConfig } from '../../services/config.js'
import { renderTable, colorStatus } from '../../formatters/table.js'

export default class PRStatus extends Command {
  static description = 'Stato delle tue PR aperte (come autore e come reviewer)'

  static examples = [
    '<%= config.bin %> pr status',
    '<%= config.bin %> pr status --author',
    '<%= config.bin %> pr status --json',
  ]

  static enableJsonFlag = true

  static flags = {
    author: Flags.boolean({ description: 'Solo PR dove sei autore', default: false }),
    reviewer: Flags.boolean({ description: 'Solo PR dove sei reviewer', default: false }),
  }

  async run() {
    const { flags } = await this.parse(PRStatus)
    const isJson = flags.json
    const config = await loadConfig()

    if (!config.org) {
      this.error('GitHub org not configured. Run `dvmi init` to set up your environment.')
    }

    const spinner = isJson ? null : ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Fetching PRs...') }).start()
    const { authored, reviewing } = await listMyPRs(config.org)
    spinner?.stop()

    const showAuthored = !flags.reviewer || flags.author
    const showReviewing = !flags.author || flags.reviewer

    if (isJson) {
      return {
        authored: showAuthored ? authored : [],
        reviewing: showReviewing ? reviewing : [],
      }
    }

    if (showAuthored && authored.length > 0) {
      this.log(chalk.bold('\nYOUR PRS:'))
      this.log(renderTable(authored, [
        { header: 'Repo', key: 'headBranch', width: 30, format: (v) => String(v).split('/')[0] },
        { header: 'Title', key: 'title', width: 40 },
        { header: 'CI', key: 'ciStatus', width: 10, format: (v) => colorStatus(String(v)) },
        { header: 'Review', key: 'reviewStatus', width: 20, format: (v) => colorStatus(String(v)) },
      ]))
    } else if (showAuthored) {
      this.log(chalk.dim('No authored PRs found.'))
    }

    if (showReviewing && reviewing.length > 0) {
      this.log(chalk.bold('\nREVIEW REQUESTED:'))
      this.log(renderTable(reviewing, [
        { header: 'Title', key: 'title', width: 40 },
        { header: 'Author', key: 'author', width: 20 },
        { header: 'CI', key: 'ciStatus', width: 10, format: (v) => colorStatus(String(v)) },
      ]))
    }

    return { authored, reviewing }
  }
}

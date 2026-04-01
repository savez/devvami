import {Command} from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import {listMyPRs} from '../../services/github.js'
import {loadConfig} from '../../services/config.js'
import {renderTable, colorStatus} from '../../formatters/table.js'

export default class PRReview extends Command {
  static description = 'Lista PR assegnate a te per la code review'

  static examples = ['<%= config.bin %> pr review', '<%= config.bin %> pr review --json']

  static enableJsonFlag = true

  async run() {
    const {flags} = await this.parse(PRReview)
    const isJson = flags.json
    const config = await loadConfig()

    if (!config.org) {
      this.error("GitHub org non configurata. Esegui `dvmi init` per configurare l'ambiente.")
    }

    const spinner = isJson
      ? null
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Caricamento PR in review...')}).start()
    const {reviewing} = await listMyPRs(config.org)
    spinner?.stop()

    if (isJson) return {reviewing}

    if (reviewing.length === 0) {
      this.log(chalk.dim('Nessuna PR assegnata per review.'))
      return {reviewing}
    }

    this.log(chalk.bold(`\nPR ASSEGNATE PER REVIEW (${reviewing.length}):`))
    this.log(
      renderTable(reviewing, [
        {header: '#', key: 'number', width: 6},
        {header: 'Titolo', key: 'title', width: 45},
        {header: 'Autore', key: 'author', width: 20},
        {header: 'Branch', key: 'headBranch', width: 30},
        {header: 'CI', key: 'ciStatus', width: 10, format: (v) => colorStatus(String(v))},
      ]),
    )

    return {reviewing}
  }
}

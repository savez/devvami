import { Command } from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import { checkForUpdate } from '../services/version-check.js'
import { exec } from '../services/shell.js'

export default class Upgrade extends Command {
  static description = 'Aggiorna la CLI all\'ultima versione disponibile'

  static examples = [
    '<%= config.bin %> upgrade',
    '<%= config.bin %> upgrade --json',
  ]

  static enableJsonFlag = true

  async run() {
    const { flags } = await this.parse(Upgrade)
    const isJson = flags.json

    const spinner = isJson ? null : ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Checking for updates...') }).start()
    const { hasUpdate, current, latest } = await checkForUpdate({ force: true })
    spinner?.stop()

    // Guard against malformed version strings from the GitHub Releases API
    if (latest && !/^v?\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(latest)) {
      this.error(`Invalid version received from releases API: "${latest}" — update aborted`)
    }

    if (!hasUpdate) {
      const msg = `You're already on the latest version (${current})`
      if (isJson) return { currentVersion: current, latestVersion: latest, updated: false }
      this.log(chalk.green('✓') + ' ' + msg)
      return
    }

    if (!isJson) {
      this.log(`Updating from ${chalk.yellow(current)} to ${chalk.green(latest)}`)
    }

     const updateSpinner = isJson ? null : ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Installing update...') }).start()
     // Non passare --registry globale: verrebbe usato anche per le dipendenze.
     // ~/.npmrc ha già devvami:registry per il solo scope corretto.
     const result = await exec('npm', ['install', '-g', `devvami@${latest}`])
    if (result.exitCode !== 0) {
      updateSpinner?.fail('Update failed')
      this.error(`Update failed: ${result.stderr}`)
    }
    updateSpinner?.succeed(`Updated to ${latest}`)

    const response = { currentVersion: current, latestVersion: latest, updated: true }
    if (isJson) return response

    this.log(chalk.green('✓') + ` Successfully updated to ${latest}`)
    return response
  }
}

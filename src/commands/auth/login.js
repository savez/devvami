import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import { checkGitHubAuth, loginGitHub, checkAWSAuth, loginAWS } from '../../services/auth.js'
import { loadConfig } from '../../services/config.js'

export default class AuthLogin extends Command {
  static description = 'Autenticazione centralizzata GitHub + AWS'

  static examples = [
    '<%= config.bin %> auth login',
    '<%= config.bin %> auth login --github',
    '<%= config.bin %> auth login --aws',
  ]

  static enableJsonFlag = true

  static flags = {
    github: Flags.boolean({ description: 'Solo autenticazione GitHub', default: false }),
    aws: Flags.boolean({ description: 'Solo autenticazione AWS', default: false }),
    verbose: Flags.boolean({ description: 'Output dettagliato', default: false }),
  }

  async run() {
    const { flags } = await this.parse(AuthLogin)
    const isJson = flags.json
    const doGitHub = !flags.aws || flags.github
    const doAWS = !flags.github || flags.aws

    const result = { github: null, aws: null }

    // GitHub auth
    if (doGitHub) {
      const spinner = isJson ? null : ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Checking GitHub auth...') }).start()
      let ghStatus = await checkGitHubAuth()

      if (ghStatus.authenticated) {
        spinner?.succeed(`GitHub: already authenticated as @${ghStatus.username}`)
        result.github = { status: 'ok', username: ghStatus.username, org: '' }
      } else {
        if (spinner) spinner.text = 'Logging in to GitHub...'
        ghStatus = await loginGitHub()
        if (ghStatus.authenticated) {
          spinner?.succeed(`GitHub: authenticated as @${ghStatus.username}`)
          result.github = { status: 'ok', username: ghStatus.username, org: '' }
        } else {
          spinner?.fail('GitHub authentication failed')
          result.github = { status: 'error', error: ghStatus.error }
        }
      }
    }

    // AWS auth
    if (doAWS) {
      const config = await loadConfig()
      const spinner = isJson ? null : ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Checking AWS auth...') }).start()
      let awsStatus = await checkAWSAuth()

      if (awsStatus.authenticated) {
        spinner?.succeed(`AWS: session active for account ${awsStatus.account}`)
        result.aws = { status: 'ok', account: awsStatus.account, role: awsStatus.role }
      } else {
        if (spinner) spinner.text = 'Logging in to AWS via aws-vault...'
        awsStatus = await loginAWS(config.awsProfile || 'default')
        if (awsStatus.authenticated) {
          spinner?.succeed(`AWS: logged in to account ${awsStatus.account}`)
          result.aws = { status: 'ok', account: awsStatus.account, role: awsStatus.role }
        } else {
          spinner?.fail('AWS authentication failed')
          result.aws = { status: 'error', error: awsStatus.error }
        }
      }
    }

    if (isJson) return result

    this.log('\n' + chalk.green('Authentication complete'))
    if (result.github) {
      const icon = result.github.status === 'ok' ? chalk.green('✓') : chalk.red('✗')
      this.log(`  ${icon} GitHub: @${result.github.username ?? 'error'}`)
    }
    if (result.aws) {
      const icon = result.aws.status === 'ok' ? chalk.green('✓') : chalk.red('✗')
      this.log(`  ${icon} AWS: account ${result.aws.account ?? 'error'}`)
    }

    return result
  }
}

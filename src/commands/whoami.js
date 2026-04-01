import {Command} from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import {createOctokit} from '../services/github.js'
import {checkAWSAuth} from '../services/auth.js'
import {getCurrentVersion} from '../services/version-check.js'
import {CONFIG_PATH, loadConfig} from '../services/config.js'
import {getUser, isAuthenticated} from '../services/clickup.js'

export default class Whoami extends Command {
  static description = 'Mostra la tua identita su GitHub, AWS e ClickUp'

  static examples = ['<%= config.bin %> whoami', '<%= config.bin %> whoami --json']

  static enableJsonFlag = true

  async run() {
    const {flags} = await this.parse(Whoami)
    const isJson = flags.json

    const spinner = isJson
      ? null
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Fetching identity...')}).start()

    const [ghResult, awsResult, version, cuResult] = await Promise.allSettled([
      (async () => {
        const octokit = await createOctokit()
        const {data: user} = await octokit.rest.users.getAuthenticated()
        return {username: user.login, name: user.name ?? '', org: '', teams: []}
      })(),
      checkAWSAuth(),
      getCurrentVersion(),
      (async () => {
        if (!(await isAuthenticated())) return null
        const [user, config] = await Promise.all([getUser(), loadConfig()])
        return {username: user.username, teamName: config.clickup?.teamName ?? null}
      })(),
    ])

    spinner?.stop()

    const github = ghResult.status === 'fulfilled' ? ghResult.value : {username: null, error: '[NOT AUTHENTICATED]'}

    const aws =
      awsResult.status === 'fulfilled' && awsResult.value.authenticated
        ? {accountId: awsResult.value.account, role: awsResult.value.role}
        : {accountId: null, error: '[NOT AUTHENTICATED]'}

    const clickup =
      cuResult.status === 'fulfilled' && cuResult.value
        ? cuResult.value
        : {username: null, teamName: null, error: '[NOT AUTHENTICATED]'}

    const cli = {
      version: version.status === 'fulfilled' ? version.value : '?',
      configPath: CONFIG_PATH,
    }

    const result = {github, aws, clickup, cli}

    if (isJson) return result

    this.log(chalk.bold('\nGitHub'))
    this.log(`  User: ${github.username ? chalk.cyan('@' + github.username) : chalk.red('[NOT AUTHENTICATED]')}`)
    if (github.name) this.log(`  Name: ${github.name}`)

    this.log(chalk.bold('\nAWS'))
    this.log(`  Account: ${aws.accountId ?? chalk.red('[NOT AUTHENTICATED]')}`)
    if (aws.role) this.log(`  Role: ${aws.role}`)

    this.log(chalk.bold('\nClickUp'))
    this.log(`  User: ${clickup.username ? chalk.cyan(clickup.username) : chalk.red('[NOT AUTHENTICATED]')}`)
    if (clickup.teamName) this.log(`  Team: ${clickup.teamName}`)

    this.log(chalk.bold('\nCLI'))
    this.log(`  Version: ${cli.version}`)
    this.log(`  Config:  ${cli.configPath}`)

    return result
  }
}

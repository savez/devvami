import { Command, Args } from '@oclif/core'
import chalk from 'chalk'
import { exec } from '../services/shell.js'
import { openBrowser } from '../utils/open-browser.js'
import { loadConfig } from '../services/config.js'

const VALID_TARGETS = ['repo', 'pr', 'actions', 'aws']

export default class Open extends Command {
  static description = 'Apri risorse nel browser (repo, pr, actions, aws)'

  static examples = [
    '<%= config.bin %> open repo',
    '<%= config.bin %> open pr',
    '<%= config.bin %> open actions',
    '<%= config.bin %> open aws',
    '<%= config.bin %> open repo --json',
  ]

  static enableJsonFlag = true

  static args = {
    target: Args.string({ description: 'Target: repo, pr, actions, aws', required: true }),
  }

  async run() {
    const { args, flags } = await this.parse(Open)
    const isJson = flags.json

    if (!VALID_TARGETS.includes(args.target)) {
      this.error(`Invalid target "${args.target}". Allowed: ${VALID_TARGETS.join(', ')}`)
    }

    let url = ''

    if (args.target === 'aws') {
      const config = await loadConfig()
      const result = await exec('aws-vault', ['login', config.awsProfile, '--stdout'])
      if (result.exitCode !== 0) this.error('AWS login failed. Run `dvmi auth login --aws`')
      url = result.stdout
    } else {
      const remoteResult = await exec('git', ['remote', 'get-url', 'origin'])
      if (remoteResult.exitCode !== 0) this.error('Not in a Git repository.')
      const match = remoteResult.stdout.match(/github\.com[:/]([^/]+)\/([^/.]+?)(\.git)?$/)
      if (!match) this.error('Could not detect GitHub repository.')
      const [, owner, repo] = match
      const baseUrl = `https://github.com/${owner}/${repo}`

      if (args.target === 'repo') {
        url = baseUrl
      } else if (args.target === 'actions') {
        url = `${baseUrl}/actions`
      } else if (args.target === 'pr') {
        const branchResult = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
        const branch = branchResult.stdout
        // Try to find open PR for current branch
        const prResult = await exec('gh', ['pr', 'view', '--json', 'url', '-H', branch])
         if (prResult.exitCode === 0) {
           url = JSON.parse(prResult.stdout).url
         } else {
           this.error(`No PR found for branch "${branch}". Create one with \`dvmi pr create\``)
         }
      }
    }

    const result = { target: args.target, url, opened: !isJson }

    if (isJson) return result

    await openBrowser(url)
    this.log(chalk.green('✓') + ' Opened in browser')

    return result
  }
}

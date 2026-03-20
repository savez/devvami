import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import { listWorkflowRuns } from '../../services/github.js'
import { exec } from '../../services/shell.js'
import { renderTable, colorStatus } from '../../formatters/table.js'

export default class PipelineStatus extends Command {
  static description = 'Stato GitHub Actions per il repo corrente'

  static examples = [
    '<%= config.bin %> pipeline status',
    '<%= config.bin %> pipeline status --branch main',
    '<%= config.bin %> pipeline status --limit 20 --json',
  ]

  static enableJsonFlag = true

  static flags = {
    branch: Flags.string({ description: 'Filtra per branch' }),
    limit: Flags.integer({ description: 'Numero di run da mostrare', default: 10 }),
  }

  async run() {
    const { flags } = await this.parse(PipelineStatus)
    const isJson = flags.json

     // Detect repo from git remote
     const remoteResult = await exec('git', ['remote', 'get-url', 'origin'])
     if (remoteResult.exitCode !== 0) {
       this.error('Not in a Git repository. Navigate to a repo or use `dvmi repo list`')
     }
    const match = remoteResult.stdout.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
    if (!match) this.error('Could not detect GitHub repository.')
    const [, owner, repo] = match

    const spinner = isJson ? null : ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Fetching pipeline runs...') }).start()
    const runs = await listWorkflowRuns(owner, repo, {
      branch: flags.branch,
      limit: flags.limit,
    })
    spinner?.stop()

    if (isJson) return { runs }

    if (runs.length === 0) {
      this.log(chalk.dim('No workflow runs found.'))
      return { runs: [] }
    }

    this.log(chalk.bold('\nGitHub Actions runs:\n'))
    this.log(renderTable(runs, [
      { header: 'Status', key: 'conclusion', width: 10, format: (v) => colorStatus(v ? String(v) : 'pending') },
      { header: 'Workflow', key: 'name', width: 25 },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Duration', key: 'duration', width: 10, format: (v) => `${v}s` },
      { header: 'Actor', key: 'actor', width: 15 },
    ]))

    return { runs }
  }
}

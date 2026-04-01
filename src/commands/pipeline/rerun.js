import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import {confirm} from '@inquirer/prompts'
import {listWorkflowRuns, rerunWorkflow} from '../../services/github.js'
import {exec} from '../../services/shell.js'

export default class PipelineRerun extends Command {
  static description = "Rilancia l'ultimo workflow fallito"

  static examples = [
    '<%= config.bin %> pipeline rerun',
    '<%= config.bin %> pipeline rerun --failed-only',
    '<%= config.bin %> pipeline rerun --run-id 12345',
  ]

  static enableJsonFlag = true

  static flags = {
    'run-id': Flags.integer({description: 'ID specifico del run'}),
    'failed-only': Flags.boolean({description: 'Rilancia solo i job falliti', default: false}),
  }

  async run() {
    const {flags} = await this.parse(PipelineRerun)
    const isJson = flags.json

    const remoteResult = await exec('git', ['remote', 'get-url', 'origin'])
    if (remoteResult.exitCode !== 0) this.error('Not in a Git repository.')
    const match = remoteResult.stdout.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
    if (!match) this.error('Could not detect GitHub repository.')
    const [, owner, repo] = match

    let runId = flags['run-id']

    if (!runId) {
      const runs = await listWorkflowRuns(owner, repo, {limit: 10})
      const failed = runs.find((r) => r.conclusion === 'failure')
      if (!failed) {
        this.log(chalk.green('No failed runs found.'))
        return
      }
      runId = failed.id
      if (!isJson) {
        this.log(`Last failed run: ${chalk.bold(failed.name)} (#${failed.id}) on ${failed.branch}`)
      }
    }

    if (!isJson) {
      const ok = await confirm({message: `Rerun workflow #${runId}?`})
      if (!ok) {
        this.log('Aborted.')
        return
      }
    }

    const spinner = isJson
      ? null
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Relaunching workflow...')}).start()
    await rerunWorkflow(owner, repo, runId, flags['failed-only'])
    spinner?.succeed(`Workflow #${runId} rerun started`)

    const result = {rerun: {id: runId, failedOnly: flags['failed-only'], status: 'queued'}}

    if (!isJson) {
      this.log(chalk.dim('Track with `dvmi pipeline status`'))
    }

    return result
  }
}

import {Command, Args, Flags} from '@oclif/core'
import {exec} from '../../services/shell.js'

export default class PipelineLogs extends Command {
  static description = 'Log di un workflow run specifico'

  static examples = ['<%= config.bin %> pipeline logs 12345', '<%= config.bin %> pipeline logs 12345 --job test']

  static enableJsonFlag = true

  static args = {
    'run-id': Args.integer({description: 'ID del workflow run', required: true}),
  }

  static flags = {
    job: Flags.string({description: 'Filtra per job name'}),
  }

  async run() {
    const {args, flags} = await this.parse(PipelineLogs)
    const isJson = flags.json

    const ghArgs = ['run', 'view', String(args['run-id']), '--log']
    if (flags.job) ghArgs.push('--job', flags.job)

    const result = await exec('gh', ghArgs)
    if (result.exitCode !== 0) {
      this.error(`Run #${args['run-id']} not found or access denied.\n${result.stderr}`)
    }

    if (isJson) {
      return {runId: args['run-id'], log: result.stdout}
    }

    this.log(result.stdout)
    return {runId: args['run-id'], log: result.stdout}
  }
}

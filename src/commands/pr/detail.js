import {Command, Args, Flags} from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import {getPRDetail} from '../../services/github.js'
import {exec} from '../../services/shell.js'

export default class PRDetail extends Command {
  static description = 'Dettaglio PR con commenti QA e checklist degli step'

  static examples = [
    '<%= config.bin %> pr detail 42',
    '<%= config.bin %> pr detail 42 --repo devvami/my-api',
    '<%= config.bin %> pr detail 42 --json',
  ]

  static enableJsonFlag = true

  static args = {
    number: Args.integer({description: 'Numero della PR', required: true}),
  }

  static flags = {
    repo: Flags.string({description: 'Repository nel formato owner/repo (default: rilevato da git remote)'}),
  }

  async run() {
    const {args, flags} = await this.parse(PRDetail)
    const isJson = flags.json

    let owner, repo
    if (flags.repo) {
      const parts = flags.repo.split('/')
      if (parts.length !== 2) this.error('--repo deve essere nel formato owner/repo')
      ;[owner, repo] = parts
    } else {
      const repoUrl = await exec('git', ['remote', 'get-url', 'origin'])
      const match = repoUrl.stdout.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
      if (!match) this.error('Impossibile rilevare il repository GitHub dal git remote. Usa --repo owner/repo')
      ;[, owner, repo] = match
    }

    const spinner = isJson
      ? null
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Caricamento PR...')}).start()
    const detail = await getPRDetail(owner, repo, args.number)
    spinner?.stop()

    if (isJson) return detail

    this.log(chalk.bold(`\nPR #${detail.number}: ${detail.title}`))
    this.log(chalk.dim(`${detail.htmlUrl}\n`))

    const stateColor = detail.state === 'open' ? chalk.green : chalk.red
    this.log(`Stato:    ${stateColor(detail.state)}${detail.isDraft ? chalk.dim(' (draft)') : ''}`)
    this.log(`Autore:   ${detail.author}`)
    this.log(`Branch:   ${detail.headBranch} → ${detail.baseBranch}`)
    if (detail.labels.length) this.log(`Label:    ${detail.labels.join(', ')}`)
    if (detail.reviewers.length) this.log(`Reviewer: ${detail.reviewers.join(', ')}`)

    if (detail.qaSteps.length > 0) {
      this.log(chalk.bold('\n── QA Steps ─────────────────────'))
      for (const step of detail.qaSteps) {
        const icon = step.checked ? chalk.green('✓') : chalk.yellow('○')
        this.log(`  ${icon}  ${step.text}`)
      }
    }

    if (detail.qaComments.length > 0) {
      this.log(chalk.bold('\n── QA Comments ──────────────────'))
      for (const comment of detail.qaComments) {
        this.log(chalk.dim(`@${comment.author} [${comment.createdAt.slice(0, 10)}]:`))
        const lines = comment.body.split('\n').slice(0, 5)
        this.log(lines.map((l) => `  ${l}`).join('\n'))
        if (comment.body.split('\n').length > 5) this.log(chalk.dim('  ...'))
        this.log('')
      }
    }

    if (detail.qaComments.length === 0 && detail.qaSteps.length === 0) {
      this.log(chalk.dim('\nNessun commento o step QA trovato.'))
    }

    return detail
  }
}

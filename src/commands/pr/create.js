import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import {confirm, input} from '@inquirer/prompts'
import {createPR} from '../../services/github.js'
import {exec} from '../../services/shell.js'
import {readFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'

/**
 * @param {string} branchName
 * @returns {string}
 */
function titleFromBranch(branchName) {
  const [type, ...rest] = branchName.split('/')
  const desc = rest.join('/').replace(/-/g, ' ')
  const typeMap = {feature: 'Feature', fix: 'Fix', chore: 'Chore', hotfix: 'Hotfix'}
  return `${typeMap[type] ?? type}: ${desc}`
}

/**
 * @param {string} branchType
 * @returns {string[]}
 */
function labelFromType(branchType) {
  const map = {feature: ['feature'], fix: ['bug'], chore: ['chore'], hotfix: ['critical']}
  return map[branchType] ?? []
}

export default class PRCreate extends Command {
  static description = 'Apri Pull Request precompilata con template, label e reviewer'

  static examples = [
    '<%= config.bin %> pr create',
    '<%= config.bin %> pr create --draft',
    '<%= config.bin %> pr create --title "My PR" --dry-run',
  ]

  static enableJsonFlag = true

  static flags = {
    title: Flags.string({description: 'Titolo PR (default: auto-generated)'}),
    draft: Flags.boolean({description: 'Crea come draft', default: false}),
    'dry-run': Flags.boolean({description: 'Preview senza eseguire', default: false}),
  }

  async run() {
    const {flags} = await this.parse(PRCreate)
    const isJson = flags.json
    const isDryRun = flags['dry-run']
    // Get current branch
    const branchResult = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
    if (branchResult.exitCode !== 0) this.error('Not in a Git repository.')
    const branch = branchResult.stdout

    if (['main', 'master', 'develop'].includes(branch)) {
      this.error(`You're on the default branch "${branch}". Create a feature branch first with \`dvmi branch create\``)
    }

    // Check for commits
    const repoUrl = await exec('git', ['remote', 'get-url', 'origin'])
    const repoMatch = repoUrl.stdout.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
    if (!repoMatch) this.error('Could not detect GitHub repository from git remote.')
    const [, owner, repo] = repoMatch

    // Push branch if needed
    const pushSpinner = isJson
      ? null
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Pushing branch...')}).start()
    await exec('git', ['push', '-u', 'origin', branch])
    pushSpinner?.stop()

    // Get PR template
    let body = ''
    const templatePaths = ['.github/pull_request_template.md', '.github/PULL_REQUEST_TEMPLATE.md']
    for (const tp of templatePaths) {
      if (existsSync(tp)) {
        body = await readFile(tp, 'utf8')
        break
      }
    }

    // Generate title
    const autoTitle = titleFromBranch(branch)
    const title = flags.title ?? (isJson ? autoTitle : await input({message: 'PR title:', default: autoTitle}))
    const branchType = branch.split('/')[0]
    const labels = labelFromType(branchType)

    const preview = {branch, base: 'main', title, labels, draft: flags.draft}
    if (isDryRun) {
      if (isJson) return {pr: preview}
      this.log(chalk.bold('Dry run — would create PR:'))
      this.log(JSON.stringify(preview, null, 2))
      return {pr: preview}
    }

    if (!isJson) {
      const ok = await confirm({message: `Create PR "${title}"?`})
      if (!ok) {
        this.log('Aborted.')
        return
      }
    }

    const spinner = isJson
      ? null
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Creating PR...')}).start()
    const pr = await createPR({
      owner,
      repo,
      title,
      body,
      head: branch,
      base: 'main',
      draft: flags.draft,
      labels,
      reviewers: [],
    })
    spinner?.succeed(`PR created: ${pr.htmlUrl}`)

    const result = {pr: {number: pr.number, title, url: pr.htmlUrl, labels, draft: flags.draft}}

    if (isJson) return result
    this.log(chalk.green('✓') + ' ' + pr.htmlUrl)
    return result
  }
}

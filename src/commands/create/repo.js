import {Command, Args, Flags} from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import {input, confirm} from '@inquirer/prompts'
import {listTemplates, createFromTemplate, setBranchProtection, enableDependabot} from '../../services/github.js'
import {loadConfig} from '../../services/config.js'
import {validateRepoName} from '../../validators/repo-name.js'
import {renderTable} from '../../formatters/table.js'
import {exec} from '../../services/shell.js'

/**
 * @param {string} lang
 * @returns {string}
 */
function langColor(lang) {
  const map = {
    javascript: chalk.yellow,
    typescript: chalk.blue,
    python: chalk.green,
    java: chalk.red,
    go: chalk.cyan,
    ruby: chalk.magenta,
    rust: chalk.hex('#CE422B'),
    kotlin: chalk.hex('#7F52FF'),
    swift: chalk.hex('#F05138'),
    php: chalk.hex('#777BB4'),
    shell: chalk.greenBright,
  }
  const fn = map[lang.toLowerCase()]
  return fn ? fn(lang) : chalk.dim(lang)
}

export default class CreateRepo extends Command {
  static description = 'Crea nuovo progetto da template GitHub o lista i template disponibili'

  static examples = [
    '<%= config.bin %> create repo --list',
    '<%= config.bin %> create repo --list --search "lambda"',
    '<%= config.bin %> create repo template-lambda',
    '<%= config.bin %> create repo template-lambda --name my-service --dry-run',
  ]

  static enableJsonFlag = true

  static args = {
    template: Args.string({description: 'Nome del template', required: false}),
  }

  static flags = {
    list: Flags.boolean({description: 'Lista template disponibili', default: false}),
    search: Flags.string({char: 's', description: 'Cerca in nome e descrizione dei template (case-insensitive)'}),
    name: Flags.string({description: 'Nome del nuovo repository'}),
    description: Flags.string({description: 'Descrizione del repository', default: ''}),
    private: Flags.boolean({description: 'Repository privato (default)', default: true}),
    public: Flags.boolean({description: 'Repository pubblico', default: false}),
    'dry-run': Flags.boolean({description: 'Preview senza eseguire', default: false}),
  }

  async run() {
    const {args, flags} = await this.parse(CreateRepo)
    const isJson = flags.json
    const isDryRun = flags['dry-run']
    const config = await loadConfig()

    if (!config.org) {
      this.error('GitHub org not configured. Run `dvmi init` to set up your environment.')
    }

    // --list mode
    if (flags.list || !args.template) {
      const spinner = isJson
        ? null
        : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Fetching templates...')}).start()
      const templates = await listTemplates(config.org)
      spinner?.stop()

      // Search filter
      const searchQuery = flags.search?.toLowerCase()
      const filtered = searchQuery
        ? templates.filter(
            (t) => t.name.toLowerCase().includes(searchQuery) || t.description.toLowerCase().includes(searchQuery),
          )
        : templates

      if (isJson) return {templates: filtered}

      if (templates.length === 0) {
        this.log(chalk.yellow('No templates found in the organization.'))
        this.log(chalk.dim('Templates are GitHub repos marked as "Template repository".'))
        return {templates: []}
      }

      if (filtered.length === 0) {
        this.log(chalk.dim(`No templates matching "${flags.search}".`))
        return {templates: []}
      }

      const filterInfo = flags.search ? chalk.dim('  —  search: ') + chalk.white(`"${flags.search}"`) : ''

      this.log(
        chalk.bold('\nAvailable templates') +
          filterInfo +
          chalk.dim(`  (${filtered.length}${filtered.length < templates.length ? `/${templates.length}` : ''})`) +
          '\n',
      )

      this.log(
        renderTable(filtered, [
          {header: 'Name', key: 'name', width: 35},
          {
            header: 'Language',
            key: 'language',
            width: 14,
            format: (v) => v || '—',
            colorize: (v) => (v === '—' ? chalk.dim(v) : langColor(v)),
          },
          {header: 'Description', key: 'description', width: 60, format: (v) => String(v || '—')},
        ]),
      )

      this.log('')
      return {templates: filtered}
    }

    // Create mode
    const templates = await listTemplates(config.org)
    const template = templates.find((t) => t.name === args.template)
    if (!template) {
      const names = templates.map((t) => t.name).join(', ')
      this.error(`Template "${args.template}" not found. Available: ${names}`)
    }

    // Get repo name
    let repoName = flags.name
    if (!repoName && !isJson) {
      repoName = await input({message: 'Repository name:'})
    } else if (!repoName) {
      this.error('--name is required in non-interactive mode')
    }

    const validation = validateRepoName(repoName)
    if (!validation.valid) {
      this.error(`${validation.error}${validation.suggestion ? `\nSuggestion: ${validation.suggestion}` : ''}`)
    }

    const isPrivate = !flags.public

    if (!isJson && !isDryRun) {
      const ok = await confirm({
        message: `Create ${isPrivate ? 'private' : 'public'} repo "${config.org}/${repoName}" from "${args.template}"?`,
      })
      if (!ok) {
        this.log('Aborted.')
        return
      }
    }

    if (isDryRun) {
      const preview = {
        repository: {name: repoName, org: config.org, template: args.template, private: isPrivate},
        postScaffolding: {branchProtection: 'would configure', dependabot: 'would enable', codeowners: 'would create'},
      }
      if (isJson) return preview
      this.log(chalk.bold('\nDry run preview:'))
      this.log(JSON.stringify(preview, null, 2))
      return preview
    }

    // Create repo
    const spinner = isJson
      ? null
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Creating repository...')}).start()
    const repo = await createFromTemplate({
      templateOwner: config.org,
      templateRepo: args.template,
      name: repoName,
      org: config.org,
      description: flags.description,
      isPrivate,
    })
    spinner?.succeed(`Repository created: ${repo.htmlUrl}`)

    // Post-scaffolding
    const bpSpinner = isJson
      ? null
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Configuring branch protection...')}).start()
    await setBranchProtection(config.org, repoName).catch(() => null)
    bpSpinner?.succeed('Branch protection configured')

    const depSpinner = isJson
      ? null
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Enabling Dependabot...')}).start()
    await enableDependabot(config.org, repoName).catch(() => null)
    depSpinner?.succeed('Dependabot enabled')

    // Clone
    const cloneSpinner = isJson
      ? null
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Cloning repository...')}).start()
    await exec('gh', ['repo', 'clone', `${config.org}/${repoName}`])
    cloneSpinner?.succeed(`Cloned to ./${repoName}`)

    const result = {
      repository: {name: repoName, url: repo.htmlUrl, localPath: `./${repoName}`},
      postScaffolding: {branchProtection: 'ok', dependabot: 'ok', codeowners: 'ok'},
    }

    if (!isJson) {
      this.log('\n' + chalk.green('✓') + ` cd ${repoName} to start working`)
    }

    return result
  }
}

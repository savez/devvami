import {Command, Args, Flags} from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import {loadConfig} from '../../services/config.js'
import {listDocs, readFile, detectCurrentRepo, detectApiSpecType} from '../../services/docs.js'
import {renderMarkdown, extractMermaidBlocks, toMermaidLiveUrl} from '../../formatters/markdown.js'
import {parseOpenApi, parseAsyncApi} from '../../formatters/openapi.js'
import {renderTable} from '../../formatters/table.js'
import {openBrowser} from '../../utils/open-browser.js'

/**
 * @param {string} method
 * @returns {string}
 */
function methodColor(method) {
  const colors = {
    GET: chalk.cyan,
    POST: chalk.green,
    PUT: chalk.yellow,
    PATCH: chalk.magenta,
    DELETE: chalk.red,
    HEAD: chalk.dim,
    OPTIONS: chalk.dim,
  }
  const fn = colors[method]
  return fn ? fn(method) : method
}

/**
 * @param {string} op
 * @returns {string}
 */
function opColor(op) {
  if (op === 'publish' || op === 'send') return chalk.green(op)
  if (op === 'subscribe' || op === 'receive') return chalk.cyan(op)
  return chalk.dim(op)
}

export default class DocsRead extends Command {
  static description = 'Leggi un file di documentazione del repository nel terminale'

  static examples = [
    '<%= config.bin %> docs read',
    '<%= config.bin %> docs read --repo my-service',
    '<%= config.bin %> docs read docs/architecture.md',
    '<%= config.bin %> docs read openapi.yaml',
    '<%= config.bin %> docs read openapi.yaml --raw',
    '<%= config.bin %> docs read --render',
    '<%= config.bin %> docs read --json',
  ]

  static enableJsonFlag = true

  static args = {
    file: Args.string({description: 'Percorso del file da leggere (default: README)', required: false}),
  }

  static flags = {
    repo: Flags.string({char: 'r', description: 'Nome del repository (default: repo nella directory corrente)'}),
    raw: Flags.boolean({description: 'Mostra contenuto grezzo senza parsing speciale', default: false}),
    render: Flags.boolean({description: 'Apri i diagrammi Mermaid nel browser via mermaid.live', default: false}),
  }

  async run() {
    const {args, flags} = await this.parse(DocsRead)
    const isJson = flags.json
    const config = await loadConfig()

    // Resolve owner/repo
    let owner, repo
    if (flags.repo) {
      owner = config.org
      if (!owner) this.error('GitHub org not configured. Run `dvmi init` to set up your environment.')
      repo = flags.repo
    } else {
      try {
        ;({owner, repo} = await detectCurrentRepo())
      } catch (err) {
        this.error(/** @type {Error} */ (err).message)
      }
    }

    // Resolve file path
    let filePath = args.file
    if (!filePath) {
      const spinner = isJson
        ? null
        : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Looking for README...')}).start()
      let entries
      try {
        entries = await listDocs(owner, repo)
      } catch (err) {
        spinner?.stop()
        this.error(/** @type {Error} */ (err).message)
      }
      spinner?.stop()
      const readme = entries.find((e) => e.type === 'readme')
      if (!readme) {
        this.log(chalk.dim(`No README found in ${owner}/${repo}.`))
        return {repo, owner, path: null, type: null, content: null, size: 0}
      }
      filePath = readme.path
    }

    // Fetch content
    const spinner2 = isJson
      ? null
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')(`Reading ${filePath}...`)}).start()
    let content
    try {
      content = await readFile(owner, repo, filePath)
    } catch {
      spinner2?.stop()
      this.error(
        `File "${filePath}" not found in ${owner}/${repo}. Run \`dvmi docs list\` to see available documentation.`,
      )
    }
    spinner2?.stop()

    if (isJson) {
      return {
        repo,
        owner,
        path: filePath,
        type: detectApiSpecType(filePath, content) ?? 'doc',
        content,
        size: content.length,
      }
    }

    // Handle --render (Mermaid)
    if (flags.render) {
      const blocks = extractMermaidBlocks(content)
      if (blocks.length === 0) {
        this.log(chalk.dim('No Mermaid diagrams found in this document.'))
      } else {
        for (const block of blocks) {
          const url = toMermaidLiveUrl(block)
          await openBrowser(url)
          this.log(chalk.green('✓') + ` Opened Mermaid diagram in browser: ${url}`)
        }
      }
    }

    const specType = detectApiSpecType(filePath, content)

    // Render
    if (!flags.raw && specType === 'swagger') {
      const {endpoints, error} = parseOpenApi(content)
      if (error || endpoints.length === 0) {
        this.log(chalk.yellow(`⚠ Could not parse "${filePath}" as OpenAPI spec (showing raw content). ${error ?? ''}`))
        this.log(content)
      } else {
        this.log(chalk.bold(`\nAPI Endpoints — ${filePath}\n`))
        this.log(
          renderTable(endpoints, [
            {header: 'Method', key: 'method', width: 8, colorize: methodColor},
            {header: 'Path', key: 'path', width: 45},
            {header: 'Summary', key: 'summary', width: 40},
            {header: 'Parameters', key: 'parameters', width: 30, format: (v) => v || '—'},
          ]),
        )
        this.log('')
      }
    } else if (!flags.raw && specType === 'asyncapi') {
      const {channels, error} = parseAsyncApi(content)
      if (error || channels.length === 0) {
        this.log(chalk.yellow(`⚠ Could not parse "${filePath}" as AsyncAPI spec (showing raw content). ${error ?? ''}`))
        this.log(content)
      } else {
        this.log(chalk.bold(`\nAsyncAPI Channels — ${filePath}\n`))
        this.log(
          renderTable(channels, [
            {header: 'Channel', key: 'channel', width: 35},
            {header: 'Operation', key: 'operation', width: 12, colorize: opColor},
            {header: 'Summary', key: 'summary', width: 40},
            {header: 'Message', key: 'message', width: 25, format: (v) => v || '—'},
          ]),
        )
        this.log('')
      }
    } else {
      // Markdown or raw
      this.log(renderMarkdown(content))
    }

    return {repo, owner, path: filePath, type: specType ?? 'doc', content, size: content.length}
  }
}

import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import { getTasks, getTasksByList, isAuthenticated } from '../../services/clickup.js'
import { loadConfig } from '../../services/config.js'
import { renderTable } from '../../formatters/table.js'

export default class TasksAssigned extends Command {
  static description = 'Task ClickUp assegnati a te (alias di tasks list)'

  static examples = [
    '<%= config.bin %> tasks assigned',
    '<%= config.bin %> tasks assigned --status in_progress',
    '<%= config.bin %> tasks assigned --search "bug fix"',
    '<%= config.bin %> tasks assigned --list-id 12345',
    '<%= config.bin %> tasks assigned --json',
  ]

  static enableJsonFlag = true

  static flags = {
    status: Flags.string({ description: 'Filtra per status (open, in_progress, done)' }),
    search: Flags.string({
      char: 's',
      description: 'Cerca nel titolo del task (case-insensitive)',
    }),
    'list-id': Flags.string({
      description: "ID della lista ClickUp (visibile nell'URL della lista)",
    }),
  }

  async run() {
    const { flags } = await this.parse(TasksAssigned)
    const isJson = flags.json
    const config = await loadConfig()

    // Check auth
    if (!(await isAuthenticated())) {
      this.error('ClickUp not authenticated. Run `dvmi init` to configure ClickUp.')
    }

    // Ensure team ID is configured
    const teamId = config.clickup?.teamId
    if (!teamId && !flags['list-id']) {
      this.error('ClickUp team ID not configured. Run `dvmi init` to configure ClickUp.')
    }

    const spinner = isJson ? null : ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Fetching tasks...') }).start()

    /** @param {number} count */
    const onProgress = (count) => {
      if (spinner) spinner.text = chalk.hex('#FF6B2B')(`Fetching tasks... (${count})`)
    }

    let tasks
    if (flags['list-id']) {
      tasks = await getTasksByList(flags['list-id'], { status: flags.status }, onProgress).catch((err) => {
        spinner?.stop()
        this.error(err.message)
      })
    } else {
      tasks = await getTasks(/** @type {string} */ (teamId), { status: flags.status }, onProgress)
    }
    spinner?.stop()

    // Apply search filter
    const searchQuery = flags.search?.toLowerCase()
    const filtered = searchQuery
      ? tasks.filter((t) => t.name.toLowerCase().includes(searchQuery))
      : tasks

    if (isJson) return { tasks: filtered }

    if (tasks.length === 0) {
      this.log(chalk.dim('No tasks assigned to you.'))
      return { tasks: [] }
    }

    if (filtered.length === 0) {
      this.log(chalk.dim('No tasks matching filters.'))
      return { tasks: [] }
    }

    // Priority label + color
    const priorityLabel = (p) => ['', 'URGENT', 'HIGH', 'NORMAL', 'LOW'][p] ?? String(p)
    const priorityColor = (label) => {
      if (label === 'URGENT') return chalk.red.bold(label)
      if (label === 'HIGH')   return chalk.yellow(label)
      if (label === 'NORMAL') return chalk.white(label)
      if (label === 'LOW')    return chalk.dim(label)
      return label
    }

    // Status color
    const statusColor = (status) => {
      const s = status.toLowerCase()
      if (s.includes('done') || s.includes('complet') || s.includes('closed')) return chalk.green(status)
      if (s.includes('progress') || s.includes('active') || s.includes('open')) return chalk.cyan(status)
      if (s.includes('block') || s.includes('review') || s.includes('wait'))  return chalk.yellow(status)
      return chalk.dim(status)
    }

    // Summary header
    const filterInfo = [
      flags.status && chalk.dim(`status: ${chalk.white(flags.status)}`),
      flags.search && chalk.dim(`search: ${chalk.white(`"${flags.search}"`)}`),
      flags['list-id'] && chalk.dim(`list-id: ${chalk.white(flags['list-id'])}`),
    ].filter(Boolean).join(chalk.dim('  ·  '))

    this.log(
      chalk.bold('\nYour assigned tasks') +
      (filterInfo ? chalk.dim('  —  ') + filterInfo : '') +
      chalk.dim(`  (${filtered.length}${filtered.length < tasks.length ? `/${tasks.length}` : ''})`) +
      '\n',
    )

    this.log(renderTable(filtered, [
      { header: 'ID',          key: 'id',         width: 10 },
      { header: 'Link',        key: 'url',         width: 42, format: (v) => v ?? '—' },
      { header: 'Priority',    key: 'priority',    width: 8,  format: (v) => priorityLabel(Number(v)), colorize: priorityColor },
      { header: 'Status',      key: 'status',      width: 15, colorize: statusColor },
      { header: 'Due',         key: 'dueDate',     width: 12, format: (v) => v ?? '—' },
      { header: 'Lista',       key: 'listName',    width: 20, format: (v) => v ?? '—' },
      { header: 'Cartella',    key: 'folderName',  width: 20, format: (v) => v ?? '—' },
      { header: 'Description', key: 'name',        width: 55 },
    ]))

    this.log('')
    return { tasks: filtered }
  }
}

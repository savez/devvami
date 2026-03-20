import { Command } from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import { getTasksToday, isAuthenticated } from '../../services/clickup.js'
import { loadConfig } from '../../services/config.js'
import { renderTable } from '../../formatters/table.js'

/**
 * Return today's date as a local YYYY-MM-DD string.
 * @returns {string}
 */
function localTodayString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default class TasksToday extends Command {
  static description = 'Task in lavorazione oggi: data odierna nel range [startDate, dueDate]. Include task scaduti non conclusi.'

  static examples = [
    '<%= config.bin %> tasks today',
    '<%= config.bin %> tasks today --json',
  ]

  static enableJsonFlag = true

  async run() {
    const { flags } = await this.parse(TasksToday)
    const isJson = flags.json
    const config = await loadConfig()

    if (!(await isAuthenticated())) {
      this.error('ClickUp not authenticated. Run `dvmi init` to configure ClickUp.')
    }

    const teamId = config.clickup?.teamId
    if (!teamId) this.error('ClickUp team ID not configured. Run `dvmi init` to configure ClickUp.')

    const spinner = isJson ? null : ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Fetching today\'s tasks...') }).start()
    const tasks = await getTasksToday(teamId)
    spinner?.stop()

    if (isJson) return { tasks }

    if (tasks.length === 0) {
      this.log(chalk.dim('No tasks for today.'))
      this.log(chalk.dim('Check `dvmi tasks list` for all assigned tasks.'))
      return { tasks: [] }
    }

    const today = localTodayString()

    this.log(chalk.bold('\nToday\'s tasks:\n'))
    this.log(renderTable(tasks, [
      { header: 'Title', key: 'name', width: 45 },
      { header: 'Status', key: 'status', width: 15 },
      {
        header: 'Due',
        key: 'dueDate',
        width: 12,
        format: (v) => v ?? '—',
        colorize: (v) => {
          if (!v) return chalk.dim('—')
          if (v < today) return chalk.red.bold(v)
          return v
        },
      },
      { header: 'Link', key: 'url', format: (v) => v ?? '—' },
    ]))

    return { tasks }
  }
}

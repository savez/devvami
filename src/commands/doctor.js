import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import {typewriterLine} from '../utils/typewriter.js'
import {which, exec} from '../services/shell.js'
import {checkGitHubAuth, checkAWSAuth} from '../services/auth.js'
import {formatDoctorCheck, formatDoctorSummary} from '../formatters/status.js'

/** @import { DoctorCheck } from '../types.js' */

export default class Doctor extends Command {
  static description = 'Diagnostica ambiente di sviluppo'

  static examples = [
    '<%= config.bin %> doctor',
    '<%= config.bin %> doctor --json',
    '<%= config.bin %> doctor --verbose',
  ]

  static enableJsonFlag = true

  static flags = {
    verbose: Flags.boolean({description: 'Mostra dettagli aggiuntivi', default: false}),
  }

  async run() {
    const {flags} = await this.parse(Doctor)
    const isJson = flags.json

    const spinner = isJson
      ? null
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Running diagnostics...')}).start()

    /** @type {DoctorCheck[]} */
    const checks = []

    // Software checks
    const softwareChecks = [
      {name: 'Node.js', cmd: 'node', args: ['--version'], required: '>=24'},
      {name: 'nvm', cmd: 'nvm', args: ['--version'], required: null},
      {name: 'npm', cmd: 'npm', args: ['--version'], required: null},
      {name: 'Git', cmd: 'git', args: ['--version'], required: null},
      {name: 'gh CLI', cmd: 'gh', args: ['--version'], required: null},
      {name: 'Docker', cmd: 'docker', args: ['--version'], required: null},
      {name: 'AWS CLI', cmd: 'aws', args: ['--version'], required: null},
      {name: 'aws-vault', cmd: 'aws-vault', args: ['--version'], required: null},
    ]

    for (const check of softwareChecks) {
      const path = await which(check.cmd)
      if (!path) {
        checks.push({
          name: check.name,
          status: check.required ? 'fail' : 'warn',
          version: null,
          required: check.required,
          hint: `Install ${check.name}`,
        })
        continue
      }
      const result = await exec(check.cmd, check.args)
      const version = result.stdout.replace(/\n.*/s, '').trim()
      checks.push({
        name: check.name,
        status: 'ok',
        version,
        required: check.required,
        hint: null,
      })
    }

    // Auth checks
    const ghAuth = await checkGitHubAuth()
    checks.push({
      name: 'GitHub auth',
      status: ghAuth.authenticated ? 'ok' : 'fail',
      version: ghAuth.authenticated ? (ghAuth.username ?? null) : null,
      required: null,
      hint: ghAuth.authenticated ? null : 'Run `dvmi auth login`',
    })

    const awsAuth = await checkAWSAuth()
    checks.push({
      name: 'AWS auth',
      status: awsAuth.authenticated ? 'ok' : 'warn',
      version: awsAuth.authenticated ? (awsAuth.account ?? null) : null,
      required: null,
      hint: awsAuth.authenticated ? null : 'Run `dvmi auth login --aws`',
    })

    spinner?.stop()

    const summary = {
      ok: checks.filter((c) => c.status === 'ok').length,
      warn: checks.filter((c) => c.status === 'warn').length,
      fail: checks.filter((c) => c.status === 'fail').length,
    }

    if (isJson) return {checks, summary}

    await typewriterLine('Environment Diagnostics')
    for (const check of checks) {
      this.log('  ' + formatDoctorCheck(check))
    }
    this.log('\n' + formatDoctorSummary(summary))

    const issues = checks.filter((c) => c.status !== 'ok')
    if (issues.length > 0) {
      this.log('\n' + chalk.yellow('Issues found:'))
      for (const issue of issues) {
        if (issue.hint) this.log(`  → ${issue.hint}`)
      }
    }

    return {checks, summary}
  }
}

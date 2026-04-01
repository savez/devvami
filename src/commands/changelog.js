import {Command, Flags} from '@oclif/core'
import {writeFile} from 'node:fs/promises'
import {exec} from '../services/shell.js'

/**
 * Parse a conventional commit message.
 * @param {string} message
 * @returns {{ type: string, scope: string, description: string }|null}
 */
function parseConventionalCommit(message) {
  const match = message.match(/^(\w+)(?:\(([^)]+)\))?!?: (.+)/)
  if (!match) return null
  return {type: match[1], scope: match[2] ?? '', description: match[3]}
}

export default class Changelog extends Command {
  static description = 'Genera changelog da Conventional Commits'

  static examples = [
    '<%= config.bin %> changelog',
    '<%= config.bin %> changelog --from v1.0.0',
    '<%= config.bin %> changelog --output CHANGELOG.md',
  ]

  static enableJsonFlag = true

  static flags = {
    from: Flags.string({description: 'Tag o commit di partenza (default: ultimo tag)'}),
    to: Flags.string({description: 'Commit finale (default: HEAD)', default: 'HEAD'}),
    output: Flags.string({description: 'Scrivi su file (default: stdout)'}),
  }

  async run() {
    const {flags} = await this.parse(Changelog)
    const isJson = flags.json

    // Determine from ref
    let from = flags.from
    if (!from) {
      const tagResult = await exec('git', ['describe', '--tags', '--abbrev=0'])
      from = tagResult.exitCode === 0 ? tagResult.stdout : ''
    }

    // Get commits
    const range = from ? `${from}..${flags.to}` : flags.to
    const logResult = await exec('git', ['log', range, '--format=%s|%H'])
    if (logResult.exitCode !== 0) {
      this.error('Failed to read git log. Are you in a git repository?')
    }

    const lines = logResult.stdout.split('\n').filter(Boolean)

    /** @type {Record<string, Array<{ message: string, hash: string }>>} */
    const sections = {feat: [], fix: [], chore: [], docs: [], refactor: [], test: [], other: []}

    for (const line of lines) {
      const [message, hash] = line.split('|')
      const parsed = parseConventionalCommit(message)
      const type = parsed?.type ?? 'other'
      const entry = {message: message.trim(), hash: hash?.slice(0, 7) ?? ''}
      if (type in sections) {
        sections[type].push(entry)
      } else {
        sections.other.push(entry)
      }
    }

    if (isJson) return {from: from || 'beginning', to: flags.to, sections}

    // Build markdown
    const title = `## [Unreleased]${from ? ` (since ${from})` : ''}`
    const parts = [title, '']

    const sectionTitles = {
      feat: '### Features',
      fix: '### Bug Fixes',
      chore: '### Chores',
      docs: '### Documentation',
      refactor: '### Refactoring',
      test: '### Tests',
      other: '### Other',
    }

    for (const [type, entries] of Object.entries(sections)) {
      if (entries.length === 0) continue
      parts.push(sectionTitles[type])
      for (const e of entries) parts.push(`- ${e.message}`)
      parts.push('')
    }

    const output = parts.join('\n')

    if (flags.output) {
      await writeFile(flags.output, output, 'utf8')
      this.log(`Changelog written to ${flags.output}`)
    } else {
      this.log(output)
    }

    return {from: from || 'beginning', to: flags.to, sections}
  }
}

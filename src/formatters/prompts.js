import chalk from 'chalk'
import {marked} from 'marked'
import {renderTable} from './table.js'

/** @import { Prompt, Skill, AwesomeEntry } from '../types.js' */

/**
 * Format a list of prompts as a terminal table.
 * Columns: title, category, description.
 *
 * @param {Prompt[]} prompts
 * @returns {string}
 */
export function formatPromptTable(prompts) {
  if (prompts.length === 0) {
    return chalk.dim('No prompts found.')
  }

  return renderTable(/** @type {Record<string, unknown>[]} */ (prompts), [
    {
      header: 'Title',
      key: 'title',
      width: 36,
      colorize: (v) => chalk.hex('#FF9A5C')(v),
    },
    {
      header: 'Category',
      key: 'category',
      width: 16,
      format: (v) => v ?? '—',
      colorize: (v) => chalk.hex('#4A9EFF')(v),
    },
    {
      header: 'Description',
      key: 'description',
      width: 60,
      format: (v) => v ?? '—',
      colorize: (v) => chalk.white(v),
    },
  ])
}

/**
 * Format a single prompt's full content for display in the terminal.
 * Renders the title as a header and the body as plain text (markdown stripped).
 *
 * @param {Prompt} prompt
 * @returns {string}
 */
export function formatPromptBody(prompt) {
  const titleLine = chalk.bold.hex('#FF6B2B')(prompt.title)
  const divider = chalk.dim('─'.repeat(60))

  const meta = [
    prompt.category ? chalk.dim(`Category: `) + chalk.hex('#4A9EFF')(prompt.category) : null,
    prompt.description ? chalk.dim(`Description: `) + chalk.white(prompt.description) : null,
    prompt.tags?.length ? chalk.dim(`Tags: `) + chalk.hex('#4A9EFF')(prompt.tags.join(', ')) : null,
  ]
    .filter(Boolean)
    .join('\n')

  // Render markdown to plain terminal text by stripping HTML tags from marked output
  const rendered = marked(prompt.body, {async: false})
  const plain = String(rendered)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()

  const parts = [titleLine, divider]
  if (meta) parts.push(meta, divider)
  parts.push(plain)

  return parts.join('\n')
}

/**
 * Format a list of skills.sh skills as a terminal table.
 * Columns: name, installs, description.
 *
 * @param {Skill[]} skills
 * @returns {string}
 */
export function formatSkillTable(skills) {
  if (skills.length === 0) {
    return chalk.dim('No skills found.')
  }

  return renderTable(/** @type {Record<string, unknown>[]} */ (skills), [
    {
      header: 'Name',
      key: 'name',
      width: 36,
      colorize: (v) => chalk.hex('#FF9A5C')(v),
    },
    {
      header: 'Installs',
      key: 'installs',
      width: 10,
      format: (v) => (v != null ? String(v) : '—'),
      colorize: (v) => chalk.hex('#4A9EFF')(v),
    },
    {
      header: 'Description',
      key: 'description',
      width: 60,
      format: (v) => v ?? '—',
      colorize: (v) => chalk.white(v),
    },
  ])
}

/**
 * Format a list of awesome-copilot entries as a terminal table.
 * Columns: name, category, description.
 *
 * @param {AwesomeEntry[]} entries
 * @param {string} [category] - Active category label shown in the header
 * @returns {string}
 */
export function formatAwesomeTable(entries, category) {
  if (entries.length === 0) {
    return chalk.dim(category ? `No entries found for category "${category}".` : 'No entries found.')
  }

  return renderTable(/** @type {Record<string, unknown>[]} */ (entries), [
    {
      header: 'Name',
      key: 'name',
      width: 36,
      colorize: (v) => chalk.hex('#FF9A5C')(v),
    },
    {
      header: 'Category',
      key: 'category',
      width: 14,
      format: (v) => v ?? '—',
      colorize: (v) => chalk.hex('#4A9EFF')(v),
    },
    {
      header: 'Description',
      key: 'description',
      width: 58,
      format: (v) => v ?? '—',
      colorize: (v) => chalk.white(v),
    },
  ])
}

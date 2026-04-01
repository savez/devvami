import {createOctokit} from './github.js'
import {DvmiError} from '../utils/errors.js'

/** @import { AwesomeEntry } from '../types.js' */

/**
 * Supported categories in github/awesome-copilot.
 * Each maps to `docs/README.<category>.md` in the repository.
 * @type {string[]}
 */
export const AWESOME_CATEGORIES = ['agents', 'instructions', 'skills', 'plugins', 'hooks', 'workflows']

const AWESOME_REPO = {owner: 'github', repo: 'awesome-copilot'}

/**
 * Parse a GitHub-flavoured markdown table into AwesomeEntry objects.
 *
 * Expects at least two columns: `| Name/Link | Description |`
 * The first column may contain `[text](url)` markdown links; badge images
 * (e.g. `[![foo](img)](url)`) are stripped so only the text survives.
 *
 * @param {string} md - Raw markdown content of the file
 * @param {string} category - Category label attached to every returned entry
 * @returns {AwesomeEntry[]}
 */
export function parseMarkdownTable(md, category) {
  /** @type {AwesomeEntry[]} */
  const entries = []

  for (const line of md.split('\n')) {
    // Only process table data rows (start + end with |, not separator rows)
    const trimmed = line.trim()
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue
    if (/^\|[\s\-:|]+\|/.test(trimmed)) continue // header separator

    const cells = trimmed
      .slice(1, -1) // remove leading and trailing |
      .split('|')
      .map((c) => c.trim())

    if (cells.length < 2) continue

    const rawName = cells[0]
    const description = cells[1] ?? ''

    // Skip header row (first column is literally "Name" or similar)
    if (/^[\*_]?name[\*_]?$/i.test(rawName)) continue

    // Strip badge images: [![alt](img)](url) → keep nothing; [![alt](img)] → keep nothing
    const noBadge = rawName
      .replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .trim()

    // Extract [text](url) link
    const linkMatch = noBadge.match(/\[([^\]]+)\]\(([^)]+)\)/)
    const name = linkMatch ? linkMatch[1].trim() : noBadge.replace(/\[|\]/g, '').trim()
    const url = linkMatch ? linkMatch[2].trim() : ''

    if (!name) continue

    entries.push(
      /** @type {AwesomeEntry} */ ({
        name,
        description: description.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim(),
        url,
        category,
        source: 'awesome-copilot',
      }),
    )
  }

  return entries
}

/**
 * Fetch awesome-copilot entries for a given category from GitHub.
 *
 * Retrieves `docs/README.<category>.md` from the `github/awesome-copilot`
 * repository and parses the markdown table into AwesomeEntry objects.
 *
 * @param {string} category - One of {@link AWESOME_CATEGORIES}
 * @returns {Promise<AwesomeEntry[]>}
 * @throws {DvmiError} when category is invalid, file not found, or auth is missing
 */
export async function fetchAwesomeEntries(category) {
  if (!AWESOME_CATEGORIES.includes(category)) {
    throw new DvmiError(
      `Unknown awesome-copilot category: "${category}"`,
      `Valid categories: ${AWESOME_CATEGORIES.join(', ')}`,
    )
  }

  const octokit = await createOctokit()
  const path = `docs/README.${category}.md`

  let data
  try {
    const res = await octokit.rest.repos.getContent({
      owner: AWESOME_REPO.owner,
      repo: AWESOME_REPO.repo,
      path,
    })
    data = res.data
  } catch (err) {
    const status = /** @type {{ status?: number }} */ (err).status
    if (status === 404) {
      throw new DvmiError(
        `Category file not found: ${path}`,
        `Check available categories: ${AWESOME_CATEGORIES.join(', ')}`,
      )
    }
    throw err
  }

  const file = /** @type {{ content?: string, encoding?: string }} */ (data)
  if (!file.content || file.encoding !== 'base64') {
    throw new DvmiError(
      `Unable to read awesome-copilot category: ${category}`,
      'The file may be a directory or have an unsupported encoding',
    )
  }

  const md = Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8')
  return parseMarkdownTable(md, category)
}

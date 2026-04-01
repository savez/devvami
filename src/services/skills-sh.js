import {DvmiError} from '../utils/errors.js'

/** @import { Skill } from '../types.js' */

const SKILLS_SH_DEFAULT = 'https://skills.sh'

/**
 * Base URL for the skills.sh API.
 * Overridable via SKILLS_SH_BASE_URL env var (used in tests).
 * @returns {string}
 */
function skillsBaseUrl() {
  return process.env.SKILLS_SH_BASE_URL ?? SKILLS_SH_DEFAULT
}

/**
 * Search for skills on skills.sh.
 *
 * @param {string} query - Search query string (must be at least 2 characters)
 * @param {number} [limit=50] - Maximum number of results
 * @returns {Promise<Skill[]>}
 * @throws {DvmiError} when query is too short, the API is unreachable or returns an unexpected response
 */
export async function searchSkills(query, limit = 50) {
  if (!query || query.length < 2) {
    throw new DvmiError(
      'skills.sh requires a search query of at least 2 characters',
      'Use --query to search, e.g. dvmi prompts browse skills --query refactor',
    )
  }

  const url = new URL('/api/search', skillsBaseUrl())
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(limit))

  let res
  try {
    res = await fetch(url.toString())
  } catch {
    throw new DvmiError('Unable to reach skills.sh API', 'Check your internet connection and try again')
  }

  if (!res.ok) {
    throw new DvmiError(`skills.sh API returned ${res.status}`, 'Try again later or visit https://skills.sh')
  }

  /** @type {unknown} */
  let json
  try {
    json = await res.json()
  } catch {
    throw new DvmiError('Unexpected response from skills.sh', 'Try again later')
  }

  // skills.sh returns { skills: [...], count, ... } — also handle legacy { results: [...] } or plain array
  const items = Array.isArray(json)
    ? json
    : Array.isArray(/** @type {Record<string,unknown>} */ (json)?.skills)
      ? /** @type {Record<string,unknown>[]} */ (/** @type {Record<string,unknown>} */ (json).skills)
      : Array.isArray(/** @type {Record<string,unknown>} */ (json)?.results)
        ? /** @type {Record<string,unknown>[]} */ (/** @type {Record<string,unknown>} */ (json).results)
        : []

  return items.map((item) => {
    const s = /** @type {Record<string, unknown>} */ (item)
    return /** @type {Skill} */ ({
      id: String(s.id ?? s.slug ?? ''),
      name: String(s.name ?? s.title ?? ''),
      description: typeof s.description === 'string' ? s.description : undefined,
      installs: typeof s.installs === 'number' ? s.installs : undefined,
      url: typeof s.url === 'string' ? s.url : `https://skills.sh/skills/${s.id ?? s.slug ?? ''}`,
      source: 'skills.sh',
    })
  })
}

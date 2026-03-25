import { createOctokit } from './github.js'
import { exec } from './shell.js'
import { isOpenApi, isAsyncApi } from '../formatters/openapi.js'
import { load } from 'js-yaml'

/** @import { DocumentEntry, RepoDocsIndex, SearchMatch, DetectedRepo } from '../types.js' */

/**
 * Detect GitHub owner and repo from git remote in the current working directory.
 * @returns {Promise<DetectedRepo>}
 */
export async function detectCurrentRepo() {
  const result = await exec('git', ['remote', 'get-url', 'origin'])
  if (result.exitCode !== 0) {
    throw new Error('Not in a git repository. Use --repo to specify a repository.')
  }
  const match = result.stdout.match(/github\.com[:/]([^/]+)\/([^/.]+?)(\.git)?$/)
  if (!match) {
    throw new Error('Could not detect GitHub repository from git remote. Use --repo to specify a repository.')
  }
  return { owner: match[1], repo: match[2] }
}

/**
 * Classify a tree entry as a DocumentEntry, or null if it is not a doc file.
 * @param {{ path: string, size: number }} entry
 * @returns {DocumentEntry|null}
 */
function classifyEntry(entry) {
  const { size } = entry
  const path = entry.path
  if (size === 0) return null
  const name = path.split('/').pop() ?? path

  if (/^readme\.(md|rst|txt)$/i.test(path)) {
    return { name, path, type: 'readme', size }
  }
  if (/(openapi|swagger)\.(ya?ml|json)$/i.test(path)) {
    return { name, path, type: 'swagger', size }
  }
  if (/asyncapi\.(ya?ml|json)$/i.test(path)) {
    return { name, path, type: 'asyncapi', size }
  }
  if (path.startsWith('docs/') && /\.(md|rst|txt)$/.test(path)) {
    return { name, path, type: 'doc', size }
  }
  return null
}

/**
 * Sort DocumentEntry by type priority then path.
 * @param {DocumentEntry} a
 * @param {DocumentEntry} b
 * @returns {number}
 */
function sortEntries(a, b) {
  const order = { readme: 0, swagger: 1, asyncapi: 2, doc: 3 }
  const diff = order[a.type] - order[b.type]
  return diff !== 0 ? diff : a.path.localeCompare(b.path)
}

/**
 * List documentation files in a repository using the GitHub Tree API.
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<DocumentEntry[]>}
 */
export async function listDocs(owner, repo) {
  const octokit = await createOctokit()

  // 1. Get default branch
  const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
  const defaultBranch = repoData.default_branch

  // 2. Get HEAD SHA
  const { data: ref } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  })

  // 3. Fetch full recursive tree
  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: ref.object.sha,
    recursive: '1',
  })

  /** @type {DocumentEntry[]} */
  const entries = []
  for (const e of tree.tree) {
    if (e.type !== 'blob') continue
    const entry = classifyEntry({ path: e.path ?? '', size: e.size ?? 0 })
    if (entry) entries.push(entry)
  }
  return entries.sort(sortEntries)
}

/**
 * Read a file's raw content from a repository via GitHub Contents API.
 * @param {string} owner
 * @param {string} repo
 * @param {string} path
 * @returns {Promise<string>}
 */
export async function readFile(owner, repo, path) {
  const octokit = await createOctokit()
  const { data } = await octokit.rest.repos.getContent({ owner, repo, path })
  if (Array.isArray(data) || data.type !== 'file') {
    throw new Error(`"${path}" is not a file.`)
  }
  return Buffer.from(data.content, 'base64').toString('utf8')
}

/**
 * Search documentation files in a repository for a given term.
 * @param {string} owner
 * @param {string} repo
 * @param {string} term
 * @returns {Promise<SearchMatch[]>}
 */
export async function searchDocs(owner, repo, term) {
  const entries = await listDocs(owner, repo)
  const q = term.toLowerCase()

  /** @type {SearchMatch[]} */
  const allMatches = []

  for (const entry of entries) {
    let content
    try {
      content = await readFile(owner, repo, entry.path)
    } catch {
      continue
    }
    const lines = content.split('\n')
    let occurrences = 0
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        occurrences++
        allMatches.push({
          file: entry.path,
          line: i + 1,
          context: lines[i].trim(),
          occurrences: 0, // filled below
        })
      }
    }
    // Back-fill occurrences count for all matches from this file
    for (const m of allMatches) {
      if (m.file === entry.path) m.occurrences = occurrences
    }
  }

  return allMatches
}

/**
 * Build a RepoDocsIndex for every repository in an org.
 * @param {string} org
 * @param {string[]} repoNames - List of repo names to scan
 * @returns {Promise<RepoDocsIndex[]>}
 */
export async function listProjectsDocs(org, repoNames) {
  /** @type {RepoDocsIndex[]} */
  const indexes = []

  for (const repoName of repoNames) {
    let entries
    try {
      entries = await listDocs(org, repoName)
    } catch {
      entries = []
    }
    indexes.push({
      repo: repoName,
      hasReadme: entries.some((e) => e.type === 'readme'),
      docsCount: entries.filter((e) => e.type === 'doc').length,
      hasSwagger: entries.some((e) => e.type === 'swagger'),
      hasAsyncApi: entries.some((e) => e.type === 'asyncapi'),
      entries,
    })
  }

  return indexes
}

/**
 * Detect whether a file path is an API spec (swagger or asyncapi).
 * Returns the type or null.
 * @param {string} path
 * @param {string} content
 * @returns {'swagger'|'asyncapi'|null}
 */
export function detectApiSpecType(path, content) {
  if (/(openapi|swagger)\.(ya?ml|json)$/i.test(path)) return 'swagger'
  if (/asyncapi\.(ya?ml|json)$/i.test(path)) return 'asyncapi'
  // Try to detect from content
  try {
    const doc = /^\s*\{/.test(content.trim())
      ? JSON.parse(content)
      : load(content)
    if (doc && typeof doc === 'object') {
      if (isOpenApi(/** @type {Record<string, unknown>} */ (doc))) return 'swagger'
      if (isAsyncApi(/** @type {Record<string, unknown>} */ (doc))) return 'asyncapi'
    }
  } catch (err) {
    // File content is not valid YAML/JSON — not an API spec, return null.
    // Log at debug level for troubleshooting without exposing parse errors to users.
    if (process.env.DVMI_DEBUG) process.stderr.write(`[detectApiSpecType] parse failed: ${/** @type {Error} */ (err).message}\n`)
  }
  return null
}

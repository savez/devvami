import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { join, dirname, resolve, sep } from 'node:path'
import { execa } from 'execa'
import { createOctokit } from './github.js'
import { which } from './shell.js'
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter.js'
import { DvmiError } from '../utils/errors.js'

/** @import { Prompt, AITool } from '../types.js' */

/**
 * Supported AI tools and their invocation configuration.
 * @type {Record<AITool, { bin: string[], promptFlag: string }>}
 */
export const SUPPORTED_TOOLS = {
  opencode: { bin: ['opencode'], promptFlag: '--prompt' },
  copilot: { bin: ['gh', 'copilot'], promptFlag: '-p' },
}

/**
 * GitHub repository containing the personal prompt collection.
 * @type {{ owner: string, repo: string }}
 */
export const PROMPT_REPO = { owner: 'savez', repo: 'prompt-for-ai' }

/**
 * Default branch used when fetching the repository tree.
 * @type {string}
 */
const DEFAULT_BRANCH = 'HEAD'

/**
 * Known GitHub repository meta-files that should never appear as prompts.
 * Matched case-insensitively against the final path component.
 * @type {Set<string>}
 */
const EXCLUDED_FILENAMES = new Set([
  'readme.md',
  'contributing.md',
  'pull_request_template.md',
  'changelog.md',
  'license.md',
  'code_of_conduct.md',
  'security.md',
])

/**
 * Derive a human-readable title from a file path when no frontmatter title exists.
 * @param {string} filePath - Relative path, e.g. "coding/refactor-prompt.md"
 * @returns {string}
 */
function titleFromPath(filePath) {
  const filename = filePath.split('/').pop() ?? filePath
  return filename
    .replace(/\.md$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Derive the category (top-level directory) from a file path.
 * @param {string} filePath
 * @returns {string|undefined}
 */
function categoryFromPath(filePath) {
  const parts = filePath.split('/')
  return parts.length > 1 ? parts[0] : undefined
}

/**
 * Map raw GitHub file content (base64-encoded) to a Prompt object.
 * @param {string} path - Relative path in the repo
 * @param {string} base64Content - Base64-encoded file content from GitHub API
 * @returns {Prompt}
 */
function contentToPrompt(path, base64Content) {
  const raw = Buffer.from(base64Content, 'base64').toString('utf8')
  const { frontmatter, body } = parseFrontmatter(raw)
  return {
    path,
    title: typeof frontmatter.title === 'string' ? frontmatter.title : titleFromPath(path),
    category: typeof frontmatter.category === 'string' ? frontmatter.category : categoryFromPath(path),
    description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
    tags: Array.isArray(frontmatter.tags) ? /** @type {string[]} */ (frontmatter.tags) : [],
    body,
    author: typeof frontmatter.author === 'string' ? frontmatter.author : undefined,
    version: typeof frontmatter.version === 'string' ? String(frontmatter.version) : undefined,
  }
}

/**
 * List all prompts from the personal prompt repository.
 *
 * Fetches the full git tree (recursive) to find all `.md` files,
 * then fetches each file's content to parse frontmatter.
 *
 * @returns {Promise<Prompt[]>}
 * @throws {DvmiError} when GitHub authentication is missing or the repo is not found
 */
export async function listPrompts() {
  const octokit = await createOctokit()
  let tree
  try {
    const { data } = await octokit.rest.git.getTree({
      owner: PROMPT_REPO.owner,
      repo: PROMPT_REPO.repo,
      tree_sha: DEFAULT_BRANCH,
      recursive: '1',
    })
    tree = data.tree
  } catch (err) {
    const status = /** @type {{ status?: number }} */ (err).status
    if (status === 404) {
      throw new DvmiError(
        `Repository ${PROMPT_REPO.owner}/${PROMPT_REPO.repo} not found`,
        'Ensure the repository exists and you have access to it',
      )
    }
    throw err
  }

  const mdFiles = tree.filter(
    (item) =>
      item.type === 'blob' &&
      item.path?.endsWith('.md') &&
      !EXCLUDED_FILENAMES.has(item.path.split('/').pop()?.toLowerCase() ?? ''),
  )

  if (mdFiles.length === 0) {
    return []
  }

  const prompts = await Promise.all(
    mdFiles.map(async (item) => {
      const { data } = await octokit.rest.repos.getContent({
        owner: PROMPT_REPO.owner,
        repo: PROMPT_REPO.repo,
        path: item.path ?? '',
      })
      // getContent returns a single file object when path is a file
      const file = /** @type {{ content?: string, encoding?: string }} */ (data)
      if (!file.content || file.encoding !== 'base64') {
        return null
      }
      return contentToPrompt(item.path ?? '', file.content.replace(/\n/g, ''))
    }),
  )

  return /** @type {Prompt[]} */ (prompts.filter(Boolean))
}

/**
 * Fetch a single prompt by its relative path in the repository.
 *
 * @param {string} relativePath - Path relative to repo root (e.g. "coding/refactor-prompt.md")
 * @returns {Promise<Prompt>}
 * @throws {DvmiError} when the file is not found or authentication is missing
 */
export async function fetchPromptByPath(relativePath) {
  const octokit = await createOctokit()
  let data
  try {
    const res = await octokit.rest.repos.getContent({
      owner: PROMPT_REPO.owner,
      repo: PROMPT_REPO.repo,
      path: relativePath,
    })
    data = res.data
  } catch (err) {
    const status = /** @type {{ status?: number }} */ (err).status
    if (status === 404) {
      throw new DvmiError(
        `Prompt not found: ${relativePath}`,
        `Run \`dvmi prompts list\` to see available prompts`,
      )
    }
    throw err
  }

  const file = /** @type {{ content?: string, encoding?: string }} */ (data)
  if (!file.content || file.encoding !== 'base64') {
    throw new DvmiError(
      `Unable to read prompt: ${relativePath}`,
      'The file may be a directory or have an unsupported encoding',
    )
  }

  return contentToPrompt(relativePath, file.content.replace(/\n/g, ''))
}

/**
 * Download a prompt from the repository to a local directory.
 *
 * If the destination file already exists and `opts.overwrite` is not `true`,
 * the function returns immediately with `{ skipped: true }` without making
 * any network request.
 *
 * @param {string} relativePath - Path relative to repo root (e.g. "coding/refactor-prompt.md")
 * @param {string} localDir - Local base directory (e.g. "/project/.prompts")
 * @param {{ overwrite?: boolean }} [opts]
 * @returns {Promise<{ path: string, skipped: boolean }>}
 * @throws {DvmiError} when the prompt is not found or the write fails
 */
export async function downloadPrompt(relativePath, localDir, opts = {}) {
  const destPath = join(localDir, relativePath)

  // Prevent path traversal: destPath must remain within localDir
  const safeBase = resolve(localDir) + sep
  if (!resolve(destPath).startsWith(safeBase)) {
    throw new DvmiError(
      `Invalid prompt path: "${relativePath}"`,
      'Path must stay within the prompts directory',
    )
  }

  // Fast-path: skip without a network round-trip if file exists and no overwrite
  if (!opts.overwrite) {
    try {
      await access(destPath)
      return { path: destPath, skipped: true }
    } catch {
      // File does not exist — fall through to download
    }
  }

  const prompt = await fetchPromptByPath(relativePath)

  // Re-build frontmatter from the known Prompt fields
  /** @type {Record<string, unknown>} */
  const fm = {}
  if (prompt.title) fm.title = prompt.title
  if (prompt.category) fm.category = prompt.category
  if (prompt.description) fm.description = prompt.description
  if (prompt.tags?.length) fm.tags = prompt.tags
  if (prompt.author) fm.author = prompt.author
  if (prompt.version) fm.version = prompt.version

  const content = serializeFrontmatter(fm, prompt.body)

  await mkdir(dirname(destPath), { recursive: true, mode: 0o700 })
  await writeFile(destPath, content, { encoding: 'utf8', mode: 0o600 })

  return { path: destPath, skipped: false }
}

/**
 * Read and parse a prompt from the local prompt store.
 *
 * @param {string} relativePath - Prompt path relative to the local store root
 *   (e.g. "coding/refactor-prompt.md")
 * @param {string} localDir - Absolute path to the local prompts directory
 * @returns {Promise<import('../types.js').Prompt>}
 * @throws {DvmiError} when the file does not exist or cannot be parsed
 */
export async function resolveLocalPrompt(relativePath, localDir) {
  const fullPath = join(localDir, relativePath)

  // Prevent path traversal: fullPath must remain within localDir
  const safeBase = resolve(localDir) + sep
  if (!resolve(fullPath).startsWith(safeBase)) {
    throw new DvmiError(
      `Invalid prompt path: "${relativePath}"`,
      'Path must stay within the prompts directory',
    )
  }

  let raw
  try {
    raw = await readFile(fullPath, 'utf8')
  } catch {
    throw new DvmiError(
      `Local prompt not found: ${relativePath}`,
      `Run \`dvmi prompts download ${relativePath}\` to download it first`,
    )
  }

  const { frontmatter, body } = parseFrontmatter(raw)
  return {
    path: relativePath,
    title: typeof frontmatter.title === 'string' ? frontmatter.title : titleFromPath(relativePath),
    category: typeof frontmatter.category === 'string' ? frontmatter.category : categoryFromPath(relativePath),
    description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
    tags: Array.isArray(frontmatter.tags) ? /** @type {string[]} */ (frontmatter.tags) : [],
    body,
    author: typeof frontmatter.author === 'string' ? frontmatter.author : undefined,
    version: typeof frontmatter.version === 'string' ? String(frontmatter.version) : undefined,
  }
}

/**
 * Invoke a supported AI tool with the given prompt content.
 *
 * Verifies the tool binary is available in PATH before spawning.
 * Spawns with `stdio: 'inherit'` so the tool's UI is displayed directly.
 *
 * @param {AITool} toolName - Tool key from {@link SUPPORTED_TOOLS}
 * @param {string} promptContent - The full prompt text to pass to the tool
 * @returns {Promise<void>}
 * @throws {DvmiError} when the tool is unknown or the binary is not in PATH
 */
export async function invokeTool(toolName, promptContent) {
  const tool = SUPPORTED_TOOLS[toolName]
  if (!tool) {
    throw new DvmiError(
      `Unknown AI tool: "${toolName}"`,
      `Supported tools: ${Object.keys(SUPPORTED_TOOLS).join(', ')}`,
    )
  }

  // Verify binary availability
  const [bin, ...subArgs] = tool.bin
  const binPath = await which(bin)
  if (!binPath) {
    const installHints = {
      opencode: 'Install opencode: npm install -g opencode',
      copilot: 'Install GitHub CLI: https://cli.github.com',
    }
    throw new DvmiError(
      `${bin} is not installed or not in PATH`,
      installHints[toolName] ?? `Install ${bin} and ensure it is in your PATH`,
    )
  }

  // Spawn tool with prompt content — inherits stdio so TUI/interactive tools work
  await execa(bin, [...subArgs, tool.promptFlag, promptContent], { stdio: 'inherit' })
}

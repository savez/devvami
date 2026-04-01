import http from 'node:http'
import {randomBytes} from 'node:crypto'
import {openBrowser} from '../utils/open-browser.js'
import {loadConfig, saveConfig} from './config.js'

/** @import { ClickUpTask } from '../types.js' */

const API_BASE = process.env.CLICKUP_API_BASE ?? 'https://api.clickup.com/api/v2'
const TOKEN_KEY = 'clickup_token'

/**
 * Format a Date as a local YYYY-MM-DD string (avoids UTC offset issues).
 * @param {Date} date
 * @returns {string}
 */
function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Get stored ClickUp OAuth token.
 * Reads from (in order): CLICKUP_TOKEN env var, OS keychain, config file.
 * @returns {Promise<string|null>}
 */
async function getToken() {
  // Allow tests / CI to inject a token via environment variable
  if (process.env.CLICKUP_TOKEN) return process.env.CLICKUP_TOKEN
  try {
    const {default: keytar} = await import('keytar')
    return keytar.getPassword('devvami', TOKEN_KEY)
  } catch {
    // keytar not available (e.g. WSL2 without D-Bus) — fallback to config
    const config = await loadConfig()
    return config.clickup?.token ?? null
  }
}

/**
 * Store ClickUp token securely (works for both OAuth and Personal API Tokens).
 * @param {string} token
 * @returns {Promise<void>}
 */
export async function storeToken(token) {
  try {
    const {default: keytar} = await import('keytar')
    await keytar.setPassword('devvami', TOKEN_KEY, token)
  } catch {
    // Fallback: store in config (less secure)
    process.stderr.write(
      'Warning: keytar unavailable. ClickUp token will be stored in plaintext.\n' +
        'Run `dvmi auth logout` after this session on shared machines.\n',
    )
    const config = await loadConfig()
    await saveConfig({...config, clickup: {...config.clickup, token}})
  }
}

/**
 * Run the ClickUp OAuth localhost redirect flow.
 * @param {string} clientId
 * @param {string} clientSecret
 * @returns {Promise<string>} Access token
 */
export async function oauthFlow(clientId, clientSecret) {
  const csrfState = randomBytes(16).toString('hex')
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      if (!code) return
      if (!returnedState || returnedState !== csrfState) {
        res.writeHead(400)
        res.end('State mismatch — possible CSRF attack.')
        server.close()
        reject(new Error('OAuth state mismatch — possible CSRF attack'))
        return
      }
      res.end('Authorization successful! You can close this tab.')
      server.close()
      try {
        const resp = await fetch(`${API_BASE}/oauth/token`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({client_id: clientId, client_secret: clientSecret, code}),
        })
        const data = /** @type {any} */ (await resp.json())
        await storeToken(data.access_token)
        resolve(data.access_token)
      } catch (err) {
        reject(err)
      }
    })
    server.listen(0, async () => {
      const addr = /** @type {import('node:net').AddressInfo} */ (server.address())
      const callbackUrl = `http://localhost:${addr.port}/callback`
      const authUrl = `https://app.clickup.com/api?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${csrfState}`
      await openBrowser(authUrl)
    })
    server.on('error', reject)
  })
}

/**
 * Make an authenticated request to the ClickUp API.
 * Retries automatically on HTTP 429 (rate limit) up to MAX_RETRIES times.
 * @param {string} path
 * @param {number} [retries]
 * @returns {Promise<unknown>}
 */
async function clickupFetch(path, retries = 0) {
  const MAX_RETRIES = 5
  const token = await getToken()
  if (!token) throw new Error('ClickUp not authenticated. Run `dvmi init` to authorize.')
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: {Authorization: token},
  })
  if (resp.status === 429) {
    if (retries >= MAX_RETRIES) {
      throw new Error(`ClickUp API rate limit exceeded after ${MAX_RETRIES} retries. Try again later.`)
    }
    const reset = Number(resp.headers.get('X-RateLimit-Reset') ?? Date.now() + 1000)
    await new Promise((r) => setTimeout(r, Math.max(reset - Date.now(), 1000)))
    return clickupFetch(path, retries + 1)
  }
  if (!resp.ok) {
    const body = /** @type {any} */ (await resp.json().catch(() => ({})))
    throw new Error(`ClickUp API ${resp.status}: ${body.err ?? resp.statusText}`)
  }
  return resp.json()
}

/**
 * Get ClickUp user info (used to get user ID for filtering tasks).
 * @returns {Promise<{ id: string, username: string }>}
 */
export async function getUser() {
  const data = /** @type {any} */ (await clickupFetch('/user'))
  return {id: String(data.user.id), username: data.user.username}
}

/**
 * Map a raw ClickUp API task object to the normalized ClickUpTask shape.
 * @param {any} t - Raw task object from the ClickUp API response
 * @returns {ClickUpTask}
 */
function mapTask(t) {
  const folderHidden = t.folder?.hidden === true
  return {
    id: t.id,
    name: t.name,
    status: t.status?.status ?? '',
    statusType: t.status?.type ?? 'open',
    priority: t.priority?.id ? Number(t.priority.id) : 3,
    startDate: t.start_date ? localDateString(new Date(Number(t.start_date))) : null,
    dueDate: t.due_date ? localDateString(new Date(Number(t.due_date))) : null,
    url: t.url,
    assignees: (t.assignees ?? []).map((a) => a.username),
    listId: t.list?.id ?? null,
    listName: t.list?.name ?? null,
    folderId: folderHidden ? null : (t.folder?.id ?? null),
    folderName: folderHidden ? null : (t.folder?.name ?? null),
  }
}

/**
 * Get tasks assigned to the current user, with automatic pagination.
 * @param {string} teamId - ClickUp workspace/team ID
 * @param {{ status?: string, due_date_lt?: number }} [filters]
 * @param {((count: number) => void)} [onProgress] - Called after each page with cumulative task count
 * @returns {Promise<ClickUpTask[]>}
 */
export async function getTasks(teamId, filters = {}, onProgress) {
  let basePath = `/team/${teamId}/task?assignees[]=${(await getUser()).id}`
  if (filters.status) basePath += `&statuses[]=${encodeURIComponent(filters.status)}`
  if (filters.due_date_lt != null) basePath += `&due_date_lt=${filters.due_date_lt}`

  let page = 0
  /** @type {ClickUpTask[]} */
  const allTasks = []
  let hasMore = true

  while (hasMore) {
    const data = /** @type {any} */ (await clickupFetch(`${basePath}&page=${page}`))
    allTasks.push(...data.tasks.map(mapTask))
    hasMore = data.has_more ?? false
    page++
    if (onProgress) onProgress(allTasks.length)
  }

  return allTasks
}

/**
 * Get tasks active today: runs two parallel requests (due today/overdue + in progress)
 * and deduplicates by task ID. Excludes tasks whose status type is 'closed'.
 * @param {string} teamId
 * @returns {Promise<ClickUpTask[]>}
 */
export async function getTasksToday(teamId) {
  const endOfTodayMs = new Date().setHours(23, 59, 59, 999)

  const [overdueTasks, inProgressTasks] = await Promise.all([
    getTasks(teamId, {due_date_lt: endOfTodayMs}),
    getTasks(teamId, {status: 'in progress'}),
  ])

  // De-duplicate by task ID (a task may appear in both result sets)
  /** @type {Map<string, ClickUpTask>} */
  const seen = new Map()
  for (const t of [...overdueTasks, ...inProgressTasks]) seen.set(t.id, t)
  const merged = [...seen.values()]

  const today = localDateString(new Date())

  return merged.filter((t) => {
    // Exclude tasks that ClickUp considers closed (done/completed regardless of language)
    if (t.statusType === 'closed') return false

    const start = t.startDate
    const due = t.dueDate

    // Always include overdue tasks (due date in the past, not closed)
    if (due && due < today) return true

    // today is within [startDate, dueDate]
    if (start && due) return start <= today && today <= due
    if (start && !due) return start <= today
    // No startDate: include only if due today (overdue already handled above)
    if (!start && due) return today === due

    // No dates at all: fall back to in-progress status keyword
    const status = t.status?.toLowerCase().replace(/_/g, ' ') ?? ''
    return status.includes('in progress')
  })
}

/**
 * Get tasks from a specific ClickUp list, with automatic pagination.
 * @param {string} listId - ClickUp list ID
 * @param {{ status?: string }} [filters]
 * @param {((count: number) => void)} [onProgress] - Called after each page with cumulative task count
 * @returns {Promise<ClickUpTask[]>}
 * @throws {Error} If the list is not found or not accessible (404)
 */
export async function getTasksByList(listId, filters = {}, onProgress) {
  let basePath = `/list/${listId}/task?include_closed=false`
  if (filters.status) basePath += `&statuses[]=${encodeURIComponent(filters.status)}`

  let page = 0
  /** @type {ClickUpTask[]} */
  const allTasks = []
  let hasMore = true

  while (hasMore) {
    let data
    try {
      data = /** @type {any} */ (await clickupFetch(`${basePath}&page=${page}`))
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) {
        throw new Error("Lista non trovata o non accessibile. Verifica l'ID con l'URL della lista in ClickUp.")
      }
      throw err
    }
    allTasks.push(...data.tasks.map(mapTask))
    hasMore = data.has_more ?? false
    page++
    if (onProgress) onProgress(allTasks.length)
  }

  return allTasks
}

/**
 * Check if ClickUp is authenticated.
 * @returns {Promise<boolean>}
 */
export async function isAuthenticated() {
  const token = await getToken()
  return Boolean(token)
}

/**
 * Validate the stored ClickUp token by calling the /user endpoint.
 * Returns { valid: true, user } on success, { valid: false } on 401.
 * @returns {Promise<{ valid: boolean, user?: { id: number, username: string } }>}
 */
export async function validateToken() {
  try {
    const data = /** @type {any} */ (await clickupFetch('/user'))
    return {valid: true, user: {id: data.user.id, username: data.user.username}}
  } catch (err) {
    // 401 or no token → not valid
    if (err instanceof Error && (err.message.includes('401') || err.message.includes('not authenticated'))) {
      return {valid: false}
    }
    throw err
  }
}

/**
 * Get the list of ClickUp teams/workspaces accessible with the stored token.
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function getTeams() {
  const data = /** @type {any} */ (await clickupFetch('/team'))
  return (data.teams ?? []).map((t) => ({id: String(t.id), name: t.name}))
}

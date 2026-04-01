import {createServer} from 'node:http'
import {beforeAll, afterAll} from 'vitest'

/**
 * Minimal ClickUp API mock server for integration tests.
 * Mirrors the fixture data in tests/fixtures/msw-handlers.js so that
 * the CLI subprocess (launched via execaNode) can reach a real TCP socket
 * instead of the real ClickUp API.
 *
 * The server URL is written to process.env.CLICKUP_API_BASE so that
 * helpers.js propagates it to every CLI subprocess via `...process.env`.
 */

const TASKS_PAGE_0 = [
  {
    id: 'abc123',
    name: 'Implement user auth',
    status: {status: 'in progress', type: 'in_progress'},
    priority: {id: '2'},
    due_date: null,
    url: 'https://app.clickup.com/t/abc123',
    assignees: [{username: 'testdev'}],
    list: {id: 'L1', name: 'Sprint 42'},
    folder: {id: 'F1', name: 'Backend', hidden: false},
  },
]

const LIST_TASKS = [
  {
    id: 'list-task-1',
    name: 'List task alpha',
    status: {status: 'in progress', type: 'in_progress'},
    priority: {id: '2'},
    due_date: null,
    url: 'https://app.clickup.com/t/list-task-1',
    assignees: [{username: 'testdev'}],
    list: {id: 'L1', name: 'Sprint 42'},
    folder: {id: 'F1', name: 'Backend', hidden: false},
  },
  {
    id: 'list-task-2',
    name: 'List task beta (root list)',
    status: {status: 'todo', type: 'open'},
    priority: {id: '3'},
    due_date: null,
    url: 'https://app.clickup.com/t/list-task-2',
    assignees: [{username: 'testdev'}],
    list: {id: 'L1', name: 'Sprint 42'},
    folder: {hidden: true},
  },
]

/**
 * @param {import('node:http').ServerResponse} res
 * @param {unknown} data
 * @param {number} [status]
 */
function json(res, data, status = 200) {
  const body = JSON.stringify(data)
  res.writeHead(status, {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)})
  res.end(body)
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost`)
  const path = url.pathname

  // GET /api/v2/user
  if (req.method === 'GET' && path === '/api/v2/user') {
    return json(res, {user: {id: 42, username: 'testdev'}})
  }

  // GET /api/v2/team/:teamId/task
  const teamTaskMatch = path.match(/^\/api\/v2\/team\/[^/]+\/task$/)
  if (req.method === 'GET' && teamTaskMatch) {
    return json(res, {tasks: TASKS_PAGE_0, has_more: false})
  }

  // GET /api/v2/list/:listId/task
  const listTaskMatch = path.match(/^\/api\/v2\/list\/([^/]+)\/task$/)
  if (req.method === 'GET' && listTaskMatch) {
    if (listTaskMatch[1] === 'NOTFOUND') {
      return json(res, {err: 'List not found'}, 404)
    }
    return json(res, {tasks: LIST_TASKS, has_more: false})
  }

  // Fallback 404
  json(res, {err: 'Not found'}, 404)
})

beforeAll(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const {port} = /** @type {import('node:net').AddressInfo} */ (server.address())
  process.env.CLICKUP_API_BASE = `http://127.0.0.1:${port}/api/v2`
})

afterAll(async () => {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  delete process.env.CLICKUP_API_BASE
})

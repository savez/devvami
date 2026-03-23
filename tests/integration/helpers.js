import { execaNode } from 'execa'
import { createServer } from 'node:http'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import stripAnsi from 'strip-ansi'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI_PATH = resolve(__dirname, '../../bin/run.js')
const FAKE_BIN = resolve(__dirname, '../fixtures/bin')
const FIXTURE_CONFIG = resolve(__dirname, '../fixtures/config/valid.json')

/**
 * Run the dvmi CLI with fake CLI executables in PATH.
 * @param {string[]} args
 * @param {Record<string, string>} [env]
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
export async function runCli(args, env = {}) {
  const result = await execaNode(CLI_PATH, args, {
    env: {
      ...process.env,
      PATH: `${FAKE_BIN}:${process.env.PATH}`,
      NO_COLOR: '1',
      DVMI_CONFIG_PATH: FIXTURE_CONFIG,
      CLICKUP_TOKEN: 'test-token',
      ...env,
    },
    reject: false,
  })
  return {
    stdout: stripAnsi(result.stdout ?? ''),
    stderr: stripAnsi(result.stderr ?? ''),
    exitCode: result.exitCode ?? 1,
  }
}

/**
 * Run CLI and parse JSON output.
 * @param {string[]} args
 * @returns {Promise<unknown>}
 */
export async function runCliJson(args) {
  const result = await runCli([...args, '--json'])
  if (result.exitCode !== 0) {
    throw new Error(`CLI exited with ${result.exitCode}: ${result.stderr}`)
  }
  return JSON.parse(result.stdout)
}

/**
 * Start a minimal HTTP server for mocking external APIs in integration tests.
 *
 * Binds to a random available port on 127.0.0.1. The caller provides a
 * standard Node.js request handler; the returned `stop()` function cleanly
 * closes the server at the end of the test suite.
 *
 * @param {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void} handler
 * @returns {Promise<{ port: number, url: string, stop: () => Promise<void> }>}
 */
export async function createMockServer(handler) {
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  }
}

/**
 * Send a JSON response from a mock server handler.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {unknown} data
 * @param {number} [status]
 */
export function jsonResponse(res, data, status = 200) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

/**
 * Run the dvmi CLI with GITHUB_API_URL pointing to a local mock server.
 *
 * @param {string[]} args
 * @param {number} port - Port of the mock GitHub server
 * @param {Record<string, string>} [extraEnv]
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
export function runCliWithMockGitHub(args, port, extraEnv = {}) {
  return runCli(args, { GITHUB_API_URL: `http://127.0.0.1:${port}`, ...extraEnv })
}

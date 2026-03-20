import { execaNode } from 'execa'
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

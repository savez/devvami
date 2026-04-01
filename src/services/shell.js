import {execa} from 'execa'

/** @import { ExecResult } from '../types.js' */

/**
 * Execute a shell command and return result. Never throws on non-zero exit.
 * @param {string} command
 * @param {string[]} [args]
 * @param {object} [opts] - execa options
 * @returns {Promise<ExecResult>}
 */
export async function exec(command, args = [], opts = {}) {
  const result = await execa(command, args, {reject: false, ...opts})
  return {
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    exitCode: result.exitCode ?? 1,
  }
}

/**
 * Check whether a binary is available in PATH.
 * @param {string} binary
 * @returns {Promise<string|null>} Resolved path or null if not found
 */
export async function which(binary) {
  const result = await execa('which', [binary], {reject: false})
  if (result.exitCode !== 0 || !result.stdout) return null
  return result.stdout.trim()
}

/**
 * Run a command and return trimmed stdout. Throws on failure.
 * @param {string} command
 * @param {string[]} [args]
 * @param {object} [opts]
 * @returns {Promise<string>}
 */
export async function execOrThrow(command, args = [], opts = {}) {
  const result = await execa(command, args, {reject: true, ...opts})
  return result.stdout?.trim() ?? ''
}

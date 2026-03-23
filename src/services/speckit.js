import { execa } from 'execa'
import { which, exec } from './shell.js'
import { DvmiError } from '../utils/errors.js'

/** GitHub spec-kit package source for uv */
const SPECKIT_FROM = 'git+https://github.com/github/spec-kit.git'

/**
 * Check whether the `uv` Python package manager is available in PATH.
 *
 * @returns {Promise<boolean>}
 */
export async function isUvInstalled() {
  return (await which('uv')) !== null
}

/**
 * Check whether the `specify` CLI (spec-kit) is available in PATH.
 *
 * @returns {Promise<boolean>}
 */
export async function isSpecifyInstalled() {
  return (await which('specify')) !== null
}

/**
 * Install `specify-cli` from the GitHub spec-kit repository via `uv tool install`.
 *
 * @param {{ force?: boolean }} [opts] - Pass `force: true` to reinstall even if already present
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 * @throws {DvmiError} when the installation command fails
 */
export async function installSpecifyCli(opts = {}) {
  const args = ['tool', 'install', 'specify-cli', '--from', SPECKIT_FROM]
  if (opts.force) args.push('--force')

  const result = await exec('uv', args)
  if (result.exitCode !== 0) {
    throw new DvmiError(
      'Failed to install specify-cli',
      result.stderr || 'Check your network connection and uv installation, then try again',
    )
  }
  return result
}

/**
 * Run `specify init --here` in the given directory, inheriting the parent
 * stdio so the user can interact with the speckit wizard directly.
 *
 * @param {string} cwd - Working directory to run `specify init` in
 * @param {{ ai?: string, force?: boolean }} [opts]
 * @returns {Promise<void>}
 * @throws {DvmiError} when `specify init` exits with a non-zero code
 */
export async function runSpecifyInit(cwd, opts = {}) {
  const args = ['init', '--here']
  if (opts.ai) args.push('--ai', opts.ai)
  if (opts.force) args.push('--force')

  const result = await execa('specify', args, {
    cwd,
    stdio: 'inherit',
    reject: false,
  })

  if (result.exitCode !== 0) {
    throw new DvmiError(
      '`specify init` exited with a non-zero code',
      'Check the output above for details',
    )
  }
}

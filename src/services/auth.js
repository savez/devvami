import {exec} from './shell.js'
import {loadConfig} from './config.js'

/**
 * @typedef {Object} AuthStatus
 * @property {boolean} authenticated
 * @property {string} [username]
 * @property {string} [account]
 * @property {string} [role]
 * @property {string} [error]
 */

/**
 * Check GitHub authentication status.
 * @returns {Promise<AuthStatus>}
 */
export async function checkGitHubAuth() {
  const result = await exec('gh', ['auth', 'status'])
  if (result.exitCode !== 0) {
    return {authenticated: false, error: result.stderr}
  }
  // Extract username from output like "Logged in to github.com as username"
  const match = result.stderr.match(/Logged in to .+ as (\S+)/)
  return {authenticated: true, username: match?.[1] ?? 'unknown'}
}

/**
 * Log in to GitHub via SSO (opens browser).
 * @returns {Promise<AuthStatus>}
 */
export async function loginGitHub() {
  const result = await exec('gh', ['auth', 'login', '--web'])
  if (result.exitCode !== 0) {
    return {authenticated: false, error: result.stderr}
  }
  return checkGitHubAuth()
}

/**
 * Check AWS authentication via aws-vault.
 * @returns {Promise<AuthStatus>}
 */
export async function checkAWSAuth() {
  const config = await loadConfig()
  if (!config.awsProfile) return {authenticated: false, error: 'No AWS profile configured'}

  const result = await exec('aws-vault', [
    'exec',
    config.awsProfile,
    '--',
    'aws',
    'sts',
    'get-caller-identity',
    '--output',
    'json',
  ])
  if (result.exitCode !== 0) {
    return {authenticated: false, error: result.stderr || 'Session expired'}
  }
  try {
    const identity = JSON.parse(result.stdout)
    return {
      authenticated: true,
      account: identity.Account,
      role: identity.Arn?.split('/').at(-1),
    }
  } catch {
    return {authenticated: false, error: 'Could not parse AWS identity'}
  }
}

/**
 * Log in to AWS via aws-vault.
 * @param {string} profile - aws-vault profile name
 * @returns {Promise<AuthStatus>}
 */
export async function loginAWS(profile) {
  const result = await exec('aws-vault', ['login', profile])
  if (result.exitCode !== 0) {
    return {authenticated: false, error: result.stderr}
  }
  return checkAWSAuth()
}

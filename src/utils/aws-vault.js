import {loadConfigSync} from '../services/config.js'
import {execa} from 'execa'

/**
 * Returns the aws-vault exec prefix to prepend to AWS CLI commands.
 *
 * Detection order:
 *   1. process.env.AWS_VAULT  — set by `aws-vault exec` at runtime in the child process
 *   2. config.awsProfile      — if an already-loaded config object is passed (avoids sync I/O)
 *   3. loadConfigSync()       — synchronous fallback for static getters where async is unavailable
 *
 * @param {{ awsProfile?: string } | null} [config] - Already-loaded config (optional).
 *   Pass this when the caller has already loaded config asynchronously to avoid a redundant sync read.
 * @returns {string} e.g. `"aws-vault exec myprofile -- "` or `""`
 *
 * @example
 * // Inside an async run() method where config is already loaded:
 * const prefix = awsVaultPrefix(config)
 * this.error(`No credentials. Use: ${prefix}dvmi costs get`)
 *
 * @example
 * // Inside a static getter (no async available):
 * static get examples() {
 *   const prefix = awsVaultPrefix()
 *   return [`${prefix}<%= config.bin %> costs get my-service`]
 * }
 */
export function awsVaultPrefix(config = null) {
  // 1. Runtime env var — set by aws-vault exec in the subprocess environment
  if (process.env.AWS_VAULT) return `aws-vault exec ${process.env.AWS_VAULT} -- `

  // 2. Already-loaded config passed by the caller
  if (config?.awsProfile) return `aws-vault exec ${config.awsProfile} -- `

  // 3. Synchronous config read — fallback for static getters
  const synced = loadConfigSync()
  if (synced.awsProfile) return `aws-vault exec ${synced.awsProfile} -- `

  return ''
}

/**
 * Returns true when the current process already has AWS credentials in env.
 * @returns {boolean}
 */
export function hasAwsCredentialEnv() {
  return Boolean(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SESSION_TOKEN)
}

/**
 * Returns true when this process is already running inside aws-vault exec.
 * @returns {boolean}
 */
export function isAwsVaultSession() {
  return Boolean(process.env.AWS_VAULT)
}

/**
 * Re-execute the current dvmi command under aws-vault and mirror stdio.
 * Returns null when re-exec should not run.
 *
 * Guard conditions:
 * - awsProfile must be configured
 * - command must not already be inside aws-vault
 * - process must not already have AWS credentials in env
 * - re-exec must not have already happened in this process chain
 *
 * @param {{ awsProfile?: string } | null} [config]
 * @returns {Promise<number | null>} child exit code or null when skipped
 */
export async function reexecCurrentCommandWithAwsVault(config = null) {
  const profile = config?.awsProfile ?? loadConfigSync().awsProfile
  if (!profile) return null
  if (isAwsVaultSession()) return null
  if (hasAwsCredentialEnv()) return null
  if (process.env.DVMI_AWS_VAULT_REEXEC === '1') return null

  try {
    const child = await execa('aws-vault', ['exec', profile, '--', process.execPath, ...process.argv.slice(1)], {
      reject: false,
      stdio: 'inherit',
      env: {
        ...process.env,
        DVMI_AWS_VAULT_REEXEC: '1',
      },
    })

    return child.exitCode ?? 1
  } catch {
    // aws-vault missing or failed to spawn; fallback to normal execution path
    return null
  }
}

/**
 * Re-execute the current dvmi command under aws-vault using an explicit profile.
 * This bypasses auto-detection guards and is intended for interactive recovery flows.
 *
 * @param {string} profile
 * @param {Record<string, string>} [extraEnv]
 * @returns {Promise<number | null>} child exit code or null when skipped/failed to spawn
 */
export async function reexecCurrentCommandWithAwsVaultProfile(profile, extraEnv = {}) {
  if (!profile) return null

  try {
    const child = await execa('aws-vault', ['exec', profile, '--', process.execPath, ...process.argv.slice(1)], {
      reject: false,
      stdio: 'inherit',
      env: {
        ...process.env,
        DVMI_AWS_VAULT_REEXEC: '1',
        ...extraEnv,
      },
    })

    return child.exitCode ?? 1
  } catch {
    return null
  }
}

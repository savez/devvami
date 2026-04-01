import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {loadConfig, saveConfig} from './config.js'
import {exec} from './shell.js'

const PKG_PATH = join(fileURLToPath(import.meta.url), '..', '..', '..', 'package.json')
const REPO = 'devvami/devvami'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Get current CLI version from package.json.
 * @returns {Promise<string>}
 */
export async function getCurrentVersion() {
  const raw = await readFile(PKG_PATH, 'utf8')
  return JSON.parse(raw).version
}

/**
 * Fetch latest version via `npm view` (uses ~/.npmrc auth automatically).
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<string|null>}
 */
export async function getLatestVersion({force = false} = {}) {
  const config = await loadConfig()
  const now = Date.now()
  const lastCheck = config.lastVersionCheck ? new Date(config.lastVersionCheck).getTime() : 0

  if (!force && config.latestVersion && now - lastCheck < CACHE_TTL_MS) {
    return config.latestVersion
  }

  try {
    // Usa gh CLI (già autenticato) per leggere l'ultima GitHub Release
    const result = await exec('gh', ['api', `repos/${REPO}/releases/latest`, '--jq', '.tag_name'])
    if (result.exitCode !== 0) return null
    // Il tag è nel formato "v1.0.0" — rimuove il prefisso "v"
    const latest = result.stdout.trim().replace(/^v/, '') || null
    if (latest) {
      await saveConfig({...config, latestVersion: latest, lastVersionCheck: new Date().toISOString()})
    }
    return latest
  } catch {
    return null
  }
}

/**
 * Check if a newer version is available.
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ hasUpdate: boolean, current: string, latest: string|null }>}
 */
export async function checkForUpdate({force = false} = {}) {
  const [current, latest] = await Promise.all([getCurrentVersion(), getLatestVersion({force})])
  const hasUpdate = Boolean(latest && latest !== current)
  return {hasUpdate, current, latest}
}

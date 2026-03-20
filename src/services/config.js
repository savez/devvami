import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** @import { CLIConfig } from '../types.js' */

const CONFIG_DIR = process.env.XDG_CONFIG_HOME
   ? join(process.env.XDG_CONFIG_HOME, 'dvmi')
   : join(homedir(), '.config', 'dvmi')

export const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

/** @type {CLIConfig} */
const DEFAULTS = {
  org: '',
  awsProfile: '',
  awsRegion: 'eu-west-1',
  shell: '',
  clickup: {},
}

/**
 * Load CLI config from disk. Returns defaults if file doesn't exist.
 * @param {string} [configPath] - Override config path (used in tests)
 * @returns {Promise<CLIConfig>}
 */
export async function loadConfig(configPath = CONFIG_PATH) {
  if (!existsSync(configPath)) return { ...DEFAULTS }
  try {
    const raw = await readFile(configPath, 'utf8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

/**
 * Save CLI config to disk, creating directory if needed.
 * @param {CLIConfig} config
 * @param {string} [configPath] - Override config path (used in tests)
 * @returns {Promise<void>}
 */
export async function saveConfig(config, configPath = CONFIG_PATH) {
  const dir = configPath.replace(/\/[^/]+$/, '')
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
}

/**
 * Check whether config exists on disk.
 * @param {string} [configPath]
 * @returns {boolean}
 */
export function configExists(configPath = CONFIG_PATH) {
  return existsSync(configPath)
}

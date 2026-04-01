import {readFile, writeFile, mkdir, chmod} from 'node:fs/promises'
import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {homedir} from 'node:os'

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
export async function loadConfig(configPath = process.env.DVMI_CONFIG_PATH ?? CONFIG_PATH) {
  if (!existsSync(configPath)) return {...DEFAULTS}
  try {
    const raw = await readFile(configPath, 'utf8')
    return {...DEFAULTS, ...JSON.parse(raw)}
  } catch {
    return {...DEFAULTS}
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
    await mkdir(dir, {recursive: true})
  }
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
  await chmod(configPath, 0o600)
}

/**
 * Check whether config exists on disk.
 * @param {string} [configPath]
 * @returns {boolean}
 */
export function configExists(configPath = CONFIG_PATH) {
  return existsSync(configPath)
}

/**
 * Load CLI config synchronously. Intended for use in static getters where async is unavailable.
 * Returns defaults if file doesn't exist or cannot be parsed.
 * @param {string} [configPath] - Override config path (used in tests)
 * @returns {CLIConfig}
 */
export function loadConfigSync(configPath = process.env.DVMI_CONFIG_PATH ?? CONFIG_PATH) {
  if (!existsSync(configPath)) return {...DEFAULTS}
  try {
    const raw = readFileSync(configPath, 'utf8')
    return {...DEFAULTS, ...JSON.parse(raw)}
  } catch {
    return {...DEFAULTS}
  }
}

import open from 'open'
import { detectPlatform } from '../services/platform.js'
import { exec } from '../services/shell.js'

/**
 * Open a URL in the default browser, using the platform-appropriate command.
 * @param {string} url
 * @returns {Promise<void>}
 */
export async function openBrowser(url) {
  const { platform, openCommand } = await detectPlatform()

  if (platform === 'macos') {
    await open(url)
    return
  }

  // WSL2: try wslview first, fallback to xdg-open
  if (platform === 'wsl2') {
    const wslview = await exec('wslview', [url])
    if (wslview.exitCode === 0) return
  }

  // Linux / fallback
  const result = await exec(openCommand, [url])
  if (result.exitCode !== 0) {
    await open(url) // final fallback via open package
  }
}

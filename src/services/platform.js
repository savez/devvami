import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

/** @import { Platform, PlatformInfo } from '../types.js' */

/**
 * Detect current platform (macOS, WSL2, or Linux).
 * @returns {Promise<PlatformInfo>}
 */
export async function detectPlatform() {
  if (process.platform === 'darwin') {
    return {
      platform: 'macos',
      openCommand: 'open',
      credentialHelper: 'osxkeychain',
    }
  }

  if (process.platform === 'linux') {
    // WSL2 has "microsoft" in /proc/version
    if (existsSync('/proc/version')) {
      try {
        const version = await readFile('/proc/version', 'utf8')
        if (version.toLowerCase().includes('microsoft')) {
          return {
            platform: 'wsl2',
            openCommand: 'wslview',
            credentialHelper: 'manager',
          }
        }
      } catch {
        // fall through to linux
      }
    }
    return {
      platform: 'linux',
      openCommand: 'xdg-open',
      credentialHelper: 'store',
    }
  }

  // Fallback
  return {
    platform: 'linux',
    openCommand: 'xdg-open',
    credentialHelper: 'store',
  }
}

import {homedir} from 'node:os'
import {join} from 'node:path'
import {readFile, appendFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {which, exec, execOrThrow} from './shell.js'

/** @import { Platform, PlatformInfo, SecurityTool, SecurityToolStatus, SetupStep, StepResult, GpgKey } from '../types.js' */

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/** @type {SecurityTool[]} */
const TOOL_DEFINITIONS = [
  {
    id: 'aws-vault',
    displayName: 'aws-vault',
    role: 'aws',
    platforms: ['macos', 'linux', 'wsl2'],
    status: 'not-installed',
    version: null,
    hint: null,
  },
  {
    id: 'gpg',
    displayName: 'GPG',
    role: 'dependency',
    platforms: ['linux', 'wsl2'],
    status: 'not-installed',
    version: null,
    hint: null,
  },
  {
    id: 'pass',
    displayName: 'GNU pass',
    role: 'dependency',
    platforms: ['linux', 'wsl2'],
    status: 'not-installed',
    version: null,
    hint: null,
  },
  {
    id: 'osxkeychain',
    displayName: 'macOS Keychain',
    role: 'git',
    platforms: ['macos'],
    status: 'not-installed',
    version: null,
    hint: null,
  },
  {
    id: 'gcm',
    displayName: 'Git Credential Manager',
    role: 'git',
    platforms: ['linux', 'wsl2'],
    status: 'not-installed',
    version: null,
    hint: null,
  },
]

// ---------------------------------------------------------------------------
// checkToolStatus
// ---------------------------------------------------------------------------

/**
 * Check the current status of all security tools for the given platform.
 * @param {Platform} platform
 * @returns {Promise<SecurityToolStatus[]>}
 */
export async function checkToolStatus(platform) {
  /** @type {SecurityToolStatus[]} */
  const results = []

  for (const tool of TOOL_DEFINITIONS) {
    if (!tool.platforms.includes(platform)) {
      results.push({id: tool.id, displayName: tool.displayName, status: 'n/a', version: null, hint: null})
      continue
    }

    if (tool.id === 'aws-vault') {
      const path = await which('aws-vault')
      if (!path) {
        results.push({
          id: tool.id,
          displayName: tool.displayName,
          status: 'not-installed',
          version: null,
          hint: 'Install aws-vault',
        })
        continue
      }
      const versionResult = await exec('aws-vault', ['--version'])
      const version = (versionResult.stdout || versionResult.stderr).replace(/^v/, '').trim()
      // On Linux/WSL2 check that AWS_VAULT_BACKEND=pass is configured
      if (platform !== 'macos') {
        const backend = process.env.AWS_VAULT_BACKEND
        if (backend !== 'pass') {
          results.push({
            id: tool.id,
            displayName: tool.displayName,
            status: 'misconfigured',
            version: version || null,
            hint: 'Add export AWS_VAULT_BACKEND=pass to your shell profile',
          })
          continue
        }
      }
      results.push({
        id: tool.id,
        displayName: tool.displayName,
        status: 'installed',
        version: version || null,
        hint: null,
      })
      continue
    }

    if (tool.id === 'gpg') {
      const path = await which('gpg')
      if (!path) {
        results.push({
          id: tool.id,
          displayName: tool.displayName,
          status: 'not-installed',
          version: null,
          hint: 'Install gnupg via your package manager',
        })
        continue
      }
      const versionResult = await exec('gpg', ['--version'])
      const match = versionResult.stdout.match(/gpg \(GnuPG\)\s+([\d.]+)/)
      results.push({
        id: tool.id,
        displayName: tool.displayName,
        status: 'installed',
        version: match ? match[1] : null,
        hint: null,
      })
      continue
    }

    if (tool.id === 'pass') {
      const path = await which('pass')
      if (!path) {
        results.push({
          id: tool.id,
          displayName: tool.displayName,
          status: 'not-installed',
          version: null,
          hint: 'Install pass via your package manager',
        })
        continue
      }
      const versionResult = await exec('pass', ['--version'])
      const match = versionResult.stdout.match(/([\d.]+)/)
      // Check if pass is initialized
      const lsResult = await exec('pass', ['ls'])
      if (lsResult.exitCode !== 0) {
        results.push({
          id: tool.id,
          displayName: tool.displayName,
          status: 'misconfigured',
          version: match ? match[1] : null,
          hint: 'Initialize pass with: pass init <gpg-key-id>',
        })
        continue
      }
      results.push({
        id: tool.id,
        displayName: tool.displayName,
        status: 'installed',
        version: match ? match[1] : null,
        hint: null,
      })
      continue
    }

    if (tool.id === 'osxkeychain') {
      const result = await exec('git', ['config', '--global', 'credential.helper'])
      if (result.stdout === 'osxkeychain') {
        results.push({id: tool.id, displayName: tool.displayName, status: 'installed', version: null, hint: null})
      } else {
        results.push({
          id: tool.id,
          displayName: tool.displayName,
          status: 'not-installed',
          version: null,
          hint: 'Run: git config --global credential.helper osxkeychain',
        })
      }
      continue
    }

    if (tool.id === 'gcm') {
      const path = await which('git-credential-manager')
      if (!path) {
        results.push({
          id: tool.id,
          displayName: tool.displayName,
          status: 'not-installed',
          version: null,
          hint: 'Install Git Credential Manager',
        })
        continue
      }
      const versionResult = await exec('git-credential-manager', ['--version'])
      const version = versionResult.stdout.trim() || null
      const storeResult = await exec('git', ['config', '--global', 'credential.credentialStore'])
      if (storeResult.stdout !== 'gpg') {
        results.push({
          id: tool.id,
          displayName: tool.displayName,
          status: 'misconfigured',
          version,
          hint: 'Run: git config --global credential.credentialStore gpg',
        })
        continue
      }
      results.push({id: tool.id, displayName: tool.displayName, status: 'installed', version, hint: null})
      continue
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// appendToShellProfile
// ---------------------------------------------------------------------------

/**
 * Append a line to the developer's shell profile if not already present (idempotent).
 * @param {string} line - The line to append (e.g., "export AWS_VAULT_BACKEND=pass")
 * @returns {Promise<void>}
 */
export async function appendToShellProfile(line) {
  const shell = process.env.SHELL ?? ''
  let profilePath
  if (shell.includes('zsh')) {
    profilePath = join(homedir(), '.zshrc')
  } else {
    profilePath = join(homedir(), '.bashrc')
  }

  if (existsSync(profilePath)) {
    const contents = await readFile(profilePath, 'utf8')
    if (contents.includes(line)) return
  }

  await appendFile(profilePath, `\n${line}\n`)
}

// ---------------------------------------------------------------------------
// listGpgKeys
// ---------------------------------------------------------------------------

/**
 * List GPG secret keys available on the system.
 * @returns {Promise<GpgKey[]>}
 */
export async function listGpgKeys() {
  const result = await exec('gpg', ['--list-secret-keys', '--with-colons'])
  if (result.exitCode !== 0 || !result.stdout.trim()) return []

  const lines = result.stdout.split('\n')
  /** @type {GpgKey[]} */
  const keys = []
  let current = /** @type {Partial<GpgKey>|null} */ (null)

  for (const line of lines) {
    const parts = line.split(':')
    const type = parts[0]

    if (type === 'sec') {
      // Start a new key: fingerprint comes from subsequent 'fpr' line
      current = {
        id: parts[4] ? parts[4].slice(-16) : '',
        fingerprint: '',
        name: '',
        email: '',
        expiry: parts[6] ? new Date(Number(parts[6]) * 1000).toISOString() : null,
      }
    } else if (type === 'fpr' && current && !current.fingerprint) {
      current.fingerprint = parts[9] ?? ''
    } else if (type === 'uid' && current) {
      const uid = parts[9] ?? ''
      const nameMatch = uid.match(/^([^<]+?)\s*</)
      const emailMatch = uid.match(/<([^>]+)>/)
      if (!current.name) current.name = nameMatch ? nameMatch[1].trim() : uid
      if (!current.email) current.email = emailMatch ? emailMatch[1] : ''

      // Key is complete enough — push it
      if (current.id) {
        keys.push(/** @type {GpgKey} */ (current))
        current = null
      }
    }
  }

  return keys
}

// ---------------------------------------------------------------------------
// deriveOverallStatus
// ---------------------------------------------------------------------------

/**
 * Derive an overall status string from a list of tool statuses.
 * @param {SecurityToolStatus[]} tools
 * @returns {'success'|'partial'|'not-configured'}
 */
export function deriveOverallStatus(tools) {
  const applicable = tools.filter((t) => t.status !== 'n/a')
  if (applicable.length === 0) return 'not-configured'
  const allInstalled = applicable.every((t) => t.status === 'installed')
  if (allInstalled) return 'success'
  const someInstalled = applicable.some((t) => t.status === 'installed')
  if (someInstalled) return 'partial'
  return 'not-configured'
}

// ---------------------------------------------------------------------------
// buildSteps
// ---------------------------------------------------------------------------

/**
 * Build an ordered list of setup steps for the given platform and selection.
 * This is a pure function — all side-effecting logic is in the `run` closures.
 * @param {PlatformInfo} platformInfo
 * @param {'aws'|'git'|'both'} selection
 * @param {{ gpgId?: string }} [context] - Optional context (e.g. chosen GPG key ID)
 * @returns {SetupStep[]}
 */
export function buildSteps(platformInfo, selection, context = {}) {
  const {platform} = platformInfo
  const includeAws = selection === 'aws' || selection === 'both'
  const includeGit = selection === 'git' || selection === 'both'

  /** @type {SetupStep[]} */
  const steps = []

  if (platform === 'macos') {
    if (includeAws) {
      steps.push({
        id: 'check-brew',
        label: 'Check Homebrew installation',
        toolId: 'aws-vault',
        type: 'check',
        requiresConfirmation: false,
        run: async () => {
          const path = await which('brew')
          if (!path) {
            return {
              status: 'failed',
              hint: 'Homebrew is required. Install it from https://brew.sh',
              hintUrl: 'https://brew.sh',
            }
          }
          return {status: 'success', message: 'Homebrew is available'}
        },
      })

      steps.push({
        id: 'install-aws-vault',
        label: 'Install aws-vault via Homebrew',
        toolId: 'aws-vault',
        type: 'install',
        requiresConfirmation: true,
        run: async () => {
          const existing = await which('aws-vault')
          if (existing) return {status: 'skipped', message: 'aws-vault already installed'}
          try {
            await execOrThrow('brew', ['install', 'aws-vault'])
            return {status: 'success', message: 'aws-vault installed via Homebrew'}
          } catch {
            return {
              status: 'failed',
              hint: 'Run manually: brew install aws-vault',
              hintUrl: 'https://github.com/99designs/aws-vault',
            }
          }
        },
      })

      steps.push({
        id: 'verify-aws-vault',
        label: 'Verify aws-vault installation',
        toolId: 'aws-vault',
        type: 'verify',
        requiresConfirmation: false,
        run: async () => {
          const result = await exec('aws-vault', ['--version'])
          if (result.exitCode !== 0) {
            return {status: 'failed', hint: 'aws-vault not found in PATH after install'}
          }
          const version = (result.stdout || result.stderr).trim()
          return {status: 'success', message: `aws-vault ${version}`}
        },
      })
    }

    if (includeGit) {
      steps.push({
        id: 'configure-osxkeychain',
        label: 'Configure macOS Keychain as Git credential helper',
        toolId: 'osxkeychain',
        type: 'configure',
        requiresConfirmation: true,
        run: async () => {
          try {
            await execOrThrow('git', ['config', '--global', 'credential.helper', 'osxkeychain'])
            return {status: 'success', message: 'Git credential helper set to osxkeychain'}
          } catch {
            return {status: 'failed', hint: 'Run manually: git config --global credential.helper osxkeychain'}
          }
        },
      })

      steps.push({
        id: 'verify-osxkeychain',
        label: 'Verify macOS Keychain credential helper',
        toolId: 'osxkeychain',
        type: 'verify',
        requiresConfirmation: false,
        run: async () => {
          const result = await exec('git', ['config', '--global', 'credential.helper'])
          if (result.stdout !== 'osxkeychain') {
            return {status: 'failed', hint: 'credential.helper is not set to osxkeychain'}
          }
          return {status: 'success', message: 'osxkeychain is configured'}
        },
      })
    }
  } else {
    // Linux / WSL2
    if (includeAws) {
      steps.push({
        id: 'check-gpg',
        label: 'Check GPG installation',
        toolId: 'gpg',
        type: 'check',
        requiresConfirmation: false,
        run: async () => {
          const path = await which('gpg')
          if (!path) {
            return {status: 'failed', hint: 'GPG not found — will be installed in the next step'}
          }
          const result = await exec('gpg', ['--version'])
          const match = result.stdout.match(/gpg \(GnuPG\)\s+([\d.]+)/)
          return {status: 'success', message: `GPG ${match ? match[1] : 'found'}`}
        },
      })

      steps.push({
        id: 'install-gpg',
        label: 'Install GPG (gnupg)',
        toolId: 'gpg',
        type: 'install',
        requiresConfirmation: true,
        skippable: true,
        run: async () => {
          const path = await which('gpg')
          if (path) return {status: 'skipped', message: 'GPG already installed'}
          try {
            await execOrThrow('sudo', ['apt-get', 'install', '-y', 'gnupg'])
            return {status: 'success', message: 'GPG installed'}
          } catch {
            return {status: 'failed', hint: 'Run manually: sudo apt-get install -y gnupg'}
          }
        },
      })

      steps.push({
        id: 'create-gpg-key',
        label: 'Create or select a GPG key for pass and GCM',
        toolId: 'gpg',
        type: 'configure',
        requiresConfirmation: true,
        gpgInteractive: true,
        run: async () => {
          const gpgId = context.gpgId
          if (gpgId) return {status: 'skipped', message: `Using existing GPG key ${gpgId}`}
          // When gpgInteractive=true, the command layer stops the spinner and spawns
          // gpg --full-generate-key with stdio:inherit so the user sets a strong passphrase.
          // We never generate a key with an empty passphrase — that would leave the private
          // key unprotected at rest and defeat the purpose of this setup wizard.
          // If we reach this non-interactive fallback, ask the user to do it manually.
          return {
            status: 'failed',
            hint: 'Create a GPG key manually with a strong passphrase: gpg --full-generate-key',
            hintUrl: 'https://www.gnupg.org/gph/en/manual/c14.html',
          }
        },
      })

      steps.push({
        id: 'install-pass',
        label: 'Install GNU pass',
        toolId: 'pass',
        type: 'install',
        requiresConfirmation: true,
        run: async () => {
          const path = await which('pass')
          if (path) return {status: 'skipped', message: 'pass already installed'}
          try {
            await execOrThrow('sudo', ['apt-get', 'install', '-y', 'pass'])
            return {status: 'success', message: 'pass installed'}
          } catch {
            return {status: 'failed', hint: 'Run manually: sudo apt-get install -y pass'}
          }
        },
      })

      steps.push({
        id: 'init-pass',
        label: 'Initialize pass with your GPG key',
        toolId: 'pass',
        type: 'configure',
        requiresConfirmation: true,
        run: async () => {
          // Skip if pass is already initialized
          const lsResult = await exec('pass', ['ls'])
          if (lsResult.exitCode === 0) {
            return {status: 'skipped', message: 'pass store already initialized'}
          }
          const gpgId = context.gpgId
          if (!gpgId) {
            return {status: 'failed', hint: 'No GPG key ID available — complete the create-gpg-key step first'}
          }
          try {
            await execOrThrow('pass', ['init', gpgId])
            return {status: 'success', message: `pass initialized with key ${gpgId}`}
          } catch {
            return {status: 'failed', hint: `Run manually: pass init ${gpgId}`}
          }
        },
      })

      steps.push({
        id: 'install-aws-vault',
        label: 'Install aws-vault binary',
        toolId: 'aws-vault',
        type: 'install',
        requiresConfirmation: true,
        run: async () => {
          const existing = await which('aws-vault')
          if (existing) return {status: 'skipped', message: 'aws-vault already installed'}
          const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
          const url = `https://github.com/99designs/aws-vault/releases/latest/download/aws-vault-linux-${arch}`
          try {
            await execOrThrow('sudo', [
              'sh',
              '-c',
              `curl -sSL '${url}' -o /usr/local/bin/aws-vault && chmod +x /usr/local/bin/aws-vault`,
            ])
            return {status: 'success', message: 'aws-vault installed to /usr/local/bin/aws-vault'}
          } catch {
            return {
              status: 'failed',
              hint: `Download manually: curl -sSL '${url}' -o /usr/local/bin/aws-vault && chmod +x /usr/local/bin/aws-vault`,
              hintUrl: 'https://github.com/99designs/aws-vault/releases',
            }
          }
        },
      })

      steps.push({
        id: 'configure-aws-vault-backend',
        label: 'Configure AWS_VAULT_BACKEND=pass in shell profile',
        toolId: 'aws-vault',
        type: 'configure',
        requiresConfirmation: true,
        run: async () => {
          try {
            await appendToShellProfile('export AWS_VAULT_BACKEND=pass')
            await appendToShellProfile('export GPG_TTY=$(tty)')
            return {status: 'success', message: 'AWS_VAULT_BACKEND=pass and GPG_TTY added to shell profile'}
          } catch {
            return {status: 'failed', hint: 'Add manually to ~/.bashrc or ~/.zshrc: export AWS_VAULT_BACKEND=pass'}
          }
        },
      })

      steps.push({
        id: 'verify-aws-vault',
        label: 'Verify aws-vault installation',
        toolId: 'aws-vault',
        type: 'verify',
        requiresConfirmation: false,
        run: async () => {
          const result = await exec('aws-vault', ['--version'])
          if (result.exitCode !== 0) {
            return {status: 'failed', hint: 'aws-vault not found in PATH after install'}
          }
          const version = (result.stdout || result.stderr).trim()
          return {status: 'success', message: `aws-vault ${version}`}
        },
      })
    }

    if (includeGit) {
      // On WSL2, first check for Windows-side GCM bridge
      if (platform === 'wsl2') {
        steps.push({
          id: 'check-gcm-bridge',
          label: 'Check for Windows Git Credential Manager bridge',
          toolId: 'gcm',
          type: 'check',
          requiresConfirmation: false,
          run: async () => {
            const bridgePath = '/mnt/c/Program Files/Git/mingw64/bin/git-credential-manager.exe'
            if (existsSync(bridgePath)) {
              return {status: 'success', message: 'Windows GCM bridge found — using Windows Credential Manager'}
            }
            return {status: 'skipped', message: 'Windows GCM not found — will install native Linux GCM'}
          },
        })
      }

      steps.push({
        id: 'install-gcm',
        label: 'Install Git Credential Manager',
        toolId: 'gcm',
        type: 'install',
        requiresConfirmation: true,
        run: async () => {
          const existing = await which('git-credential-manager')
          if (existing) return {status: 'skipped', message: 'Git Credential Manager already installed'}
          try {
            const latestResult = await exec('sh', [
              '-c',
              "curl -sSL https://api.github.com/repos/git-ecosystem/git-credential-manager/releases/latest | grep 'browser_download_url.*gcm.*linux.*amd64.*deb' | head -1 | cut -d '\"' -f 4",
            ])
            const debUrl = latestResult.stdout.trim()
            if (!debUrl) throw new Error('Could not find GCM deb package URL')
            // Security: validate debUrl is a legitimate GitHub release asset URL before using it
            // This prevents command injection if the GitHub API response were tampered with (MITM / supply-chain)
            const SAFE_DEB_URL =
              /^https:\/\/github\.com\/git-ecosystem\/git-credential-manager\/releases\/download\/[a-zA-Z0-9._\-/]+\.deb$/
            if (!SAFE_DEB_URL.test(debUrl)) {
              throw new Error(`Unexpected GCM package URL format: "${debUrl}"`)
            }
            // Use array args — no shell interpolation of the URL
            await execOrThrow('curl', ['-sSL', debUrl, '-o', '/tmp/gcm.deb'])
            await execOrThrow('sudo', ['dpkg', '-i', '/tmp/gcm.deb'])
            return {status: 'success', message: 'Git Credential Manager installed'}
          } catch {
            return {
              status: 'failed',
              hint: 'Install manually from https://github.com/git-ecosystem/git-credential-manager/releases',
              hintUrl: 'https://github.com/git-ecosystem/git-credential-manager/releases',
            }
          }
        },
      })

      steps.push({
        id: 'configure-gcm',
        label: 'Configure Git Credential Manager',
        toolId: 'gcm',
        type: 'configure',
        requiresConfirmation: true,
        run: async () => {
          try {
            await execOrThrow('git-credential-manager', ['configure'])
            return {status: 'success', message: 'Git Credential Manager configured'}
          } catch {
            return {status: 'failed', hint: 'Run manually: git-credential-manager configure'}
          }
        },
      })

      steps.push({
        id: 'configure-gcm-store',
        label: 'Set GCM credential store to gpg',
        toolId: 'gcm',
        type: 'configure',
        requiresConfirmation: true,
        run: async () => {
          try {
            await execOrThrow('git', ['config', '--global', 'credential.credentialStore', 'gpg'])
            return {status: 'success', message: 'GCM credential store set to gpg'}
          } catch {
            return {status: 'failed', hint: 'Run manually: git config --global credential.credentialStore gpg'}
          }
        },
      })

      steps.push({
        id: 'verify-gcm',
        label: 'Verify Git Credential Manager',
        toolId: 'gcm',
        type: 'verify',
        requiresConfirmation: false,
        run: async () => {
          const result = await exec('git-credential-manager', ['--version'])
          if (result.exitCode !== 0) {
            return {status: 'failed', hint: 'git-credential-manager not found in PATH'}
          }
          return {status: 'success', message: `GCM ${result.stdout.trim()}`}
        },
      })
    }
  }

  return steps
}

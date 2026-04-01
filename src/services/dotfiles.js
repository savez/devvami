import {homedir} from 'node:os'
import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {which, exec, execOrThrow} from './shell.js'
import {loadConfig, saveConfig} from './config.js'

/** @import { Platform, DotfileEntry, DotfileRecommendation, DotfilesSetupResult, DotfilesAddResult, SetupStep, StepResult, CLIConfig } from '../types.js' */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Sensitive path glob patterns that trigger auto-encryption.
 * @type {string[]}
 */
export const SENSITIVE_PATTERNS = [
  '~/.ssh/id_*',
  '~/.gnupg/*',
  '~/.netrc',
  '~/.aws/credentials',
  '**/.*token*',
  '**/.*credential*',
  '**/.*secret*',
  '**/.*password*',
]

/**
 * Curated dotfile recommendations with platform and category metadata.
 * @type {DotfileRecommendation[]}
 */
export const DEFAULT_FILE_LIST = [
  // Shell
  {
    path: '~/.zshrc',
    category: 'shell',
    platforms: ['macos', 'linux', 'wsl2'],
    autoEncrypt: false,
    description: 'Zsh configuration',
  },
  {
    path: '~/.bashrc',
    category: 'shell',
    platforms: ['linux', 'wsl2'],
    autoEncrypt: false,
    description: 'Bash configuration',
  },
  {
    path: '~/.bash_profile',
    category: 'shell',
    platforms: ['macos', 'linux', 'wsl2'],
    autoEncrypt: false,
    description: 'Bash profile',
  },
  {path: '~/.zprofile', category: 'shell', platforms: ['macos'], autoEncrypt: false, description: 'Zsh login profile'},
  {
    path: '~/.config/fish/config.fish',
    category: 'shell',
    platforms: ['macos', 'linux', 'wsl2'],
    autoEncrypt: false,
    description: 'Fish shell configuration',
  },
  // Git
  {
    path: '~/.gitconfig',
    category: 'git',
    platforms: ['macos', 'linux', 'wsl2'],
    autoEncrypt: false,
    description: 'Git global config',
  },
  {
    path: '~/.gitignore_global',
    category: 'git',
    platforms: ['macos', 'linux', 'wsl2'],
    autoEncrypt: false,
    description: 'Global gitignore patterns',
  },
  // Editor
  {
    path: '~/.vimrc',
    category: 'editor',
    platforms: ['macos', 'linux', 'wsl2'],
    autoEncrypt: false,
    description: 'Vim configuration',
  },
  {
    path: '~/.config/nvim/init.vim',
    category: 'editor',
    platforms: ['macos', 'linux', 'wsl2'],
    autoEncrypt: false,
    description: 'Neovim configuration',
  },
  {
    path: '~/.config/nvim/init.lua',
    category: 'editor',
    platforms: ['macos', 'linux', 'wsl2'],
    autoEncrypt: false,
    description: 'Neovim Lua configuration',
  },
  // Package / macOS-specific
  {
    path: '~/.Brewfile',
    category: 'package',
    platforms: ['macos'],
    autoEncrypt: false,
    description: 'Homebrew bundle file',
  },
  {
    path: '~/.config/nvim',
    category: 'editor',
    platforms: ['macos', 'linux', 'wsl2'],
    autoEncrypt: false,
    description: 'Neovim config directory',
  },
  // Security
  {
    path: '~/.ssh/config',
    category: 'security',
    platforms: ['macos', 'linux', 'wsl2'],
    autoEncrypt: true,
    description: 'SSH client configuration (auto-encrypted)',
  },
  {
    path: '~/.ssh/id_ed25519',
    category: 'security',
    platforms: ['macos', 'linux', 'wsl2'],
    autoEncrypt: true,
    description: 'SSH private key (auto-encrypted)',
  },
  {
    path: '~/.ssh/id_rsa',
    category: 'security',
    platforms: ['macos', 'linux', 'wsl2'],
    autoEncrypt: true,
    description: 'SSH RSA private key (auto-encrypted)',
  },
  {
    path: '~/.gnupg/pubring.kbx',
    category: 'security',
    platforms: ['macos', 'linux', 'wsl2'],
    autoEncrypt: true,
    description: 'GPG public keyring (auto-encrypted)',
  },
]

// ---------------------------------------------------------------------------
// T005: isChezmoiInstalled
// ---------------------------------------------------------------------------

/**
 * Check whether chezmoi is available in PATH.
 * @returns {Promise<boolean>}
 */
export async function isChezmoiInstalled() {
  const path = await which('chezmoi')
  return path !== null
}

// ---------------------------------------------------------------------------
// T006: getChezmoiConfig
// ---------------------------------------------------------------------------

/**
 * Retrieve chezmoi's current configuration as a parsed object.
 * Returns null if chezmoi is not initialised or the command fails.
 * @returns {Promise<Object|null>}
 */
export async function getChezmoiConfig() {
  const result = await exec('chezmoi', ['dump-config', '--format', 'json'])
  if (result.exitCode !== 0 || !result.stdout.trim()) return null
  try {
    return JSON.parse(result.stdout)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// T007: getManagedFiles
// ---------------------------------------------------------------------------

/**
 * List all files currently managed by chezmoi with encryption metadata.
 * Uses `chezmoi managed --format json --path-style all` to get both target
 * and source paths, then inspects source path for `encrypted_` prefix.
 * @returns {Promise<DotfileEntry[]>}
 */
export async function getManagedFiles() {
  const result = await exec('chezmoi', ['managed', '--format', 'json', '--path-style', 'all'])
  if (result.exitCode !== 0 || !result.stdout.trim()) return []

  let raw
  try {
    raw = JSON.parse(result.stdout)
  } catch {
    return []
  }

  // chezmoi returns an array of objects: { targetPath, sourcePath, sourceRelPath, type }
  if (!Array.isArray(raw)) return []

  return raw.map((entry) => {
    const sourcePath = entry.sourcePath ?? entry.sourceRelPath ?? ''
    const basename = sourcePath.split('/').at(-1) ?? ''
    const parentDir = sourcePath.split('/').slice(-2, -1)[0] ?? ''
    const encrypted = basename.startsWith('encrypted_') || parentDir.startsWith('encrypted_')
    return {
      path: entry.targetPath ?? entry.path ?? '',
      sourcePath,
      encrypted,
      type: /** @type {'file'|'dir'|'symlink'} */ (entry.type ?? 'file'),
    }
  })
}

// ---------------------------------------------------------------------------
// T008: isPathSensitive
// ---------------------------------------------------------------------------

/**
 * Expand a tilde-prefixed path to absolute.
 * @param {string} p
 * @returns {string}
 */
function expandTilde(p) {
  if (p.startsWith('~/') || p === '~') {
    return join(homedir(), p.slice(2))
  }
  return p
}

/**
 * Convert a simple glob pattern (supporting `*`, `**`, `?`) to a RegExp.
 * Handles tilde expansion. Case-insensitive.
 * @param {string} pattern
 * @returns {RegExp}
 */
function globToRegex(pattern) {
  const expanded = expandTilde(pattern)
  // Split on `**` to handle double-star separately
  const parts = expanded.split('**')
  const escaped = parts.map(
    (part) =>
      part
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex special chars
        .replace(/\*/g, '[^/]*') // single * → any non-separator
        .replace(/\?/g, '[^/]'), // ? → any single non-separator char
  )
  const src = escaped.join('.*') // ** → match anything including /
  return new RegExp(`^${src}$`, 'i')
}

/**
 * Check whether a file path matches any sensitive glob pattern.
 * Both tilde and absolute paths are supported.
 * @param {string} filePath
 * @param {string[]} patterns
 * @returns {boolean}
 */
export function isPathSensitive(filePath, patterns) {
  const absPath = expandTilde(filePath)
  for (const pattern of patterns) {
    if (globToRegex(pattern).test(absPath)) return true
    // Also test the original (non-expanded) path for patterns without tilde
    if (globToRegex(pattern).test(filePath)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// T009: isWSLWindowsPath
// ---------------------------------------------------------------------------

/**
 * Detect if a file path is on a Windows filesystem mount under WSL2.
 * Paths like /mnt/c/Users/... are Windows mounts and cannot be managed
 * by chezmoi (they live outside $HOME on the Linux side).
 * @param {string} filePath
 * @returns {boolean}
 */
export function isWSLWindowsPath(filePath) {
  return /^\/mnt\/[a-z]\//i.test(filePath)
}

// ---------------------------------------------------------------------------
// T010: getDefaultFileList
// ---------------------------------------------------------------------------

/**
 * Return the curated list of recommended dotfiles filtered for a given platform.
 * @param {Platform} platform
 * @returns {DotfileRecommendation[]}
 */
export function getDefaultFileList(platform) {
  return DEFAULT_FILE_LIST.filter((f) => f.platforms.includes(platform))
}

// ---------------------------------------------------------------------------
// T011: getSensitivePatterns
// ---------------------------------------------------------------------------

/**
 * Merge hardcoded sensitive patterns with any user-configured custom patterns.
 * @param {CLIConfig} config
 * @returns {string[]}
 */
export function getSensitivePatterns(config) {
  const custom = config.dotfiles?.customSensitivePatterns ?? []
  return [...SENSITIVE_PATTERNS, ...custom]
}

// ---------------------------------------------------------------------------
// T017: buildSetupSteps
// ---------------------------------------------------------------------------

/**
 * Build an ordered list of setup steps for chezmoi initialisation with age encryption.
 * Pure function — all side effects are in the `run()` closures.
 * @param {Platform} platform
 * @param {{ existingConfig?: Object|null, ageKeyPath?: string }} [options]
 * @returns {SetupStep[]}
 */
export function buildSetupSteps(platform, options = {}) {
  const ageKeyPath = options.ageKeyPath ?? join(homedir(), '.config', 'chezmoi', 'key.txt')
  const chezmoiConfigDir = join(homedir(), '.config', 'chezmoi')

  /** @type {SetupStep[]} */
  const steps = []

  // Step 1: Check chezmoi is installed
  steps.push({
    id: 'check-chezmoi',
    label: 'Check chezmoi installation',
    toolId: 'chezmoi',
    type: 'check',
    requiresConfirmation: false,
    run: async () => {
      const installed = await isChezmoiInstalled()
      if (!installed) {
        const hint =
          platform === 'macos'
            ? 'Run `brew install chezmoi` or visit https://chezmoi.io/install'
            : 'Run `sh -c "$(curl -fsLS get.chezmoi.io)"` or visit https://chezmoi.io/install'
        return {status: 'failed', hint}
      }
      const result = await exec('chezmoi', ['--version'])
      const version = (result.stdout || result.stderr).trim()
      return {status: 'success', message: `chezmoi ${version}`}
    },
  })

  // Step 2: Check for existing config
  steps.push({
    id: 'check-existing-config',
    label: 'Check existing chezmoi configuration',
    toolId: 'chezmoi',
    type: 'check',
    requiresConfirmation: false,
    run: async () => {
      const config = options.existingConfig !== undefined ? options.existingConfig : await getChezmoiConfig()
      if (!config) {
        return {status: 'success', message: 'No existing configuration — fresh setup'}
      }
      const hasEncryption = config.encryption?.tool === 'age' || !!config.age?.identity
      if (hasEncryption) {
        return {status: 'skipped', message: 'Age encryption already configured'}
      }
      return {status: 'success', message: 'Existing config found without encryption — will add age'}
    },
  })

  // Step 3: Generate age key pair
  steps.push({
    id: 'generate-age-key',
    label: 'Generate age encryption key pair',
    toolId: 'chezmoi',
    type: 'configure',
    requiresConfirmation: true,
    run: async () => {
      // Skip if key already exists
      if (existsSync(ageKeyPath)) {
        return {status: 'skipped', message: `Age key already exists at ${ageKeyPath}`}
      }
      try {
        // chezmoi uses `age-keygen` via its own embedded command
        await execOrThrow('chezmoi', ['age', 'keygen', '-o', ageKeyPath])
        return {status: 'success', message: `Age key generated at ${ageKeyPath}`}
      } catch {
        // Fallback: try standalone age-keygen
        try {
          // age-keygen writes public key to stderr, private key to file
          await execOrThrow('age-keygen', ['-o', ageKeyPath])
          return {status: 'success', message: `Age key generated at ${ageKeyPath}`}
        } catch {
          return {
            status: 'failed',
            hint: 'Failed to generate age encryption key. Verify chezmoi is properly installed: `chezmoi doctor`',
          }
        }
      }
    },
  })

  // Step 4: Configure chezmoi.toml with age encryption
  steps.push({
    id: 'configure-encryption',
    label: 'Configure chezmoi with age encryption',
    toolId: 'chezmoi',
    type: 'configure',
    requiresConfirmation: true,
    run: async () => {
      try {
        // Read the public key from the key file (age-keygen outputs "# public key: age1..." as comment)
        const keyResult = await exec('cat', [ageKeyPath])
        const pubKeyMatch = keyResult.stdout.match(/# public key: (age1[a-z0-9]+)/i)
        const publicKey = pubKeyMatch?.[1] ?? null

        // Write chezmoi.toml
        const configPath = join(chezmoiConfigDir, 'chezmoi.toml')
        const tomlContent = [
          '[age]',
          `  identity = "${ageKeyPath}"`,
          publicKey ? `  recipients = ["${publicKey}"]` : '',
          '',
          '[encryption]',
          '  tool = "age"',
          '',
        ]
          .filter((l) => l !== undefined)
          .join('\n')

        const {writeFile, mkdir} = await import('node:fs/promises')
        await mkdir(chezmoiConfigDir, {recursive: true})
        await writeFile(configPath, tomlContent, 'utf8')

        return {
          status: 'success',
          message: `chezmoi.toml written with age encryption${publicKey ? ` (public key: ${publicKey.slice(0, 16)}...)` : ''}`,
        }
      } catch (err) {
        return {
          status: 'failed',
          hint: `Failed to write chezmoi config: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    },
  })

  // Step 5: Init chezmoi source directory
  steps.push({
    id: 'init-chezmoi',
    label: 'Initialise chezmoi source directory',
    toolId: 'chezmoi',
    type: 'configure',
    requiresConfirmation: false,
    run: async () => {
      try {
        await execOrThrow('chezmoi', ['init'])
        const configResult = await getChezmoiConfig()
        const sourceDir = configResult?.sourceDir ?? configResult?.sourcePath ?? null
        return {status: 'success', message: sourceDir ? `Source dir: ${sourceDir}` : 'chezmoi initialised'}
      } catch {
        // init may fail if already initialised — that's ok
        const configResult = await getChezmoiConfig()
        if (configResult) {
          return {status: 'skipped', message: 'chezmoi already initialised'}
        }
        return {status: 'failed', hint: 'Run `chezmoi doctor` to diagnose init failure'}
      }
    },
  })

  // Step 6: Save dvmi config
  steps.push({
    id: 'save-dvmi-config',
    label: 'Enable dotfiles management in dvmi config',
    toolId: 'chezmoi',
    type: 'configure',
    requiresConfirmation: false,
    run: async () => {
      try {
        const config = await loadConfig()
        config.dotfiles = {...config.dotfiles, enabled: true}
        await saveConfig(config)
        return {status: 'success', message: 'dvmi config updated: dotfiles.enabled = true'}
      } catch (err) {
        return {
          status: 'failed',
          hint: `Failed to update dvmi config: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    },
  })

  return steps
}

// ---------------------------------------------------------------------------
// T018: setupChezmoiInline (for dvmi init integration)
// ---------------------------------------------------------------------------

/**
 * Minimal chezmoi setup flow suitable for embedding in `dvmi init`.
 * Does NOT do file tracking or remote setup.
 * @param {Platform} platform
 * @returns {Promise<DotfilesSetupResult>}
 */
export async function setupChezmoiInline(platform) {
  const ageKeyPath = join(homedir(), '.config', 'chezmoi', 'key.txt')
  const chezmoiConfigDir = join(homedir(), '.config', 'chezmoi')

  const chezmoiInstalled = await isChezmoiInstalled()
  if (!chezmoiInstalled) {
    return {
      platform,
      chezmoiInstalled: false,
      encryptionConfigured: false,
      sourceDir: null,
      publicKey: null,
      status: 'skipped',
      message: 'chezmoi not installed — run `dvmi dotfiles setup` after installing chezmoi',
    }
  }

  try {
    // Generate key if missing
    if (!existsSync(ageKeyPath)) {
      try {
        await execOrThrow('chezmoi', ['age', 'keygen', '-o', ageKeyPath])
      } catch {
        await execOrThrow('age-keygen', ['-o', ageKeyPath])
      }
    }

    // Extract public key
    const keyResult = await exec('cat', [ageKeyPath])
    const pubKeyMatch = keyResult.stdout.match(/# public key: (age1[a-z0-9]+)/i)
    const publicKey = pubKeyMatch?.[1] ?? null

    // Write chezmoi.toml
    const configPath = join(chezmoiConfigDir, 'chezmoi.toml')
    const tomlContent = [
      '[age]',
      `  identity = "${ageKeyPath}"`,
      publicKey ? `  recipients = ["${publicKey}"]` : '',
      '',
      '[encryption]',
      '  tool = "age"',
      '',
    ]
      .filter((l) => l !== undefined)
      .join('\n')

    const {writeFile, mkdir} = await import('node:fs/promises')
    await mkdir(chezmoiConfigDir, {recursive: true})
    await writeFile(configPath, tomlContent, 'utf8')

    // Init chezmoi
    await exec('chezmoi', ['init']).catch(() => null)

    // Get source dir
    const chezmoiConfig = await getChezmoiConfig()
    const sourceDir = chezmoiConfig?.sourceDir ?? chezmoiConfig?.sourcePath ?? null

    // Save dvmi config
    const dvmiConfig = await loadConfig()
    dvmiConfig.dotfiles = {...(dvmiConfig.dotfiles ?? {}), enabled: true}
    await saveConfig(dvmiConfig)

    return {
      platform,
      chezmoiInstalled: true,
      encryptionConfigured: true,
      sourceDir,
      publicKey,
      status: 'success',
      message: 'Chezmoi configured with age encryption',
    }
  } catch (err) {
    return {
      platform,
      chezmoiInstalled: true,
      encryptionConfigured: false,
      sourceDir: null,
      publicKey: null,
      status: 'failed',
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

// ---------------------------------------------------------------------------
// T025: buildAddSteps
// ---------------------------------------------------------------------------

/**
 * Build steps to add files to chezmoi management.
 * @param {{ path: string, encrypt: boolean }[]} files - Files to add with explicit encryption flag
 * @param {Platform} platform
 * @returns {SetupStep[]}
 */
export function buildAddSteps(files, platform) {
  /** @type {SetupStep[]} */
  const steps = []

  for (const file of files) {
    const absPath = expandTilde(file.path)
    steps.push({
      id: `add-${file.path.replace(/[^a-z0-9]/gi, '-')}`,
      label: `Add ${file.path}${file.encrypt ? ' (encrypted)' : ''}`,
      toolId: 'chezmoi',
      type: 'configure',
      requiresConfirmation: false,
      run: async () => {
        // V-001: file must exist
        if (!existsSync(absPath)) {
          return {status: 'skipped', message: `${file.path}: file not found`}
        }
        // V-002: WSL2 Windows path rejection
        if (platform === 'wsl2' && isWSLWindowsPath(absPath)) {
          return {
            status: 'failed',
            hint: `${file.path}: Windows filesystem paths not supported on WSL2. Use Linux-native paths (~/) instead.`,
          }
        }
        try {
          const args = ['add']
          if (file.encrypt) args.push('--encrypt')
          args.push(absPath)
          await execOrThrow('chezmoi', args)
          return {status: 'success', message: `${file.path} added${file.encrypt ? ' (encrypted)' : ''}`}
        } catch {
          return {
            status: 'failed',
            hint: `Failed to add ${file.path} to chezmoi. Run \`chezmoi doctor\` to verify your setup.`,
          }
        }
      },
    })
  }

  return steps
}

// ---------------------------------------------------------------------------
// T036: getChezmoiRemote
// ---------------------------------------------------------------------------

/**
 * Read the git remote URL configured in chezmoi's source directory.
 * @returns {Promise<string|null>}
 */
export async function getChezmoiRemote() {
  const result = await exec('chezmoi', ['git', '--', 'remote', 'get-url', 'origin'])
  if (result.exitCode !== 0 || !result.stdout.trim()) return null
  return result.stdout.trim()
}

// ---------------------------------------------------------------------------
// T037: hasLocalChanges
// ---------------------------------------------------------------------------

/**
 * Check whether there are uncommitted changes in the chezmoi source directory.
 * @returns {Promise<boolean>}
 */
export async function hasLocalChanges() {
  const result = await exec('chezmoi', ['git', '--', 'status', '--porcelain'])
  if (result.exitCode !== 0) return false
  return result.stdout.trim().length > 0
}

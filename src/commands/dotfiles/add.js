import { Command, Flags, Args } from '@oclif/core'
import ora from 'ora'
import chalk from 'chalk'
import { checkbox, confirm, input } from '@inquirer/prompts'
import { detectPlatform } from '../../services/platform.js'
import {
  isChezmoiInstalled,
  getManagedFiles,
  getDefaultFileList,
  getSensitivePatterns,
  isPathSensitive,
  isWSLWindowsPath,
} from '../../services/dotfiles.js'
import { loadConfig } from '../../services/config.js'
import { execOrThrow } from '../../services/shell.js'
import { formatDotfilesAdd } from '../../formatters/dotfiles.js'
import { DvmiError } from '../../utils/errors.js'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

/** @import { DotfilesAddResult } from '../../types.js' */

/**
 * Expand tilde to home directory.
 * @param {string} p
 * @returns {string}
 */
function expandTilde(p) {
  if (p.startsWith('~/') || p === '~') {
    return join(homedir(), p.slice(2))
  }
  return p
}

export default class DotfilesAdd extends Command {
  static description = 'Add dotfiles to chezmoi management with automatic encryption for sensitive files'

  static examples = [
    '<%= config.bin %> dotfiles add',
    '<%= config.bin %> dotfiles add ~/.zshrc',
    '<%= config.bin %> dotfiles add ~/.zshrc ~/.gitconfig',
    '<%= config.bin %> dotfiles add ~/.ssh/id_ed25519 --encrypt',
    '<%= config.bin %> dotfiles add --json ~/.zshrc',
  ]

  static enableJsonFlag = true

  static flags = {
    help: Flags.help({ char: 'h' }),
    encrypt: Flags.boolean({ char: 'e', description: 'Force encryption for all files being added', default: false }),
    'no-encrypt': Flags.boolean({ description: 'Disable auto-encryption (add all as plaintext)', default: false }),
  }

  static args = {
    files: Args.string({ description: 'File paths to add', required: false }),
  }

  // oclif does not support variadic args natively via Args.string for multiple values;
  // we'll parse extra args from this.argv
  static strict = false

  async run() {
    const { flags } = await this.parse(DotfilesAdd)
    const isJson = flags.json
    const forceEncrypt = flags.encrypt
    const forceNoEncrypt = flags['no-encrypt']

    // Collect file args from argv (strict=false allows extra positional args)
    const rawArgs = this.argv.filter((a) => !a.startsWith('-'))
    const fileArgs = rawArgs

    // Pre-checks
    const config = await loadConfig()
    if (!config.dotfiles?.enabled) {
      throw new DvmiError(
        'Chezmoi dotfiles management is not configured',
        'Run `dvmi dotfiles setup` first',
      )
    }

    const chezmoiInstalled = await isChezmoiInstalled()
    if (!chezmoiInstalled) {
      const platformInfo = await detectPlatform()
      const hint = platformInfo.platform === 'macos'
        ? 'Run `brew install chezmoi` or visit https://chezmoi.io/install'
        : 'Run `sh -c "$(curl -fsLS get.chezmoi.io)"` or visit https://chezmoi.io/install'
      throw new DvmiError('chezmoi is not installed', hint)
    }

    const platformInfo = await detectPlatform()
    const { platform } = platformInfo
    const sensitivePatterns = getSensitivePatterns(config)

    // Get already-managed files for V-007 check
    const managedFiles = await getManagedFiles()
    const managedPaths = new Set(managedFiles.map((f) => f.path))

    /** @type {DotfilesAddResult} */
    const result = { added: [], skipped: [], rejected: [] }

    if (fileArgs.length > 0) {
      // Direct mode — files provided as arguments
      for (const rawPath of fileArgs) {
        const absPath = expandTilde(rawPath)
        const displayPath = rawPath

        // V-002: WSL2 Windows path rejection
        if (platform === 'wsl2' && isWSLWindowsPath(absPath)) {
          result.rejected.push({ path: displayPath, reason: 'Windows filesystem paths not supported on WSL2. Use Linux-native paths (~/) instead.' })
          continue
        }

        // V-001: file must exist
        if (!existsSync(absPath)) {
          result.skipped.push({ path: displayPath, reason: 'File not found' })
          continue
        }

        // V-007: not already managed
        if (managedPaths.has(absPath)) {
          result.skipped.push({ path: displayPath, reason: 'Already managed by chezmoi' })
          continue
        }

        // Determine encryption
        let encrypt = false
        if (forceEncrypt) {
          encrypt = true
        } else if (forceNoEncrypt) {
          encrypt = false
        } else {
          encrypt = isPathSensitive(rawPath, sensitivePatterns)
        }

        try {
          const args = ['add']
          if (encrypt) args.push('--encrypt')
          args.push(absPath)
          await execOrThrow('chezmoi', args)
          result.added.push({ path: displayPath, encrypted: encrypt })
        } catch {
          result.skipped.push({ path: displayPath, reason: `Failed to add to chezmoi. Run \`chezmoi doctor\` to verify your setup.` })
        }
      }

      if (isJson) return result
      this.log(formatDotfilesAdd(result))
      return result
    }

    // Interactive mode — no file args
    if (isJson) {
      // In --json with no files: return empty result
      return result
    }

    // Non-interactive guard for interactive mode
    const isCI = process.env.CI === 'true'
    const isNonInteractive = !process.stdout.isTTY
    if (isCI || isNonInteractive) {
      this.error(
        'This command requires an interactive terminal (TTY) when no files are specified. Provide file paths as arguments or run with --json.',
        { exit: 1 },
      )
    }

    const spinner = ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Loading recommended files...') }).start()
    const recommended = getDefaultFileList(platform)
    spinner.stop()

    // Filter and build choices
    const choices = recommended.map((rec) => {
      const absPath = expandTilde(rec.path)
      const exists = existsSync(absPath)
      const alreadyManaged = managedPaths.has(absPath)
      const sensitive = rec.autoEncrypt || isPathSensitive(rec.path, sensitivePatterns)
      const encTag = sensitive ? chalk.dim(' (auto-encrypted)') : ''
      const statusTag = !exists ? chalk.dim(' (not found)') : alreadyManaged ? chalk.dim(' (already tracked)') : ''
      return {
        name: `${rec.path}${encTag}${statusTag} — ${rec.description}`,
        value: rec.path,
        checked: exists && !alreadyManaged,
        disabled: alreadyManaged ? 'already tracked' : false,
      }
    })

    const selected = await checkbox({
      message: 'Select files to add to chezmoi:',
      choices,
    })

    // Offer custom file
    const addCustom = await confirm({ message: 'Add a custom file path?', default: false })
    if (addCustom) {
      const customPath = await input({ message: 'Enter file path:' })
      if (customPath.trim()) selected.push(customPath.trim())
    }

    if (selected.length === 0) {
      this.log(chalk.dim('  No files selected.'))
      return result
    }

    const addSpinner = ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Adding files to chezmoi...') }).start()
    addSpinner.stop()

    for (const rawPath of selected) {
      const absPath = expandTilde(rawPath)

      if (platform === 'wsl2' && isWSLWindowsPath(absPath)) {
        result.rejected.push({ path: rawPath, reason: 'Windows filesystem paths not supported on WSL2' })
        continue
      }

      if (!existsSync(absPath)) {
        result.skipped.push({ path: rawPath, reason: 'File not found' })
        continue
      }

      if (managedPaths.has(absPath)) {
        result.skipped.push({ path: rawPath, reason: 'Already managed by chezmoi' })
        continue
      }

      let encrypt = false
      if (forceEncrypt) {
        encrypt = true
      } else if (forceNoEncrypt) {
        encrypt = false
      } else {
        encrypt = isPathSensitive(rawPath, sensitivePatterns)
      }

      try {
        const args = ['add']
        if (encrypt) args.push('--encrypt')
        args.push(absPath)
        await execOrThrow('chezmoi', args)
        result.added.push({ path: rawPath, encrypted: encrypt })
      } catch {
        result.skipped.push({ path: rawPath, reason: `Failed to add. Run \`chezmoi doctor\` to verify your setup.` })
      }
    }

    this.log(formatDotfilesAdd(result))
    return result
  }
}

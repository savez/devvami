import {Command, Flags} from '@oclif/core'
import ora from 'ora'
import chalk from 'chalk'
import {detectPlatform} from '../../services/platform.js'
import {isChezmoiInstalled, getChezmoiConfig, getManagedFiles, getChezmoiRemote} from '../../services/dotfiles.js'
import {loadConfig} from '../../services/config.js'
import {formatDotfilesStatus} from '../../formatters/dotfiles.js'
import {DvmiError} from '../../utils/errors.js'

/** @import { DotfilesStatusResult } from '../../types.js' */

export default class DotfilesStatus extends Command {
  static description = 'Show chezmoi dotfiles status: managed files, encryption state, and sync health'

  static examples = ['<%= config.bin %> dotfiles status', '<%= config.bin %> dotfiles status --json']

  static enableJsonFlag = true

  static flags = {
    help: Flags.help({char: 'h'}),
  }

  async run() {
    const {flags} = await this.parse(DotfilesStatus)
    const isJson = flags.json

    const platformInfo = await detectPlatform()
    const {platform} = platformInfo

    const config = await loadConfig()
    const enabled = config.dotfiles?.enabled === true

    // Check chezmoi installation (even for not-configured state)
    const chezmoiInstalled = await isChezmoiInstalled()

    // Not configured state — valid, not an error
    if (!enabled) {
      /** @type {DotfilesStatusResult} */
      const notConfiguredResult = {
        platform,
        enabled: false,
        chezmoiInstalled,
        encryptionConfigured: false,
        repo: null,
        sourceDir: null,
        files: [],
        summary: {total: 0, encrypted: 0, plaintext: 0},
      }

      if (isJson) return notConfiguredResult
      this.log(formatDotfilesStatus(notConfiguredResult))
      return notConfiguredResult
    }

    if (!chezmoiInstalled) {
      const hint =
        platform === 'macos'
          ? 'Run `brew install chezmoi` or visit https://chezmoi.io/install'
          : 'Run `sh -c "$(curl -fsLS get.chezmoi.io)"` or visit https://chezmoi.io/install'
      throw new DvmiError('chezmoi is not installed', hint)
    }

    // Gather data
    const spinner = isJson
      ? null
      : ora({spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Gathering dotfiles status...')}).start()

    const [chezmoiConfig, files, remote] = await Promise.all([
      getChezmoiConfig(),
      getManagedFiles(),
      getChezmoiRemote(),
    ])

    spinner?.stop()

    const encryptionConfigured = chezmoiConfig?.encryption?.tool === 'age' || !!chezmoiConfig?.age?.identity
    const sourceDir = chezmoiConfig?.sourceDir ?? chezmoiConfig?.sourcePath ?? null
    const repo = config.dotfiles?.repo ?? remote

    const encryptedCount = files.filter((f) => f.encrypted).length
    const plaintextCount = files.length - encryptedCount

    /** @type {DotfilesStatusResult} */
    const result = {
      platform,
      enabled: true,
      chezmoiInstalled: true,
      encryptionConfigured,
      repo: repo ?? null,
      sourceDir,
      files,
      summary: {
        total: files.length,
        encrypted: encryptedCount,
        plaintext: plaintextCount,
      },
    }

    if (isJson) return result
    this.log(formatDotfilesStatus(result))
    return result
  }
}

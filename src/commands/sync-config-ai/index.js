import {Command, Flags} from '@oclif/core'
import ora from 'ora'

import {scanEnvironments, computeCategoryCounts} from '../../services/ai-env-scanner.js'
import {
  loadAIConfig,
  addEntry,
  updateEntry,
  deactivateEntry,
  activateEntry,
  deleteEntry,
} from '../../services/ai-config-store.js'
import {deployEntry, undeployEntry, reconcileOnScan} from '../../services/ai-env-deployer.js'
import {loadConfig} from '../../services/config.js'
import {formatEnvironmentsTable, formatCategoriesTable} from '../../formatters/ai-config.js'
import {startTabTUI} from '../../utils/tui/tab-tui.js'
import {DvmiError} from '../../utils/errors.js'

/** @import { DetectedEnvironment, CategoryEntry } from '../../types.js' */

export default class SyncConfigAi extends Command {
  static description = 'Manage AI coding tool configurations across environments via TUI'

  static examples = ['<%= config.bin %> sync-config-ai', '<%= config.bin %> sync-config-ai --json']

  static enableJsonFlag = true

  static flags = {
    help: Flags.help({char: 'h'}),
  }

  async run() {
    const {flags} = await this.parse(SyncConfigAi)
    const isJson = flags.json

    // ── Scan environments ────────────────────────────────────────────────────
    const spinner = isJson ? null : ora('Scanning AI coding environments…').start()
    let detectedEnvs

    try {
      detectedEnvs = scanEnvironments(process.cwd())
    } catch (err) {
      spinner?.fail('Scan failed')
      throw new DvmiError(
        'Failed to scan AI coding environments',
        err instanceof Error ? err.message : 'Check filesystem permissions',
      )
    }

    // ── Load AI config store ─────────────────────────────────────────────────
    let store
    try {
      store = await loadAIConfig()
    } catch {
      spinner?.fail('Failed to load AI config')
      throw new DvmiError(
        'AI config file is corrupted',
        'Delete `~/.config/dvmi/ai-config.json` to reset, or fix the JSON manually',
      )
    }

    // ── Reconcile: re-deploy/undeploy based on current environment detection ─
    if (detectedEnvs.length > 0 && store.entries.length > 0) {
      try {
        await reconcileOnScan(store.entries, detectedEnvs, process.cwd())
        // Reload store after reconciliation in case it mutated entries
        store = await loadAIConfig()
      } catch {
        // Reconciliation errors are non-fatal — continue with current state
      }
    }

    // ── Compute per-environment category counts ──────────────────────────────
    for (const env of detectedEnvs) {
      env.counts = computeCategoryCounts(env.id, store.entries)
    }

    spinner?.stop()

    // ── JSON mode ────────────────────────────────────────────────────────────
    if (isJson) {
      const categories = {
        mcp: store.entries.filter((e) => e.type === 'mcp'),
        command: store.entries.filter((e) => e.type === 'command'),
        skill: store.entries.filter((e) => e.type === 'skill'),
        agent: store.entries.filter((e) => e.type === 'agent'),
      }
      return {environments: detectedEnvs, categories}
    }

    // ── Check chezmoi config ─────────────────────────────────────────────────
    let chezmoiEnabled = false
    try {
      const cliConfig = await loadConfig()
      chezmoiEnabled = cliConfig.dotfiles?.enabled === true
    } catch {
      // Non-fatal — chezmoi tip will show
    }

    // ── Launch TUI ───────────────────────────────────────────────────────────
    await startTabTUI({
      envs: detectedEnvs,
      entries: store.entries,
      chezmoiEnabled,
      formatEnvs: formatEnvironmentsTable,
      formatCats: formatCategoriesTable,
      refreshEntries: async () => {
        const s = await loadAIConfig()
        return s.entries
      },
      onAction: async (action) => {
        // Reload current entries for each action to avoid stale data
        const currentStore = await loadAIConfig()

        if (action.type === 'create') {
          const created = await addEntry({
            name: action.values.name,
            type: action.tabKey || 'mcp',
            environments: action.values.environments || [],
            params: action.values,
          })
          await deployEntry(created, detectedEnvs, process.cwd())
        } else if (action.type === 'edit') {
          const updated = await updateEntry(action.id, {params: action.values})
          await deployEntry(updated, detectedEnvs, process.cwd())
        } else if (action.type === 'delete') {
          await deleteEntry(action.id)
          await undeployEntry(
            currentStore.entries.find((e) => e.id === action.id),
            detectedEnvs,
            process.cwd(),
          )
        } else if (action.type === 'deactivate') {
          const entry = await deactivateEntry(action.id)
          await undeployEntry(entry, detectedEnvs, process.cwd())
        } else if (action.type === 'activate') {
          const entry = await activateEntry(action.id)
          await deployEntry(entry, detectedEnvs, process.cwd())
        }
      },
    })
  }
}

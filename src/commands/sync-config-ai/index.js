import {Command, Flags} from '@oclif/core'
import ora from 'ora'

import {scanEnvironments, computeCategoryCounts, parseNativeEntries, detectDrift, ENVIRONMENTS} from '../../services/ai-env-scanner.js'
import {
  loadAIConfig,
  addEntry,
  updateEntry,
  deactivateEntry,
  activateEntry,
  deleteEntry,
  syncAIConfigToChezmoi,
} from '../../services/ai-config-store.js'
import {deployEntry, undeployEntry, reconcileOnScan} from '../../services/ai-env-deployer.js'
import {loadConfig} from '../../services/config.js'
import {formatEnvironmentsTable, formatCategoriesTable, formatNativeEntriesTable} from '../../formatters/ai-config.js'
import {startTabTUI} from '../../utils/tui/tab-tui.js'
import {DvmiError} from '../../utils/errors.js'

/** @import { DetectedEnvironment, CategoryEntry, MCPParams } from '../../types.js' */

/**
 * Extract only MCPParams-relevant fields from raw form values.
 * Parses args (editor newline-joined) into string[] and env vars (KEY=VALUE lines) into Record.
 * @param {Record<string, unknown>} values - Raw form output from extractValues
 * @returns {MCPParams}
 */
function buildMCPParams(values) {
  /** @type {MCPParams} */
  const params = {transport: /** @type {'stdio'|'sse'|'streamable-http'} */ (values.transport)}

  if (params.transport === 'stdio') {
    if (values.command) params.command = /** @type {string} */ (values.command)
    // Args: editor field → newline-joined string → split into array
    if (values.args && typeof values.args === 'string') {
      const arr = /** @type {string} */ (values.args).split('\n').map((a) => a.trim()).filter(Boolean)
      if (arr.length > 0) params.args = arr
    } else if (Array.isArray(values.args) && values.args.length > 0) {
      params.args = values.args
    }
  } else {
    if (values.url) params.url = /** @type {string} */ (values.url)
  }

  // Env vars: editor field → newline-joined KEY=VALUE string → parse into Record.
  // Env vars apply to ALL transports (e.g. API keys for remote servers too).
  if (values.env && typeof values.env === 'string') {
    /** @type {Record<string, string>} */
    const envObj = {}
    for (const line of /** @type {string} */ (values.env).split('\n')) {
      const t = line.trim()
      if (!t) continue
      const eq = t.indexOf('=')
      if (eq > 0) envObj[t.slice(0, eq)] = t.slice(eq + 1)
    }
    if (Object.keys(envObj).length > 0) params.env = envObj
  } else if (values.env && typeof values.env === 'object' && !Array.isArray(values.env)) {
    params.env = /** @type {Record<string, string>} */ (values.env)
  }

  return params
}

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

    // ── Parse native entries and populate nativeCounts ───────────────────────
    const envDefMap = new Map(ENVIRONMENTS.map((e) => [e.id, e]))
    for (const env of detectedEnvs) {
      const envDef = envDefMap.get(env.id)
      if (!envDef) continue
      const natives = parseNativeEntries(envDef, process.cwd(), store.entries)
      env.nativeEntries = natives
      // Aggregate native counts per category
      env.nativeCounts = {mcp: 0, command: 0, rule: 0, skill: 0, agent: 0}
      for (const ne of natives) {
        env.nativeCounts[ne.type] = (env.nativeCounts[ne.type] ?? 0) + 1
      }
    }

    // ── Detect drift for managed entries ────────────────────────────────────
    const driftInfos = detectDrift(detectedEnvs, store.entries, process.cwd())
    for (const env of detectedEnvs) {
      env.driftedEntries = driftInfos.filter((d) => d.environmentId === env.id)
    }

    spinner?.stop()

    // ── JSON mode ────────────────────────────────────────────────────────────
    if (isJson) {
      if (detectedEnvs.length === 0) {
        this.exit(2)
      }

      // Collect all native entries grouped by type
      const allNatives = detectedEnvs.flatMap((e) => e.nativeEntries ?? [])

      // Build drifted set for quick lookup
      const driftedIds = new Set(driftInfos.map((d) => d.entryId))

      const categories = {
        mcp: store.entries.filter((e) => e.type === 'mcp').map((e) => ({...e, drifted: driftedIds.has(e.id)})),
        command: store.entries.filter((e) => e.type === 'command').map((e) => ({...e, drifted: driftedIds.has(e.id)})),
        rule: store.entries.filter((e) => e.type === 'rule').map((e) => ({...e, drifted: driftedIds.has(e.id)})),
        skill: store.entries.filter((e) => e.type === 'skill').map((e) => ({...e, drifted: driftedIds.has(e.id)})),
        agent: store.entries.filter((e) => e.type === 'agent').map((e) => ({...e, drifted: driftedIds.has(e.id)})),
      }

      const nativeEntries = {
        mcp: allNatives.filter((e) => e.type === 'mcp'),
        command: allNatives.filter((e) => e.type === 'command'),
        rule: allNatives.filter((e) => e.type === 'rule'),
        skill: allNatives.filter((e) => e.type === 'skill'),
        agent: allNatives.filter((e) => e.type === 'agent'),
      }

      return {environments: detectedEnvs, categories, nativeEntries}
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
      formatNative: formatNativeEntriesTable,
      refreshEntries: async () => {
        const s = await loadAIConfig()
        return s.entries
      },
      onAction: async (action) => {
        // Reload current entries for each action to avoid stale data
        const currentStore = await loadAIConfig()

        if (action.type === 'create') {
          const isMCP = action.tabKey === 'mcp'
          const created = await addEntry({
            name: action.values.name,
            type: action.tabKey || 'mcp',
            environments: action.values.environments || [],
            params: isMCP ? buildMCPParams(action.values) : action.values,
          })
          await deployEntry(created, detectedEnvs, process.cwd())
          await syncAIConfigToChezmoi()
        } else if (action.type === 'edit') {
          const entry = currentStore.entries.find((e) => e.id === action.id)
          const isMCP = entry?.type === 'mcp'
          const updated = await updateEntry(action.id, {params: isMCP ? buildMCPParams(action.values) : action.values})
          await deployEntry(updated, detectedEnvs, process.cwd())
          await syncAIConfigToChezmoi()
        } else if (action.type === 'delete') {
          await deleteEntry(action.id)
          await undeployEntry(
            currentStore.entries.find((e) => e.id === action.id),
            detectedEnvs,
            process.cwd(),
          )
          await syncAIConfigToChezmoi()
        } else if (action.type === 'deactivate') {
          const entry = await deactivateEntry(action.id)
          await undeployEntry(entry, detectedEnvs, process.cwd())
          await syncAIConfigToChezmoi()
        } else if (action.type === 'activate') {
          const entry = await activateEntry(action.id)
          await deployEntry(entry, detectedEnvs, process.cwd())
          await syncAIConfigToChezmoi()
        } else if (action.type === 'import-native') {
          // T017: Import native entry into dvmi-managed sync
          const ne = action.nativeEntry
          const created = await addEntry({
            name: ne.name,
            type: ne.type,
            environments: [ne.environmentId],
            params: ne.params,
          })
          await deployEntry(created, detectedEnvs, process.cwd())
          await syncAIConfigToChezmoi()
        } else if (action.type === 'redeploy') {
          // T018: Re-deploy managed entry to overwrite drifted file
          const entry = currentStore.entries.find((e) => e.id === action.id)
          if (entry) await deployEntry(entry, detectedEnvs, process.cwd())
        } else if (action.type === 'accept-drift') {
          // T018: Accept drift — update store params from the actual file state
          const drift = driftInfos.find((d) => d.entryId === action.id)
          if (drift) {
            await updateEntry(action.id, {params: drift.actual})
            await syncAIConfigToChezmoi()
          }
        }
      },
    })
  }
}

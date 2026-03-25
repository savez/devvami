import { Help } from '@oclif/core'
import chalk from 'chalk'
import { isColorEnabled } from './utils/gradient.js'
import { printBanner } from './utils/banner.js'

// ─── Brand palette (flat — no gradient on help rows) ────────────────────────
const ORANGE       = '#FF6B2B'
const LIGHT_ORANGE = '#FF9A5C'
const DIM_BLUE     = '#4A9EFF'
const DIM_GRAY     = '#888888'

// Strip ANSI escape codes
const ANSI_RE = /\x1B\[[0-?]*[ -/]*[@-~]/g
/**
 * @param {string} s
 * @returns {string}
 */
const strip = (s) => s.replace(ANSI_RE, '')

// ─── Category definitions ────────────────────────────────────────────────────

/** @typedef {{ id: string, hint?: string }} CmdEntry */
/** @typedef {{ title: string, cmds: CmdEntry[] }} Category */

/** @type {Category[]} */
const CATEGORIES = [
  {
    title: 'GitHub & Documentazione',
    cmds: [
      { id: 'repo:list',       hint: '[--language] [--search]' },
      { id: 'docs:read',       hint: '[FILE] [--repo] [--raw] [--render]' },
      { id: 'docs:list',       hint: '[--repo] [--search]' },
      { id: 'docs:search',     hint: '<TERM> [--repo]' },
      { id: 'docs:projects',   hint: '[--search]' },
      { id: 'create:repo',     hint: '[TEMPLATE] [--list] [--name]' },
      { id: 'search',          hint: '<QUERY>' },
      { id: 'open',            hint: '<TARGET>' },
    ],
  },
  {
    title: 'Pull Request',
    cmds: [
      { id: 'pr:create',  hint: '' },
      { id: 'pr:status',  hint: '' },
      { id: 'pr:detail',  hint: '<PR_NUMBER> --repo <owner/repo>' },
      { id: 'pr:review',  hint: '' },
    ],
  },
  {
    title: 'Pipeline & DevOps',
    cmds: [
      { id: 'pipeline:status', hint: '[--repo] [--branch]' },
      { id: 'pipeline:rerun',  hint: '<RUN_ID> --repo <repo>' },
      { id: 'pipeline:logs',   hint: '<RUN_ID> --repo <repo>' },
      { id: 'changelog',       hint: '' },
    ],
  },
  {
    title: 'Tasks (ClickUp)',
    cmds: [
      { id: 'tasks:list',  hint: '[--status] [--search]' },
      { id: 'tasks:today', hint: '' },
    ],
  },
  {
    title: 'Cloud & Costi',
    cmds: [
      { id: 'costs:get', hint: '[--period] [--profile]' },
    ],
  },
  {
    title: 'AI Prompts',
    cmds: [
      { id: 'prompts:list',           hint: '[--filter]' },
      { id: 'prompts:download',       hint: '<PATH> [--overwrite]' },
      { id: 'prompts:browse',         hint: '[--source] [--query] [--category]' },
      { id: 'prompts:install-speckit', hint: '[--force]' },
      { id: 'prompts:run',            hint: '[PATH] [--tool]' },
    ],
  },
  {
    title: 'Sicurezza & Credenziali',
    cmds: [
      { id: 'security:setup', hint: '[--json]' },
    ],
  },
  {
    title: 'Setup & Ambiente',
    cmds: [
      { id: 'init',       hint: '[--dry-run]' },
      { id: 'doctor',     hint: '' },
      { id: 'auth:login', hint: '' },
      { id: 'whoami',     hint: '' },
      { id: 'upgrade',    hint: '' },
    ],
  },
]

// ─── Example commands shown at bottom of root help ──────────────────────────
const EXAMPLES = [
   { cmd: 'dvmi prompts list',                                    note: 'Sfoglia prompt AI dal tuo repository' },
   { cmd: 'dvmi prompts list --filter refactor',                  note: 'Filtra prompt per parola chiave' },
   { cmd: 'dvmi prompts download coding/refactor-prompt.md',      note: 'Scarica un prompt localmente' },
   { cmd: 'dvmi prompts browse skills --query refactor',          note: 'Cerca skill su skills.sh' },
   { cmd: 'dvmi prompts browse awesome --category agents',        note: 'Sfoglia awesome-copilot agents' },
   { cmd: 'dvmi prompts run coding/refactor-prompt.md --tool opencode', note: 'Esegui un prompt con opencode' },
   { cmd: 'dvmi docs read',                                       note: 'Leggi il README del repo corrente' },
   { cmd: 'dvmi docs search "authentication"',                    note: 'Cerca nei docs del repo corrente' },
   { cmd: 'dvmi repo list --search "api"',                        note: 'Filtra repository per nome' },
   { cmd: 'dvmi pr status',                                       note: 'PR aperte e review in attesa' },
   { cmd: 'dvmi pipeline status',                                 note: 'Ultimi workflow CI/CD' },
   { cmd: 'dvmi tasks list --search "bug"',                       note: 'Cerca task ClickUp' },
   { cmd: 'dvmi costs get --json',                                note: 'Costi AWS in formato JSON' },
   { cmd: 'dvmi security setup --json',                          note: 'Controlla lo stato degli strumenti di sicurezza' },
   { cmd: 'dvmi security setup',                                 note: 'Wizard interattivo: installa aws-vault e GCM' },
 ]

// ─── Help class ─────────────────────────────────────────────────────────────

/**
 * Custom help class.
 * - showRootHelp: logo SNTG animato + layout comandi raggruppati per categoria
 * - formatTopic / formatCommand: colorizza flag, descrizioni e esempi
 * - Gradient solo sul logo; tutto il resto usa colori flat chalk
 */
export default class CustomHelp extends Help {

   /**
    * Root help override: banner animato → layout categorizzato.
    * Override di showRootHelp() (async) per evitare che formatRoot() (sync)
    * debba attendere la Promise del banner.
    * @returns {Promise<void>}
    */
   async showRootHelp() {
     // Animated logo — identical to `dvmi init` (no-ops in CI/non-TTY)
     await printBanner()
     this.log(this.#buildRootLayout())
   }

  /**
   * @param {import('@oclif/core').Interfaces.Topic[]} topics
   * @returns {string}
   */
  formatTopics(topics) {
    return this.#flatColorizeTopics(super.formatTopics(topics))
  }

  /**
   * @param {import('@oclif/core').Interfaces.Topic} topic
   * @param {import('@oclif/core').Command.Class[]} commands
   * @returns {string}
   */
  formatTopic(topic, commands) {
    return this.#colorizeRows(super.formatTopic(topic, commands))
  }

  /**
   * @param {import('@oclif/core').Command.Class} command
   * @returns {string}
   */
  formatCommand(command) {
    return this.#colorizeRows(super.formatCommand(command))
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Build the full categorized root help layout.
   * @returns {string}
   */
  #buildRootLayout() {
    /** @type {Map<string, import('@oclif/core').Command.Cached>} */
    const cmdMap = new Map(this.config.commands.map((c) => [c.id, c]))

    const lines = []

     // ── Usage ──────────────────────────────────────────────────────────────
     lines.push(this.#sectionHeader('USAGE'))
     lines.push(
       '  ' + (isColorEnabled ? chalk.hex(ORANGE).bold('dvmi') : 'dvmi') +
       chalk.dim(' <COMANDO> [FLAGS]\n'),
     )

    // ── Comandi per categoria ──────────────────────────────────────────────
    lines.push(this.#sectionHeader('COMMANDS'))

    for (const cat of CATEGORIES) {
      lines.push(
        '  ' + (isColorEnabled ? chalk.hex(ORANGE).bold(cat.title) : cat.title),
      )

      for (const entry of cat.cmds) {
        const cmd = cmdMap.get(entry.id)
        if (!cmd) continue

        const displayId = entry.id.replaceAll(':', ' ')
        const hint = entry.hint || ''
        const desc = cmd.summary ?? (typeof cmd.description === 'string'
          ? cmd.description.split('\n')[0]
          : '')

        // Left column (name + flags hint), right-padded to align descriptions
        const rawLeft = '    ' + displayId + (hint ? ' ' + hint : '')
        const pad = ' '.repeat(Math.max(2, 50 - rawLeft.length))

        const leftPart = isColorEnabled
          ? '    ' + chalk.hex(LIGHT_ORANGE).bold(displayId) +
            (hint ? ' ' + chalk.dim(hint) : '')
          : rawLeft

        lines.push(leftPart + pad + chalk.dim(desc))
      }

      lines.push('')
    }

    // ── Flag globali ───────────────────────────────────────────────────────
    lines.push(this.#sectionHeader('GLOBAL FLAGS'))
    lines.push(this.#flagLine('-h, --help',    'Mostra aiuto per un comando'))
    lines.push(this.#flagLine('    --json',    'Output in formato JSON strutturato'))
    lines.push(this.#flagLine('-v, --version', 'Versione installata'))
    lines.push('')

    // ── Esempi ─────────────────────────────────────────────────────────────
    lines.push(this.#sectionHeader('EXAMPLES'))

    const maxCmdLen = Math.max(...EXAMPLES.map((e) => e.cmd.length))
    for (const ex of EXAMPLES) {
      const pad = ' '.repeat(maxCmdLen - ex.cmd.length + 4)
       const sub = ex.cmd.replace(/^dvmi /, '')
       const formatted = isColorEnabled
         ? chalk.dim('$') + ' ' + chalk.hex(ORANGE).bold('dvmi') + ' ' +
           chalk.white(sub) + pad + chalk.hex(DIM_GRAY)(ex.note)
         : '$ ' + ex.cmd + pad + ex.note
      lines.push('  ' + formatted)
    }

     lines.push('')
     lines.push(
       '  ' + chalk.dim('Approfondisci:') + ' ' +
       chalk.hex(DIM_BLUE)('dvmi <COMANDO> --help') +
       chalk.dim('  ·  ') +
       chalk.hex(DIM_BLUE)('dvmi <TOPIC> --help') + '\n',
     )

    return lines.join('\n')
  }

  /**
   * @param {string} title
   * @returns {string}
   */
  #sectionHeader(title) {
    return isColorEnabled ? chalk.hex(ORANGE).bold(title) : title
  }

  /**
   * @param {string} flagStr
   * @param {string} desc
   * @returns {string}
   */
  #flagLine(flagStr, desc) {
    const pad = ' '.repeat(Math.max(2, 18 - flagStr.length))
    return isColorEnabled
      ? '  ' + chalk.hex(DIM_BLUE).bold(flagStr) + pad + chalk.dim(desc)
      : '  ' + flagStr + pad + desc
  }

  /**
   * Colorize topic list with flat orange names (no gradient).
   * @param {string} text
   * @returns {string}
   */
  #flatColorizeTopics(text) {
    return text
      .split('\n')
      .map((line) => {
        const plain = strip(line)
        if (!plain.trim()) return line

        const rowMatch = plain.match(/^(  )([a-z][\w-]*)(\s{2,})(.+)$/)
        if (rowMatch) {
          const [, indent, name, spaces, desc] = rowMatch
          return indent + chalk.hex(LIGHT_ORANGE).bold(name) + spaces + chalk.white(desc)
        }

        const subMatch = plain.match(/^(    )([a-z][\w -]*)(\s{2,})(.*)$/)
        if (subMatch) {
          const [, indent, name, spaces, desc] = subMatch
          return indent + chalk.hex(LIGHT_ORANGE)(name) + spaces + chalk.dim(desc)
        }

        return line
      })
      .join('\n')
  }

  /**
   * Colorize flag rows and command rows in individual command help pages.
   * @param {string} text
   * @returns {string}
   */
  #colorizeRows(text) {
    return text
      .split('\n')
      .map((line) => {
        const plain = strip(line)
        if (!plain.trim()) return line

         // Example lines: "$ dvmi …"
         if (plain.includes('$ dvmi') || plain.trim().startsWith('$ dvmi')) {
           return plain.replace(/\$ (dvmi\S*)/g, (_, cmd) =>
             '$ ' + chalk.hex(ORANGE).bold(cmd),
           )
         }

        // Flag rows: "--flag  desc" or "-f, --flag  desc"
        const flagMatch = plain.match(/^(\s{2,})((?:-\w,\s*)?--[\w-]+)(\s+)(.*)$/)
        if (flagMatch) {
          const [, indent, flags, spaces, desc] = flagMatch
          return indent + chalk.hex(DIM_BLUE).bold(flags) + spaces + chalk.dim(desc)
        }

        // Command/topic rows: "  name   description"
        const rowMatch = plain.match(/^(  )([a-z][\w:-]*)(\s{2,})(.+)$/)
        if (rowMatch) {
          const [, indent, name, spaces, desc] = rowMatch
          return indent + chalk.hex(LIGHT_ORANGE).bold(name) + spaces + chalk.white(desc)
        }

        return line
      })
      .join('\n')
  }
}

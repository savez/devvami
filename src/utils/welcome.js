import chalk from 'chalk'
import {printBanner} from './banner.js'
import {isColorEnabled} from './gradient.js'
import {typewriterLine} from './typewriter.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGGER = 150
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const out = (line) => process.stdout.write(line + '\n')
const nl = () => process.stdout.write('\n')

// ─── Color palette ────────────────────────────────────────────────────────────

const p = isColorEnabled
  ? {
      sep: (t) => chalk.hex('#4A9EFF').dim(t),
      cyan: (t) => chalk.hex('#00D4FF').bold(t),
      green: (t) => chalk.hex('#00FF88').bold(t),
      pink: (t) => chalk.hex('#FF3399').bold(t),
      gold: (t) => chalk.hex('#FFD700').bold(t),
      orange: (t) => chalk.hex('#FF6B2B').bold(t),
      blue: (t) => chalk.hex('#4A9EFF')(t),
      white: (t) => chalk.white(t),
      dim: (t) => chalk.dim(t),
    }
  : Object.fromEntries(
      ['sep', 'cyan', 'green', 'pink', 'gold', 'orange', 'blue', 'white', 'dim'].map((k) => [k, (t) => t]),
    )

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a ruler-style section header.
 * Example: "  🔐  SUPPLY CHAIN SECURITY ──────────────────────────────"
 * No right-side border: dashes trail right, no alignment required.
 *
 * @param {string} icon
 * @param {string} label
 * @param {(t: string) => string} colorFn
 * @returns {string}
 */
function ruler(icon, label, colorFn) {
  return colorFn(`  ${icon}  ${label} `) + p.sep('─'.repeat(40))
}

// ─── Welcome screen ───────────────────────────────────────────────────────────

/**
 * Print the full cyberpunk dvmi welcome screen.
 * Shows the animated DVMI logo followed by a styled mission dashboard.
 * Falls back to plain text in non-TTY / NO_COLOR / CI environments.
 *
 * @param {string} [version=''] - CLI version string (e.g. '2.1.0')
 * @returns {Promise<void>}
 */
export async function printWelcomeScreen(version = '') {
  // ── 1. Animated DVMI logo ──────────────────────────────────────────────────
  await printBanner()

  // ── 2. Badge line (typewriter with brand gradient) ─────────────────────────
  const versionTag = version ? `v${version}  ·  ` : ''
  await typewriterLine(`  ◆ Developer Mission Interface  ·  ${versionTag}Node >= 24`)

  // ── 3. Connection established ──────────────────────────────────────────────
  await delay(STAGGER)
  nl()
  out(p.sep('  ' + '─'.repeat(72)))
  nl()
  out(p.cyan('  LINK ESTABLISHED'))
  nl()
  out(p.white('  dvmi consolidates the operational surface of modern software delivery into'))
  out(p.white('  one deterministic CLI experience. Instead of context switching across browser'))
  out(p.white('  tabs, dashboards, and disconnected tools, you run critical workflows from a'))
  out(p.white('  single terminal interface: consistent output, predictable behavior, full control.'))

  // ── 4. Mission profile ─────────────────────────────────────────────────────
  await delay(STAGGER)
  nl()
  out(ruler('⚙️ ', 'MISSION PROFILE :: WHAT THIS CLI DOES', p.cyan))
  nl()
  const mission = [
    'discover and manage repositories across your GitHub organization',
    'handle pull requests with faster review and decision flow',
    'monitor CI/CD pipelines, inspect failures, rerun with intent',
    'query and read technical documentation without leaving the shell',
    'track execution priorities through task-oriented commands',
    'inspect cloud costs early, before budget drift becomes an incident',
  ]
  for (const line of mission) {
    out(p.dim('  -  ') + p.white(line))
  }

  // ── 5. Supply chain security ───────────────────────────────────────────────
  await delay(STAGGER)
  nl()
  out(ruler('🔐', "SUPPLY CHAIN SECURITY :: VERIFY, DON'T GUESS", p.green))
  nl()
  out(p.dim('  dvmi takes a security-first but pragmatic approach to software delivery:'))
  nl()
  const security = [
    'artifact integrity and provenance-aware delivery workflow',
    'dependency visibility with an SBOM mindset (SPDX / CycloneDX)',
    'continuous hygiene on dependency risk and secret exposure',
    'credential management via OS-native secure storage (keychain)',
    'less improvised shell procedures, more repeatable safe operations',
  ]
  for (const line of security) {
    out(p.green('  ▸  ') + p.white(line))
  }
  nl()
  out(p.dim('  Objective: reduce the risk surface without slowing down delivery.'))

  // ── 6. DevEx high-velocity ─────────────────────────────────────────────────
  await delay(STAGGER)
  nl()
  out(ruler('⚡', 'DEVEX HIGH-VELOCITY :: STAY IN FLOW', p.pink))
  nl()
  out(p.dim('  dvmi is designed to lower cognitive cost and keep you in flow:'))
  nl()
  const devex = [
    'less context switching between tools and dashboards',
    'less time spent hunting down "where did this break"',
    'faster "what is blocked / what is next" decision loops',
    'scriptable, composable output for automation and team workflows',
  ]
  for (const line of devex) {
    out(p.pink('  ▸  ') + p.white(line))
  }
  nl()
  out(p.dim('  No noise added. Operational signal only.'))

  // ── 7. Delivery reliability ────────────────────────────────────────────────
  await delay(STAGGER)
  nl()
  out(ruler('📡', 'DELIVERY RELIABILITY :: SHIP WITH CONTROL', p.orange))
  nl()
  out(p.white('  From PR readiness to pipeline health to release confidence,'))
  out(p.white('  dvmi moves teams from reactive debugging to proactive control.'))
  nl()
  out(p.white('  Reliability is treated as a habit, not a phase.'))

  // ── 8. Boot sequence ───────────────────────────────────────────────────────
  await delay(STAGGER)
  nl()
  out(ruler('🚀', 'BOOT SEQUENCE', p.gold))
  nl()

  /** @type {Array<[string, string]>} */
  const commands = [
    ['dvmi init', 'configure your workspace'],
    ['dvmi auth login', 'connect GitHub & ClickUp'],
    ['dvmi pr status', 'open pull requests'],
    ['dvmi pipeline status', 'CI/CD health check'],
    ['dvmi tasks today', 'focus mode: what to ship today'],
    ['dvmi costs get', 'AWS bill reality check'],
    ['dvmi doctor', 'diagnose config issues'],
  ]
  for (const [cmd, comment] of commands) {
    out('  ' + p.blue('$ ' + cmd.padEnd(24)) + p.dim('# ' + comment))
  }

  // ── 9. Closing ─────────────────────────────────────────────────────────────
  await delay(STAGGER)
  nl()
  out(p.sep('  ' + '─'.repeat(72)))
  nl()
  out(p.dim('  DVMI PROTOCOL: ') + p.cyan('Ship fast. Verify everything.'))
  nl()
}

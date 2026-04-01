import {existsSync} from 'node:fs'
import {resolve, join} from 'node:path'

/** @import { PackageEcosystem } from '../types.js' */

/**
 * Lock file detection entries in priority order.
 * For Node.js: pnpm > npm > yarn (only highest priority used).
 */
const LOCK_FILE_MAP = [
  {
    lockFile: 'pnpm-lock.yaml',
    name: 'pnpm',
    auditCommand: 'pnpm audit --json',
    builtIn: true,
    nodeGroup: true,
  },
  {
    lockFile: 'package-lock.json',
    name: 'npm',
    auditCommand: 'npm audit --json',
    builtIn: true,
    nodeGroup: true,
  },
  {
    lockFile: 'yarn.lock',
    name: 'yarn',
    auditCommand: 'yarn audit --json',
    builtIn: true,
    nodeGroup: true,
  },
  {
    lockFile: 'Pipfile.lock',
    name: 'pip',
    auditCommand: 'pip-audit -f json',
    builtIn: false,
    nodeGroup: false,
  },
  {
    lockFile: 'poetry.lock',
    name: 'pip',
    auditCommand: 'pip-audit -f json',
    builtIn: false,
    nodeGroup: false,
  },
  {
    lockFile: 'requirements.txt',
    name: 'pip',
    auditCommand: 'pip-audit -r requirements.txt -f json',
    builtIn: false,
    nodeGroup: false,
  },
  {
    lockFile: 'Cargo.lock',
    name: 'cargo',
    auditCommand: 'cargo audit --json',
    builtIn: false,
    nodeGroup: false,
  },
  {
    lockFile: 'Gemfile.lock',
    name: 'bundler',
    auditCommand: 'bundle-audit check --format json',
    builtIn: false,
    nodeGroup: false,
  },
  {
    lockFile: 'composer.lock',
    name: 'composer',
    auditCommand: 'composer audit --format json',
    builtIn: true,
    nodeGroup: false,
  },
]

/**
 * Detect package manager ecosystems present in a directory by scanning for lock files.
 * Node.js lock files are de-duplicated: only the highest-priority one is returned.
 *
 * @param {string} [dir] - Directory to scan (defaults to process.cwd())
 * @returns {PackageEcosystem[]}
 */
export function detectEcosystems(dir = process.cwd()) {
  const ecosystems = []
  let nodeDetected = false

  for (const entry of LOCK_FILE_MAP) {
    // Skip lower-priority Node.js lock files if one already detected
    if (entry.nodeGroup && nodeDetected) continue

    const lockFilePath = resolve(join(dir, entry.lockFile))
    if (existsSync(lockFilePath)) {
      ecosystems.push({
        name: entry.name,
        lockFile: entry.lockFile,
        lockFilePath,
        auditCommand: entry.auditCommand,
        builtIn: entry.builtIn,
      })
      if (entry.nodeGroup) nodeDetected = true
    }
  }

  return ecosystems
}

/**
 * Return the human-readable list of supported ecosystems for display in the "no package manager"
 * error message.
 * @returns {string}
 */
export function supportedEcosystemsMessage() {
  return [
    '  • Node.js (npm, pnpm, yarn) — requires lock file',
    '  • Python (pip-audit) — requires Pipfile.lock, poetry.lock, or requirements.txt',
    '  • Rust (cargo-audit) — requires Cargo.lock',
    '  • Ruby (bundler-audit) — requires Gemfile.lock',
    '  • PHP (composer) — requires composer.lock',
  ].join('\n')
}

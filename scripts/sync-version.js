#!/usr/bin/env node
/**
 * Syncs package.json version with the next semantic release version.
 *
 * Analyzes commits since the last git tag using the same release rules
 * defined in .releaserc.json — no GITHUB_TOKEN needed, pure git.
 *
 * Exit codes:
 *   0 — no version change needed (or already up-to-date)
 *   1 — package.json was updated (push aborted, commit the change first)
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'

// Must mirror .releaserc.json > releaseRules
const RELEASE_RULES = {
  feat: 'minor',
  fix: 'patch',
  perf: 'patch',
  revert: 'patch',
  refactor: 'patch',
  build: 'patch',
  security: 'patch',
}

const BUMP_PRIORITY = { major: 3, minor: 2, patch: 1 }

/**
 * Returns the latest git tag, or null if none exist.
 * @returns {string|null}
 */
function getLatestTag() {
  try {
    return execSync('git describe --tags --abbrev=0', {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .toString()
      .trim()
  } catch {
    return null
  }
}

/**
 * Returns all commit subjects+bodies since the given tag.
 * @param {string|null} tag
 * @returns {string[]}
 */
function getCommitsSinceTag(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  try {
    const raw = execSync(
      `git log ${range} --format=%s%n%b%n==END==`,
      { stdio: ['pipe', 'pipe', 'pipe'] },
    ).toString()

    return raw
      .split('==END==')
      .map((c) => c.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Determines the bump type (major/minor/patch/null) from commit messages.
 * @param {string[]} commits
 * @returns {'major'|'minor'|'patch'|null}
 */
function determineBump(commits) {
  let bump = null

  for (const msg of commits) {
    // BREAKING CHANGE in body or footer
    if (msg.includes('BREAKING CHANGE')) return 'major'
    // Breaking indicator in subject: feat!: or feat(scope)!:
    if (/^[a-z]+(\([^)]+\))?!:/.test(msg)) return 'major'

    const type = msg.match(/^([a-z]+)[\(!(:]/)?.[1]
    if (!type) continue

    const rule = RELEASE_RULES[type]
    if (!rule) continue

    if (!bump || BUMP_PRIORITY[rule] > BUMP_PRIORITY[bump]) {
      bump = rule
    }
  }

  return bump
}

/**
 * Increments a semver string by the given bump type.
 * @param {string} version - e.g. "1.1.0"
 * @param {'major'|'minor'|'patch'} bump
 * @returns {string}
 */
function incVersion(version, bump) {
  const [major, minor, patch] = version.replace(/^v/, '').split('.').map(Number)
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

// ─── Main ────────────────────────────────────────────────────────────────────

const latestTag = getLatestTag()

if (!latestTag) {
  console.log('sync-version: no git tags found, skipping.')
  process.exit(0)
}

const commits = getCommitsSinceTag(latestTag)

if (commits.length === 0) {
  console.log(`sync-version: no commits since ${latestTag}, skipping.`)
  process.exit(0)
}

const bump = determineBump(commits)

if (!bump) {
  console.log('sync-version: no releasable commits found, skipping.')
  process.exit(0)
}

const tagVersion = latestTag.replace(/^v/, '')
const nextVersion = incVersion(tagVersion, bump)

const pkgPath = new URL('../package.json', import.meta.url).pathname
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

if (pkg.version === nextVersion) {
  console.log(`sync-version: package.json already at ${nextVersion} ✓`)
  process.exit(0)
}

// Update package.json
pkg.version = nextVersion
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

// Stage the file automatically
execSync('git add package.json', { stdio: 'inherit' })

console.error(`
sync-version: version bumped ${tagVersion} → ${nextVersion} (${bump})

  package.json has been updated and staged.
  Commit it before pushing:

    git commit -m "chore(release): sync version to ${nextVersion}"

  Then push again.
`)

process.exit(1)

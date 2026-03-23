import { mkdir, readdir, readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Relative paths (from `.specify/`) that are installed by speckit.
 * Keys are the source sub-paths under `<sourceRoot>/.specify/`.
 * @type {string[]}
 */
const INSTALL_PATHS = [
  'templates',
  join('scripts', 'bash'),
]

/**
 * Check whether speckit is already initialised in the target directory.
 *
 * @param {string} targetDir - Absolute path to the target project root
 * @returns {Promise<boolean>} `true` if `.specify/` already exists
 */
export async function detectSpeckit(targetDir) {
  try {
    await access(join(targetDir, '.specify'))
    return true
  } catch {
    return false
  }
}

/**
 * Copy a directory tree recursively.
 *
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 * @returns {Promise<string[]>} List of created file paths
 */
async function copyDir(src, dest) {
  /** @type {string[]} */
  const created = []

  let entries
  try {
    entries = await readdir(src, { withFileTypes: true })
  } catch {
    // Source directory may not exist — skip silently
    return created
  }

  await mkdir(dest, { recursive: true })

  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)

    if (entry.isDirectory()) {
      const sub = await copyDir(srcPath, destPath)
      created.push(...sub)
    } else {
      const content = await readFile(srcPath)
      await writeFile(destPath, content)
      created.push(destPath)
    }
  }

  return created
}

/**
 * Install speckit into the target directory by copying the bundled `.specify/`
 * structure from the CLI package root.
 *
 * Creates:
 * - `<targetDir>/.specify/templates/`  (all template files)
 * - `<targetDir>/.specify/scripts/bash/` (all bash scripts)
 * - `<targetDir>/.specify/memory/constitution.md` (from constitution-template.md)
 *
 * @param {string} targetDir - Absolute path to the target project root
 * @param {string} sourceRoot - CLI package root (`this.config.root` in oclif)
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ created: string[] }>}
 * @throws {DvmiError} on permission or read errors
 */
export async function installSpeckit(targetDir, sourceRoot, opts = {}) {
  const specifySource = join(sourceRoot, '.specify')
  const specifyTarget = join(targetDir, '.specify')

  /** @type {string[]} */
  const created = []

  // Copy templates and scripts
  for (const subPath of INSTALL_PATHS) {
    const src = join(specifySource, subPath)
    const dest = join(specifyTarget, subPath)
    const files = await copyDir(src, dest)
    created.push(...files)
  }

  // Create memory/constitution.md from the template
  const templatePath = join(specifySource, 'templates', 'constitution-template.md')
  const constitutionDest = join(specifyTarget, 'memory', 'constitution.md')

  let templateContent
  try {
    templateContent = await readFile(templatePath, 'utf8')
  } catch {
    // Fallback: create a minimal constitution if template is missing
    templateContent = '# Project Constitution\n\nAdd your project guidelines here.\n'
  }

  await mkdir(join(specifyTarget, 'memory'), { recursive: true })

  // Only write if not already present (or if force)
  let shouldWrite = true
  if (!opts.force) {
    try {
      await access(constitutionDest)
      shouldWrite = false // already exists
    } catch {
      // does not exist — write it
    }
  }

  if (shouldWrite) {
    await writeFile(constitutionDest, templateContent, 'utf8')
    created.push(constitutionDest)
  }

  return { created }
}

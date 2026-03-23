import { describe, it, expect, vi, beforeEach } from 'vitest'
import { vol } from 'memfs'

// Redirect fs/promises to in-memory filesystem
vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs')
  return fs.promises
})

const SOURCE_ROOT = '/pkg'
const TARGET_DIR = '/project'

/** Seed the memfs volume with minimal speckit template files */
function seedSourceFiles() {
  vol.fromJSON({
    [`${SOURCE_ROOT}/.specify/templates/constitution-template.md`]: '# Constitution\nProject guidelines.\n',
    [`${SOURCE_ROOT}/.specify/templates/spec-template.md`]: '# Spec Template\n',
    [`${SOURCE_ROOT}/.specify/templates/plan-template.md`]: '# Plan Template\n',
    [`${SOURCE_ROOT}/.specify/scripts/bash/common.sh`]: '#!/bin/bash\n# common\n',
    [`${SOURCE_ROOT}/.specify/scripts/bash/create-new-feature.sh`]: '#!/bin/bash\n# create\n',
  })
}

describe('detectSpeckit', () => {
  beforeEach(() => vol.reset())

  it('returns false when .specify/ does not exist', async () => {
    vol.fromJSON({ [`${TARGET_DIR}/README.md`]: '# My Project\n' })

    const { detectSpeckit } = await import('../../../src/services/speckit.js')
    expect(await detectSpeckit(TARGET_DIR)).toBe(false)
  })

  it('returns true when .specify/ exists', async () => {
    vol.fromJSON({ [`${TARGET_DIR}/.specify/memory/constitution.md`]: '# Existing\n' })

    const { detectSpeckit } = await import('../../../src/services/speckit.js')
    expect(await detectSpeckit(TARGET_DIR)).toBe(true)
  })
})

describe('installSpeckit', () => {
  beforeEach(() => {
    vol.reset()
    seedSourceFiles()
  })

  it('creates template files at correct paths', async () => {
    const { installSpeckit } = await import('../../../src/services/speckit.js')
    const { created } = await installSpeckit(TARGET_DIR, SOURCE_ROOT)

    expect(created.length).toBeGreaterThan(0)
    // Verify at least templates directory was populated
    const paths = created.map((p) => p.replace(`${TARGET_DIR}/`, ''))
    expect(paths.some((p) => p.startsWith('.specify/templates/'))).toBe(true)
  })

  it('creates bash scripts at correct paths', async () => {
    const { installSpeckit } = await import('../../../src/services/speckit.js')
    const { created } = await installSpeckit(TARGET_DIR, SOURCE_ROOT)

    const paths = created.map((p) => p.replace(`${TARGET_DIR}/`, ''))
    expect(paths.some((p) => p.startsWith('.specify/scripts/bash/'))).toBe(true)
  })

  it('creates memory/constitution.md from constitution template', async () => {
    const { installSpeckit } = await import('../../../src/services/speckit.js')
    const { created } = await installSpeckit(TARGET_DIR, SOURCE_ROOT)

    const { fs } = await import('memfs')
    const constitutionPath = `${TARGET_DIR}/.specify/memory/constitution.md`
    expect(fs.existsSync(constitutionPath)).toBe(true)
    const content = fs.readFileSync(constitutionPath, 'utf8')
    expect(content).toContain('Constitution')
    expect(created).toContain(constitutionPath)
  })

  it('does not overwrite existing constitution.md without force', async () => {
    const { fs } = await import('memfs')
    // Pre-create constitution
    fs.mkdirSync(`${TARGET_DIR}/.specify/memory`, { recursive: true })
    fs.writeFileSync(`${TARGET_DIR}/.specify/memory/constitution.md`, 'existing constitution')

    const { installSpeckit } = await import('../../../src/services/speckit.js')
    const { created } = await installSpeckit(TARGET_DIR, SOURCE_ROOT)

    const content = fs.readFileSync(`${TARGET_DIR}/.specify/memory/constitution.md`, 'utf8')
    expect(content).toBe('existing constitution')
    expect(created).not.toContain(`${TARGET_DIR}/.specify/memory/constitution.md`)
  })

  it('overwrites existing constitution.md with force: true', async () => {
    const { fs } = await import('memfs')
    fs.mkdirSync(`${TARGET_DIR}/.specify/memory`, { recursive: true })
    fs.writeFileSync(`${TARGET_DIR}/.specify/memory/constitution.md`, 'old constitution')

    const { installSpeckit } = await import('../../../src/services/speckit.js')
    await installSpeckit(TARGET_DIR, SOURCE_ROOT, { force: true })

    const content = fs.readFileSync(`${TARGET_DIR}/.specify/memory/constitution.md`, 'utf8')
    expect(content).not.toBe('old constitution')
    expect(content).toContain('Constitution')
  })
})

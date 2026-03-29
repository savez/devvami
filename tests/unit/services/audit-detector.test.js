import { describe, it, expect, afterEach } from 'vitest'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

describe('detectEcosystems', () => {
  let tmpDir

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = undefined
    }
  })

  function makeTmpDir(...lockFiles) {
    tmpDir = join(tmpdir(), `dvmi-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })
    for (const f of lockFiles) {
      writeFileSync(join(tmpDir, f), '{}')
    }
    return tmpDir
  }

  it('returns empty array when no lock files are present', async () => {
    const dir = makeTmpDir()
    const { detectEcosystems } = await import('../../../src/services/audit-detector.js')
    expect(detectEcosystems(dir)).toHaveLength(0)
  })

  it('detects pnpm when pnpm-lock.yaml present', async () => {
    const dir = makeTmpDir('pnpm-lock.yaml')
    const { detectEcosystems } = await import('../../../src/services/audit-detector.js')
    const ecosystems = detectEcosystems(dir)
    expect(ecosystems).toHaveLength(1)
    expect(ecosystems[0].name).toBe('pnpm')
    expect(ecosystems[0].builtIn).toBe(true)
  })

  it('detects npm when package-lock.json present', async () => {
    const dir = makeTmpDir('package-lock.json')
    const { detectEcosystems } = await import('../../../src/services/audit-detector.js')
    const ecosystems = detectEcosystems(dir)
    expect(ecosystems).toHaveLength(1)
    expect(ecosystems[0].name).toBe('npm')
  })

  it('detects yarn when yarn.lock present', async () => {
    const dir = makeTmpDir('yarn.lock')
    const { detectEcosystems } = await import('../../../src/services/audit-detector.js')
    const ecosystems = detectEcosystems(dir)
    expect(ecosystems).toHaveLength(1)
    expect(ecosystems[0].name).toBe('yarn')
  })

  it('pnpm takes priority over npm and yarn when all three present', async () => {
    const dir = makeTmpDir('pnpm-lock.yaml', 'package-lock.json', 'yarn.lock')
    const { detectEcosystems } = await import('../../../src/services/audit-detector.js')
    const ecosystems = detectEcosystems(dir)
    // Only one Node.js ecosystem should be detected
    const nodeEcos = ecosystems.filter((e) => ['pnpm', 'npm', 'yarn'].includes(e.name))
    expect(nodeEcos).toHaveLength(1)
    expect(nodeEcos[0].name).toBe('pnpm')
  })

  it('npm takes priority over yarn when both present without pnpm', async () => {
    const dir = makeTmpDir('package-lock.json', 'yarn.lock')
    const { detectEcosystems } = await import('../../../src/services/audit-detector.js')
    const ecosystems = detectEcosystems(dir)
    const nodeEcos = ecosystems.filter((e) => ['npm', 'yarn'].includes(e.name))
    expect(nodeEcos).toHaveLength(1)
    expect(nodeEcos[0].name).toBe('npm')
  })

  it('detects cargo when Cargo.lock present', async () => {
    const dir = makeTmpDir('Cargo.lock')
    const { detectEcosystems } = await import('../../../src/services/audit-detector.js')
    const ecosystems = detectEcosystems(dir)
    expect(ecosystems.some((e) => e.name === 'cargo')).toBe(true)
  })

  it('detects multiple ecosystems simultaneously', async () => {
    const dir = makeTmpDir('pnpm-lock.yaml', 'Cargo.lock', 'Gemfile.lock')
    const { detectEcosystems } = await import('../../../src/services/audit-detector.js')
    const ecosystems = detectEcosystems(dir)
    expect(ecosystems).toHaveLength(3)
    const names = ecosystems.map((e) => e.name)
    expect(names).toContain('pnpm')
    expect(names).toContain('cargo')
    expect(names).toContain('bundler')
  })

  it('sets lockFilePath to an absolute path', async () => {
    const dir = makeTmpDir('pnpm-lock.yaml')
    const { detectEcosystems } = await import('../../../src/services/audit-detector.js')
    const ecosystems = detectEcosystems(dir)
    expect(ecosystems[0].lockFilePath).toBe(resolve(dir, 'pnpm-lock.yaml'))
  })

  it('detects pip with Pipfile.lock', async () => {
    const dir = makeTmpDir('Pipfile.lock')
    const { detectEcosystems } = await import('../../../src/services/audit-detector.js')
    const ecosystems = detectEcosystems(dir)
    expect(ecosystems.some((e) => e.name === 'pip')).toBe(true)
  })

  it('detects composer with composer.lock', async () => {
    const dir = makeTmpDir('composer.lock')
    const { detectEcosystems } = await import('../../../src/services/audit-detector.js')
    const ecosystems = detectEcosystems(dir)
    expect(ecosystems.some((e) => e.name === 'composer')).toBe(true)
  })
})

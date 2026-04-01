import {describe, it, expect, vi, beforeEach} from 'vitest'

// ── Mock shell.js ────────────────────────────────────────────────────────────
vi.mock('../../../src/services/shell.js', () => ({
  which: vi.fn(),
  exec: vi.fn(),
}))

// ── Mock execa ───────────────────────────────────────────────────────────────
vi.mock('execa', () => ({
  execa: vi.fn(),
}))

// ── Mock errors ──────────────────────────────────────────────────────────────
vi.mock('../../../src/utils/errors.js', async (importOriginal) => {
  return importOriginal()
})

describe('isUvInstalled', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns true when uv is found in PATH', async () => {
    const {which} = await import('../../../src/services/shell.js')
    vi.mocked(which).mockResolvedValue('/usr/local/bin/uv')

    const {isUvInstalled} = await import('../../../src/services/speckit.js')
    expect(await isUvInstalled()).toBe(true)
    expect(which).toHaveBeenCalledWith('uv')
  })

  it('returns false when uv is not found in PATH', async () => {
    const {which} = await import('../../../src/services/shell.js')
    vi.mocked(which).mockResolvedValue(null)

    const {isUvInstalled} = await import('../../../src/services/speckit.js')
    expect(await isUvInstalled()).toBe(false)
  })
})

describe('isSpecifyInstalled', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns true when specify is found in PATH', async () => {
    const {which} = await import('../../../src/services/shell.js')
    vi.mocked(which).mockResolvedValue('/usr/local/bin/specify')

    const {isSpecifyInstalled} = await import('../../../src/services/speckit.js')
    expect(await isSpecifyInstalled()).toBe(true)
    expect(which).toHaveBeenCalledWith('specify')
  })

  it('returns false when specify is not found', async () => {
    const {which} = await import('../../../src/services/shell.js')
    vi.mocked(which).mockResolvedValue(null)

    const {isSpecifyInstalled} = await import('../../../src/services/speckit.js')
    expect(await isSpecifyInstalled()).toBe(false)
  })
})

describe('installSpecifyCli', () => {
  beforeEach(() => vi.resetAllMocks())

  it('runs uv tool install with the correct arguments', async () => {
    const {exec} = await import('../../../src/services/shell.js')
    vi.mocked(exec).mockResolvedValue({stdout: 'Installed', stderr: '', exitCode: 0})

    const {installSpecifyCli} = await import('../../../src/services/speckit.js')
    const result = await installSpecifyCli()

    expect(exec).toHaveBeenCalledWith('uv', expect.arrayContaining(['tool', 'install', 'specify-cli', '--from']))
    expect(result.exitCode).toBe(0)
  })

  it('passes --force when opts.force is true', async () => {
    const {exec} = await import('../../../src/services/shell.js')
    vi.mocked(exec).mockResolvedValue({stdout: '', stderr: '', exitCode: 0})

    const {installSpecifyCli} = await import('../../../src/services/speckit.js')
    await installSpecifyCli({force: true})

    const args = vi.mocked(exec).mock.calls[0][1]
    expect(args).toContain('--force')
  })

  it('throws DvmiError when uv exits non-zero', async () => {
    const {exec} = await import('../../../src/services/shell.js')
    vi.mocked(exec).mockResolvedValue({stdout: '', stderr: 'error: package not found', exitCode: 1})

    const {installSpecifyCli} = await import('../../../src/services/speckit.js')
    const {DvmiError} = await import('../../../src/utils/errors.js')

    await expect(installSpecifyCli()).rejects.toBeInstanceOf(DvmiError)
  })
})

describe('runSpecifyInit', () => {
  beforeEach(() => vi.resetAllMocks())

  it('runs specify init --here in the given directory', async () => {
    const {execa} = await import('execa')
    vi.mocked(execa).mockResolvedValue({exitCode: 0})

    const {runSpecifyInit} = await import('../../../src/services/speckit.js')
    await runSpecifyInit('/my/project')

    expect(execa).toHaveBeenCalledWith(
      'specify',
      expect.arrayContaining(['init', '--here']),
      expect.objectContaining({cwd: '/my/project', stdio: 'inherit'}),
    )
  })

  it('passes --ai flag when provided', async () => {
    const {execa} = await import('execa')
    vi.mocked(execa).mockResolvedValue({exitCode: 0})

    const {runSpecifyInit} = await import('../../../src/services/speckit.js')
    await runSpecifyInit('/my/project', {ai: 'opencode'})

    const args = vi.mocked(execa).mock.calls[0][1]
    expect(args).toContain('--ai')
    expect(args).toContain('opencode')
  })

  it('passes --force flag when provided', async () => {
    const {execa} = await import('execa')
    vi.mocked(execa).mockResolvedValue({exitCode: 0})

    const {runSpecifyInit} = await import('../../../src/services/speckit.js')
    await runSpecifyInit('/my/project', {force: true})

    const args = vi.mocked(execa).mock.calls[0][1]
    expect(args).toContain('--force')
  })

  it('throws DvmiError when specify init exits non-zero', async () => {
    const {execa} = await import('execa')
    vi.mocked(execa).mockResolvedValue({exitCode: 1})

    const {runSpecifyInit} = await import('../../../src/services/speckit.js')
    const {DvmiError} = await import('../../../src/utils/errors.js')

    await expect(runSpecifyInit('/my/project')).rejects.toBeInstanceOf(DvmiError)
  })
})

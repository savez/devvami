import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/services/shell.js', () => ({
  exec: vi.fn(),
}))

describe('getPRDetail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('restituisce PRDetail con qaComments e qaSteps dal mock MSW', async () => {
    const { exec } = await import('../../src/services/shell.js')
    vi.mocked(exec).mockResolvedValue({ stdout: 'fake-gh-token', stderr: '', exitCode: 0 })

    const { getPRDetail } = await import('../../src/services/github.js')
    const detail = await getPRDetail('acme', 'my-api', 42)

    expect(detail.number).toBe(42)
    expect(detail.title).toBe('Feature: user auth')
    expect(detail.state).toBe('open')
    expect(detail.author).toBe('developer1')
    expect(detail.headBranch).toBe('feature/user-auth')
    expect(detail.baseBranch).toBe('main')
    expect(Array.isArray(detail.labels)).toBe(true)
    expect(Array.isArray(detail.reviewers)).toBe(true)
    expect(Array.isArray(detail.qaComments)).toBe(true)
    expect(Array.isArray(detail.qaSteps)).toBe(true)
  })

  it('identifica correttamente i commenti QA tramite autore', async () => {
    const { exec } = await import('../../src/services/shell.js')
    vi.mocked(exec).mockResolvedValue({ stdout: 'fake-gh-token', stderr: '', exitCode: 0 })

    const { getPRDetail } = await import('../../src/services/github.js')
    const detail = await getPRDetail('acme', 'my-api', 42)

    // Il commento di "qa-engineer" deve essere classificato come QA
    const qaAuthors = detail.qaComments.map((c) => c.author)
    expect(qaAuthors.some((a) => a.includes('qa'))).toBe(true)
  })

  it('estrae qaSteps dalle checklist nei commenti QA', async () => {
    const { exec } = await import('../../src/services/shell.js')
    vi.mocked(exec).mockResolvedValue({ stdout: 'fake-gh-token', stderr: '', exitCode: 0 })

    const { getPRDetail } = await import('../../src/services/github.js')
    const detail = await getPRDetail('acme', 'my-api', 42)

    // Il mock ha "- [x] Testare flusso login" e "- [ ] Verificare logout"
    expect(detail.qaSteps.length).toBeGreaterThan(0)
    const checked = detail.qaSteps.filter((s) => s.checked)
    const unchecked = detail.qaSteps.filter((s) => !s.checked)
    expect(checked.length).toBeGreaterThan(0)
    expect(unchecked.length).toBeGreaterThan(0)
  })
})

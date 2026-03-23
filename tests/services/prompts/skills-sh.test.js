import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../setup.js'

describe('searchSkills', () => {
  it('returns parsed Skill[] from skills.sh API (skills key)', async () => {
    server.use(
      http.get('https://skills.sh/api/search', () =>
        HttpResponse.json({
          query: 'review',
          searchType: 'fuzzy',
          skills: [
            { id: 'code-review', name: 'Code Review', description: 'Review code changes', installs: 1200 },
            { id: 'sql-gen', name: 'SQL Generator', description: 'Generate SQL queries', installs: 800 },
          ],
          count: 2,
          duration_ms: 42,
        }),
      ),
    )

    const { searchSkills } = await import('../../../src/services/skills-sh.js')
    const skills = await searchSkills('review')

    expect(skills).toHaveLength(2)
    expect(skills[0].id).toBe('code-review')
    expect(skills[0].name).toBe('Code Review')
    expect(skills[0].installs).toBe(1200)
    expect(skills[0].source).toBe('skills.sh')
    expect(skills[1].id).toBe('sql-gen')
  })

  it('passes query and limit as search params', async () => {
    /** @type {URL|undefined} */
    let capturedUrl

    server.use(
      http.get('https://skills.sh/api/search', ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json({ skills: [] })
      }),
    )

    const { searchSkills } = await import('../../../src/services/skills-sh.js')
    await searchSkills('refactor', 10)

    expect(capturedUrl?.searchParams.get('q')).toBe('refactor')
    expect(capturedUrl?.searchParams.get('limit')).toBe('10')
  })

  it('returns empty array when API returns empty skills array', async () => {
    server.use(
      http.get('https://skills.sh/api/search', () => HttpResponse.json({ skills: [], count: 0 })),
    )

    const { searchSkills } = await import('../../../src/services/skills-sh.js')
    const skills = await searchSkills('coding')
    expect(Array.isArray(skills)).toBe(true)
    expect(skills).toHaveLength(0)
  })

  it('also handles plain array response format', async () => {
    server.use(
      http.get('https://skills.sh/api/search', () =>
        HttpResponse.json([{ id: 'plain', name: 'Plain Skill', installs: 5 }]),
      ),
    )

    const { searchSkills } = await import('../../../src/services/skills-sh.js')
    const skills = await searchSkills('plain')
    expect(skills).toHaveLength(1)
    expect(skills[0].id).toBe('plain')
  })

  it('throws DvmiError when query is missing or too short', async () => {
    const { searchSkills } = await import('../../../src/services/skills-sh.js')
    const { DvmiError } = await import('../../../src/utils/errors.js')

    await expect(searchSkills('')).rejects.toThrow(DvmiError)
    await expect(searchSkills('a')).rejects.toThrow(DvmiError)
    await expect(searchSkills(/** @type {any} */ (undefined))).rejects.toThrow(DvmiError)
  })

  it('throws DvmiError when API returns non-OK status', async () => {
    server.use(
      http.get('https://skills.sh/api/search', () =>
        HttpResponse.json({ error: 'server error' }, { status: 500 }),
      ),
    )

    const { searchSkills } = await import('../../../src/services/skills-sh.js')
    const { DvmiError } = await import('../../../src/utils/errors.js')

    await expect(searchSkills('test-query')).rejects.toThrow(DvmiError)
  })
})

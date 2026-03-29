import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock loadConfig so tests don't need a real config file
vi.mock('../../src/services/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({ org: 'acme', nvd: undefined }),
}))

describe('normalizeSeverity', () => {
  it('maps CRITICAL to Critical', async () => {
    const { normalizeSeverity } = await import('../../src/services/nvd.js')
    expect(normalizeSeverity('CRITICAL')).toBe('Critical')
  })

  it('maps HIGH to High', async () => {
    const { normalizeSeverity } = await import('../../src/services/nvd.js')
    expect(normalizeSeverity('HIGH')).toBe('High')
  })

  it('maps MEDIUM to Medium', async () => {
    const { normalizeSeverity } = await import('../../src/services/nvd.js')
    expect(normalizeSeverity('MEDIUM')).toBe('Medium')
  })

  it('maps LOW to Low', async () => {
    const { normalizeSeverity } = await import('../../src/services/nvd.js')
    expect(normalizeSeverity('LOW')).toBe('Low')
  })

  it('returns Unknown for undefined', async () => {
    const { normalizeSeverity } = await import('../../src/services/nvd.js')
    expect(normalizeSeverity(undefined)).toBe('Unknown')
  })

  it('returns Unknown for unrecognized string', async () => {
    const { normalizeSeverity } = await import('../../src/services/nvd.js')
    expect(normalizeSeverity('NONE')).toBe('Unknown')
  })
})

describe('searchCves', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('succeeds with empty keyword (treated as no keyword filter)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resultsPerPage: 0, startIndex: 0, totalResults: 0, vulnerabilities: [] }),
    })
    const { searchCves } = await import('../../src/services/nvd.js')
    const result = await searchCves({ keyword: '' })
    expect(result).toEqual({ results: [], totalResults: 0 })
    // keywordSearch param should NOT be in the URL when keyword is empty
    const calledUrl = global.fetch.mock.calls[0][0]
    expect(calledUrl).not.toContain('keywordSearch')
  })

  it('succeeds with whitespace keyword (treated as no keyword filter)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resultsPerPage: 0, startIndex: 0, totalResults: 0, vulnerabilities: [] }),
    })
    const { searchCves } = await import('../../src/services/nvd.js')
    const result = await searchCves({ keyword: '  ' })
    expect(result).toEqual({ results: [], totalResults: 0 })
    const calledUrl = global.fetch.mock.calls[0][0]
    expect(calledUrl).not.toContain('keywordSearch')
  })

  it('returns parsed results for a valid keyword', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        resultsPerPage: 1,
        startIndex: 0,
        totalResults: 1,
        vulnerabilities: [
          {
            cve: {
              id: 'CVE-2026-1234',
              published: '2026-03-25T00:00:00.000',
              lastModified: '2026-03-26T00:00:00.000',
              descriptions: [{ lang: 'en', value: 'Test vulnerability.' }],
              metrics: {
                cvssMetricV31: [{ cvssData: { baseScore: 9.8, baseSeverity: 'CRITICAL', vectorString: null } }],
              },
              weaknesses: [],
              configurations: [],
              references: [],
            },
          },
        ],
      }),
    })

    const { searchCves } = await import('../../src/services/nvd.js')
    const { results, totalResults } = await searchCves({ keyword: 'openssl', days: 14 })

    expect(totalResults).toBe(1)
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('CVE-2026-1234')
    expect(results[0].severity).toBe('Critical')
    expect(results[0].score).toBeCloseTo(9.8)
    expect(results[0].description).toBe('Test vulnerability.')
    expect(results[0].firstReference).toBeNull()
  })

  it('parses firstReference from first reference URL when present', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        resultsPerPage: 1,
        startIndex: 0,
        totalResults: 1,
        vulnerabilities: [
          {
            cve: {
              id: 'CVE-2026-9999',
              published: '2026-03-25T00:00:00.000',
              lastModified: '2026-03-26T00:00:00.000',
              descriptions: [{ lang: 'en', value: 'Test.' }],
              metrics: {},
              weaknesses: [],
              configurations: [],
              references: [
                { url: 'https://example.com/advisory', source: 'example.com', tags: [] },
                { url: 'https://other.com', source: 'other.com', tags: [] },
              ],
            },
          },
        ],
      }),
    })
    const { searchCves } = await import('../../src/services/nvd.js')
    const { results } = await searchCves({ keyword: 'test' })
    expect(results[0].firstReference).toBe('https://example.com/advisory')
  })

  it('returns empty results when no vulnerabilities found', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resultsPerPage: 0, startIndex: 0, totalResults: 0, vulnerabilities: [] }),
    })

    const { searchCves } = await import('../../src/services/nvd.js')
    const { results, totalResults } = await searchCves({ keyword: 'veryrareunknownlib' })

    expect(totalResults).toBe(0)
    expect(results).toHaveLength(0)
  })

  it('throws DvmiError on HTTP error response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })

    const { searchCves } = await import('../../src/services/nvd.js')
    await expect(searchCves({ keyword: 'openssl' })).rejects.toThrow('NVD API returned HTTP 503')
  })

  it('uses severity filter parameter when provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resultsPerPage: 0, totalResults: 0, vulnerabilities: [] }),
    })

    const { searchCves } = await import('../../src/services/nvd.js')
    await searchCves({ keyword: 'openssl', severity: 'critical' })

    const calledUrl = /** @type {any} */ (global.fetch).mock.calls[0][0]
    expect(calledUrl).toContain('cvssV3Severity=CRITICAL')
  })
})

describe('getCveDetail', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('throws DvmiError for invalid CVE ID format', async () => {
    const { getCveDetail } = await import('../../src/services/nvd.js')
    await expect(getCveDetail('not-a-cve')).rejects.toThrow('Invalid CVE ID')
  })

  it('throws DvmiError for empty CVE ID', async () => {
    const { getCveDetail } = await import('../../src/services/nvd.js')
    await expect(getCveDetail('')).rejects.toThrow('Invalid CVE ID')
  })

  it('returns full CVE detail for a valid ID', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        resultsPerPage: 1,
        totalResults: 1,
        vulnerabilities: [
          {
            cve: {
              id: 'CVE-2021-44228',
              published: '2021-12-10T04:15:07.917',
              lastModified: '2023-11-07T03:39:36.747',
              vulnStatus: 'Analyzed',
              descriptions: [{ lang: 'en', value: 'Apache Log4j2 JNDI vulnerability.' }],
              metrics: {
                cvssMetricV31: [{ cvssData: { baseScore: 10.0, baseSeverity: 'CRITICAL', vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H' } }],
              },
              weaknesses: [
                { description: [{ lang: 'en', value: 'CWE-502' }] },
              ],
              configurations: [],
              references: [
                { url: 'https://example.com', source: 'test', tags: ['Vendor Advisory'] },
              ],
            },
          },
        ],
      }),
    })

    const { getCveDetail } = await import('../../src/services/nvd.js')
    const detail = await getCveDetail('CVE-2021-44228')

    expect(detail.id).toBe('CVE-2021-44228')
    expect(detail.severity).toBe('Critical')
    expect(detail.score).toBeCloseTo(10.0)
    expect(detail.cvssVector).toBe('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H')
    expect(detail.status).toBe('Analyzed')
    expect(detail.weaknesses).toHaveLength(1)
    expect(detail.weaknesses[0].id).toBe('CWE-502')
    expect(detail.references).toHaveLength(1)
    expect(detail.references[0].tags).toContain('Vendor Advisory')
  })

  it('throws DvmiError when CVE not found', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resultsPerPage: 0, totalResults: 0, vulnerabilities: [] }),
    })

    const { getCveDetail } = await import('../../src/services/nvd.js')
    await expect(getCveDetail('CVE-2099-99999')).rejects.toThrow('CVE not found')
  })

  it('falls back to cvssMetricV2 when V31 missing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        resultsPerPage: 1,
        totalResults: 1,
        vulnerabilities: [
          {
            cve: {
              id: 'CVE-2010-0001',
              published: '2010-01-01T00:00:00.000',
              lastModified: '2010-01-02T00:00:00.000',
              vulnStatus: 'Analyzed',
              descriptions: [{ lang: 'en', value: 'Old CVE.' }],
              metrics: {
                cvssMetricV2: [{ cvssData: { baseScore: 7.8, baseSeverity: 'HIGH', vectorString: null } }],
              },
              weaknesses: [],
              configurations: [],
              references: [],
            },
          },
        ],
      }),
    })

    const { getCveDetail } = await import('../../src/services/nvd.js')
    const detail = await getCveDetail('CVE-2010-0001')
    expect(detail.severity).toBe('High')
    expect(detail.score).toBeCloseTo(7.8)
  })
})

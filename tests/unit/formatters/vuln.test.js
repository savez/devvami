import {describe, it, expect} from 'vitest'
import {
  colorSeverity,
  formatScore,
  formatDate,
  formatCveSearchTable,
  formatCveDetail,
  formatFindingsTable,
  formatScanSummary,
  formatMarkdownReport,
} from '../../../src/formatters/vuln.js'

describe('colorSeverity', () => {
  it('returns a non-empty string for each severity level', () => {
    for (const s of ['Critical', 'High', 'Medium', 'Low', 'Unknown']) {
      expect(typeof colorSeverity(s)).toBe('string')
      expect(colorSeverity(s).length).toBeGreaterThan(0)
    }
  })
})

describe('formatScore', () => {
  it('formats a number to 1 decimal place', () => {
    expect(formatScore(9.8)).toBe('9.8')
    expect(formatScore(10.0)).toBe('10.0')
    expect(formatScore(5.0)).toBe('5.0')
  })

  it('returns N/A for null', () => {
    expect(formatScore(null)).toBe('N/A')
  })

  it('returns N/A for undefined', () => {
    expect(formatScore(undefined)).toBe('N/A')
  })
})

describe('formatDate', () => {
  it('extracts YYYY-MM-DD from ISO string', () => {
    expect(formatDate('2021-12-10T04:15:07.917')).toBe('2021-12-10')
    expect(formatDate('2026-03-25T00:00:00.000')).toBe('2026-03-25')
  })

  it('returns empty string for empty input', () => {
    expect(formatDate('')).toBe('')
  })
})

describe('formatCveSearchTable', () => {
  const mockResults = [
    {
      id: 'CVE-2026-1234',
      severity: 'Critical',
      score: 9.8,
      publishedDate: '2026-03-25T00:00:00.000',
      lastModified: '2026-03-26T00:00:00.000',
      description: 'Buffer overflow vulnerability.',
      firstReference: 'https://www.openssl.org/news/secadv/20260325.txt',
    },
  ]

  it('includes the keyword and days in the header', () => {
    const out = formatCveSearchTable(mockResults, 'openssl', 14, 1)
    expect(out).toContain('openssl')
    expect(out).toContain('14 days')
  })

  it('includes CVE ID in the output', () => {
    const out = formatCveSearchTable(mockResults, 'openssl', 14, 1)
    expect(out).toContain('CVE-2026-1234')
  })

  it('includes NVD attribution notice', () => {
    const out = formatCveSearchTable(mockResults, 'openssl', 14, 1)
    expect(out).toContain('NVD API')
  })

  it('shows no results message when empty', () => {
    const out = formatCveSearchTable([], 'noresult', 14, 0)
    expect(out).toContain('No CVEs found')
    expect(out).toContain('NVD API')
  })

  it('includes result count', () => {
    const out = formatCveSearchTable(mockResults, 'openssl', 14, 5)
    expect(out).toContain('Showing 1 of 5')
  })

  it('shows first reference URL in the table', () => {
    const out = formatCveSearchTable(mockResults, 'openssl', 14, 1)
    expect(out).toContain('openssl.org')
  })

  it('shows — when firstReference is null', () => {
    const noRef = [{...mockResults[0], firstReference: null}]
    const out = formatCveSearchTable(noRef, 'openssl', 14, 1)
    expect(out).toContain('—')
  })
})

describe('formatCveDetail', () => {
  const mockDetail = {
    id: 'CVE-2021-44228',
    description: 'Apache Log4j2 JNDI vulnerability.',
    severity: 'Critical',
    score: 10.0,
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H',
    publishedDate: '2021-12-10T04:15:07.917',
    lastModified: '2023-11-07T03:39:36.747',
    status: 'Analyzed',
    weaknesses: [{id: 'CWE-502', description: 'CWE-502'}],
    affectedProducts: [{vendor: 'apache', product: 'log4j', versions: '2.0-beta9 to 2.15.0'}],
    references: [{url: 'https://example.com', source: 'test', tags: ['Vendor Advisory']}],
  }

  it('includes CVE ID in output', () => {
    const out = formatCveDetail(mockDetail)
    expect(out).toContain('CVE-2021-44228')
  })

  it('includes NVD attribution', () => {
    const out = formatCveDetail(mockDetail)
    expect(out).toContain('NVD API')
  })

  it('includes status, published date, and CVSS vector', () => {
    const out = formatCveDetail(mockDetail)
    expect(out).toContain('Analyzed')
    expect(out).toContain('2021-12-10')
    expect(out).toContain('CVSS:3.1')
  })

  it('includes weakness ID', () => {
    const out = formatCveDetail(mockDetail)
    expect(out).toContain('CWE-502')
  })

  it('includes first reference URL', () => {
    const out = formatCveDetail(mockDetail)
    expect(out).toContain('https://example.com')
  })

  it('includes affected product info', () => {
    const out = formatCveDetail(mockDetail)
    expect(out).toContain('apache')
    expect(out).toContain('log4j')
  })
})

describe('formatFindingsTable', () => {
  const mockFindings = [
    {
      package: 'lodash',
      installedVersion: '4.17.20',
      severity: 'Critical',
      cveId: 'CVE-2021-23337',
      advisoryUrl: 'https://example.com',
      title: 'Prototype Pollution',
      patchedVersions: '>=4.17.21',
      ecosystem: 'npm',
      isDirect: false,
    },
  ]

  it('includes package name', () => {
    const out = formatFindingsTable(mockFindings)
    expect(out).toContain('lodash')
  })

  it('returns empty string for empty findings', () => {
    expect(formatFindingsTable([])).toBe('')
  })

  it('includes CVE ID', () => {
    const out = formatFindingsTable(mockFindings)
    expect(out).toContain('CVE-2021-23337')
  })
})

describe('formatScanSummary', () => {
  it('includes counts for all severity levels', () => {
    const summary = {critical: 2, high: 1, medium: 3, low: 0, unknown: 0, total: 6}
    const out = formatScanSummary(summary)
    expect(out).toContain('2')
    expect(out).toContain('Critical')
    expect(out).toContain('Total')
  })
})

describe('formatMarkdownReport', () => {
  const mockResult = {
    projectPath: '/path/to/project',
    scanDate: '2026-03-28T10:30:00.000Z',
    ecosystems: [
      {
        name: 'pnpm',
        lockFile: 'pnpm-lock.yaml',
        lockFilePath: '/path/pnpm-lock.yaml',
        auditCommand: 'pnpm audit --json',
        builtIn: true,
      },
    ],
    findings: [
      {
        package: 'lodash',
        installedVersion: '4.17.20',
        severity: 'Critical',
        cveId: 'CVE-2021-23337',
        advisoryUrl: null,
        title: 'Prototype Pollution',
        patchedVersions: null,
        ecosystem: 'pnpm',
        isDirect: false,
      },
    ],
    summary: {critical: 1, high: 0, medium: 0, low: 0, unknown: 0, total: 1},
    errors: [],
  }

  it('includes project path and date', () => {
    const out = formatMarkdownReport(mockResult)
    expect(out).toContain('/path/to/project')
    expect(out).toContain('2026-03-28')
  })

  it('includes findings table', () => {
    const out = formatMarkdownReport(mockResult)
    expect(out).toContain('lodash')
    expect(out).toContain('CVE-2021-23337')
  })

  it('includes NVD attribution', () => {
    const out = formatMarkdownReport(mockResult)
    expect(out).toContain('NVD API')
  })

  it('includes summary table with correct counts', () => {
    const out = formatMarkdownReport(mockResult)
    expect(out).toContain('| Critical | 1 |')
    expect(out).toContain('| **Total** | **1** |')
  })
})

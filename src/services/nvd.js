import {loadConfig} from './config.js'
import {DvmiError} from '../utils/errors.js'

/** @import { CveSearchResult, CveDetail } from '../types.js' */

const NVD_BASE_URL = process.env.NVD_BASE_URL || 'https://services.nvd.nist.gov/rest/json/cves/2.0'

/** NVD attribution required in all interactive output. */
export const NVD_ATTRIBUTION = 'This product uses data from the NVD API but is not endorsed or certified by the NVD.'

/**
 * Normalize a raw NVD severity string to the 4-tier canonical form.
 * @param {string|undefined} raw
 * @returns {'Critical'|'High'|'Medium'|'Low'|'Unknown'}
 */
export function normalizeSeverity(raw) {
  if (!raw) return 'Unknown'
  const s = raw.toUpperCase()
  if (s === 'CRITICAL') return 'Critical'
  if (s === 'HIGH') return 'High'
  if (s === 'MEDIUM') return 'Medium'
  if (s === 'LOW') return 'Low'
  return 'Unknown'
}

/**
 * Extract the best available CVSS metrics from a CVE record.
 * Priority: cvssMetricV31 > cvssMetricV40 > cvssMetricV2
 * @param {Record<string, unknown>} metrics
 * @returns {{ score: number|null, severity: string, vector: string|null }}
 */
function extractCvss(metrics) {
  const sources = [metrics?.cvssMetricV31 ?? [], metrics?.cvssMetricV40 ?? [], metrics?.cvssMetricV2 ?? []]

  for (const list of sources) {
    if (Array.isArray(list) && list.length > 0) {
      const data = /** @type {any} */ (list[0]).cvssData
      if (data) {
        return {
          score: data.baseScore ?? null,
          severity: normalizeSeverity(data.baseSeverity),
          vector: data.vectorString ?? null,
        }
      }
    }
  }

  return {score: null, severity: 'Unknown', vector: null}
}

/**
 * Get the English description from the NVD descriptions array.
 * @param {Array<{lang: string, value: string}>} descriptions
 * @returns {string}
 */
function getEnDescription(descriptions) {
  if (!Array.isArray(descriptions)) return ''
  const en = descriptions.find((d) => d.lang === 'en')
  return en?.value ?? ''
}

/**
 * Build query parameters for NVD API request.
 * @param {Record<string, string|number|undefined>} params
 * @returns {URLSearchParams}
 */
function buildParams(params) {
  const sp = new URLSearchParams()
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      sp.set(key, String(val))
    }
  }
  return sp
}

/**
 * Make an authenticated fetch to the NVD API.
 * @param {URLSearchParams} params
 * @param {string|undefined} apiKey
 * @returns {Promise<unknown>}
 */
async function nvdFetch(params, apiKey) {
  const url = `${NVD_BASE_URL}?${params.toString()}`
  /** @type {Record<string, string>} */
  const headers = {Accept: 'application/json'}
  if (apiKey) headers['apiKey'] = apiKey

  const res = await fetch(url, {headers})
  if (!res.ok) {
    throw new DvmiError(`NVD API returned HTTP ${res.status}`, 'Check your network connection or try again later.')
  }
  return res.json()
}

/**
 * Parse a raw NVD vulnerability object into a CveSearchResult.
 * @param {any} raw
 * @returns {CveSearchResult}
 */
function parseCveSearchResult(raw) {
  const cve = raw.cve
  const {score, severity} = extractCvss(cve.metrics ?? {})
  return {
    id: cve.id,
    description: getEnDescription(cve.descriptions),
    severity,
    score,
    publishedDate: cve.published,
    lastModified: cve.lastModified,
    firstReference: (cve.references ?? [])[0]?.url ?? null,
  }
}

/**
 * Parse a raw NVD vulnerability object into a CveDetail.
 * @param {any} raw
 * @returns {CveDetail}
 */
function parseCveDetail(raw) {
  const cve = raw.cve
  const {score, severity, vector} = extractCvss(cve.metrics ?? {})

  // Weaknesses: flatten all CWE descriptions
  const weaknesses = (cve.weaknesses ?? []).flatMap((w) =>
    (w.description ?? []).map((d) => ({
      id: d.value,
      description: d.value,
    })),
  )

  // Affected products: parse CPE data from configurations
  const affectedProducts = (cve.configurations ?? []).flatMap((cfg) =>
    (cfg.nodes ?? []).flatMap((node) =>
      (node.cpeMatch ?? [])
        .filter((m) => m.vulnerable)
        .map((m) => {
          // cpe:2.3:a:vendor:product:version:...
          const parts = (m.criteria ?? '').split(':')
          const vendor = parts[3] ?? 'unknown'
          const product = parts[4] ?? 'unknown'
          const versionStart = m.versionStartIncluding ?? m.versionStartExcluding ?? ''
          const versionEnd = m.versionEndExcluding ?? m.versionEndIncluding ?? ''
          const versions =
            versionStart && versionEnd
              ? `${versionStart} to ${versionEnd}`
              : versionStart || versionEnd || (parts[5] ?? '*')
          return {vendor, product, versions}
        }),
    ),
  )

  // References
  const references = (cve.references ?? []).map((r) => ({
    url: r.url ?? '',
    source: r.source ?? '',
    tags: Array.isArray(r.tags) ? r.tags : [],
  }))

  return {
    id: cve.id,
    description: getEnDescription(cve.descriptions),
    severity,
    score,
    cvssVector: vector,
    publishedDate: cve.published,
    lastModified: cve.lastModified,
    status: cve.vulnStatus ?? '',
    weaknesses,
    affectedProducts,
    references,
  }
}

/**
 * Search CVEs by keyword within a date window.
 * @param {Object} options
 * @param {string} [options.keyword] - Search keyword (optional — omit to return all recent CVEs)
 * @param {number} [options.days=14] - Look-back window in days
 * @param {string} [options.severity] - Optional minimum severity filter (low|medium|high|critical)
 * @param {number} [options.limit=20] - Maximum results to return
 * @returns {Promise<{ results: CveSearchResult[], totalResults: number }>}
 */
export async function searchCves({keyword, days = 14, severity, limit = 20}) {
  const config = await loadConfig()
  const apiKey = config.nvd?.apiKey

  const now = new Date()
  const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  // NVD requires ISO-8601 with time component, no trailing Z
  const pubStartDate = past.toISOString().replace('Z', '')
  const pubEndDate = now.toISOString().replace('Z', '')

  const trimmedKeyword = keyword?.trim()

  const params = buildParams({
    ...(trimmedKeyword ? {keywordSearch: trimmedKeyword} : {}),
    pubStartDate,
    pubEndDate,
    resultsPerPage: limit,
    ...(severity ? {cvssV3Severity: severity.toUpperCase()} : {}),
  })

  const data = /** @type {any} */ (await nvdFetch(params, apiKey))

  const results = (data.vulnerabilities ?? []).map(parseCveSearchResult)
  return {results, totalResults: data.totalResults ?? results.length}
}

/**
 * Fetch full details for a single CVE by ID.
 * @param {string} cveId - CVE identifier (e.g. "CVE-2021-44228")
 * @returns {Promise<CveDetail>}
 */
export async function getCveDetail(cveId) {
  if (!cveId || !/^CVE-\d{4}-\d{4,}$/i.test(cveId)) {
    throw new DvmiError(
      `Invalid CVE ID: ${cveId}`,
      'CVE IDs must match the format CVE-YYYY-NNNNN (e.g. CVE-2021-44228)',
    )
  }

  const config = await loadConfig()
  const apiKey = config.nvd?.apiKey

  const params = buildParams({cveId: cveId.toUpperCase()})
  const data = /** @type {any} */ (await nvdFetch(params, apiKey))

  if (!data.vulnerabilities || data.vulnerabilities.length === 0) {
    throw new DvmiError(`CVE not found: ${cveId}`, 'Verify the CVE ID is correct and exists in the NVD database.')
  }

  return parseCveDetail(data.vulnerabilities[0])
}

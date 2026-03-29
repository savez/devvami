import { execa } from 'execa'
import { dirname } from 'node:path'

/** @import { PackageEcosystem, VulnerabilityFinding } from '../types.js' */

/**
 * Normalize a raw severity string from any audit tool to the 4-tier canonical form.
 * @param {string|undefined} raw
 * @returns {'Critical'|'High'|'Medium'|'Low'|'Unknown'}
 */
export function normalizeSeverity(raw) {
  if (!raw) return 'Unknown'
  const s = raw.toLowerCase()
  if (s === 'critical') return 'Critical'
  if (s === 'high') return 'High'
  if (s === 'medium' || s === 'moderate') return 'Medium'
  if (s === 'low' || s === 'info') return 'Low'
  return 'Unknown'
}

/**
 * Parse npm v7+ audit JSON output.
 * @param {any} data
 * @param {string} ecosystem
 * @returns {VulnerabilityFinding[]}
 */
function parseNpmAudit(data, ecosystem) {
  const findings = []
  const vulns = data.vulnerabilities ?? {}

  for (const [pkgName, vuln] of Object.entries(vulns)) {
    // `via` can contain strings (transitive) or advisory objects
    const advisories = (vuln.via ?? []).filter((v) => typeof v === 'object')

    if (advisories.length === 0) {
      // Transitive-only entry: no advisory objects, skip (will be reported through direct dep)
      continue
    }

    for (const advisory of advisories) {
      findings.push({
        package: pkgName,
        installedVersion: vuln.range ?? 'unknown',
        severity: normalizeSeverity(advisory.severity ?? vuln.severity),
        cveId: null, // npm audit doesn't include CVE IDs directly
        advisoryUrl: advisory.url ?? null,
        title: advisory.title ?? null,
        patchedVersions: advisory.range ? `>=${advisory.range.replace(/^</, '')}` : null,
        ecosystem,
        isDirect: vuln.isDirect ?? null,
      })
    }
  }

  return findings
}

/**
 * Parse pnpm audit JSON output (npm v6-style with `advisories` object).
 * @param {any} data
 * @param {string} ecosystem
 * @returns {VulnerabilityFinding[]}
 */
function parsePnpmAudit(data, ecosystem) {
  const findings = []
  const advisories = data.advisories ?? {}

  for (const advisory of Object.values(advisories)) {
    const findings_ = /** @type {any} */ (advisory).findings ?? []
    const version = findings_[0]?.version ?? 'unknown'

    findings.push({
      package: advisory.module_name,
      installedVersion: version,
      severity: normalizeSeverity(advisory.severity),
      cveId: Array.isArray(advisory.cves) && advisory.cves.length > 0 ? advisory.cves[0] : null,
      advisoryUrl: advisory.url ?? null,
      title: advisory.title ?? null,
      patchedVersions: advisory.patched_versions ?? null,
      ecosystem,
      isDirect: null,
    })
  }

  return findings
}

/**
 * Parse yarn v1 NDJSON audit output.
 * @param {string} raw
 * @param {string} ecosystem
 * @returns {VulnerabilityFinding[]}
 */
function parseYarnAudit(raw, ecosystem) {
  const findings = []

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let obj
    try {
      obj = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (obj.type !== 'auditAdvisory') continue

    const advisory = obj.data?.advisory
    if (!advisory) continue

    const resolution = obj.data?.resolution
    const version = advisory.findings?.[0]?.version ?? 'unknown'

    findings.push({
      package: advisory.module_name,
      installedVersion: version,
      severity: normalizeSeverity(advisory.severity),
      cveId: Array.isArray(advisory.cves) && advisory.cves.length > 0 ? advisory.cves[0] : null,
      advisoryUrl: advisory.url ?? null,
      title: advisory.title ?? null,
      patchedVersions: advisory.patched_versions ?? null,
      ecosystem,
      isDirect: resolution?.dev === false ? null : null,
    })
  }

  return findings
}

/**
 * Parse pip-audit JSON output.
 * @param {any} data
 * @param {string} ecosystem
 * @returns {VulnerabilityFinding[]}
 */
function parsePipAudit(data, ecosystem) {
  const findings = []
  const deps = data.dependencies ?? []

  for (const dep of deps) {
    if (!Array.isArray(dep.vulns) || dep.vulns.length === 0) continue
    for (const vuln of dep.vulns) {
      // Determine best ID: prefer CVE
      const cveId = vuln.id?.startsWith('CVE-') ? vuln.id
        : (vuln.aliases ?? []).find((a) => a.startsWith('CVE-')) ?? null

      findings.push({
        package: dep.name,
        installedVersion: dep.version ?? 'unknown',
        severity: 'Unknown', // pip-audit doesn't include severity in its JSON output
        cveId,
        advisoryUrl: null,
        title: vuln.description ?? null,
        patchedVersions: Array.isArray(vuln.fix_versions) && vuln.fix_versions.length > 0
          ? `>=${vuln.fix_versions[0]}`
          : null,
        ecosystem,
        isDirect: null,
      })
    }
  }

  return findings
}

/**
 * Parse cargo-audit JSON output.
 * @param {any} data
 * @param {string} ecosystem
 * @returns {VulnerabilityFinding[]}
 */
function parseCargoAudit(data, ecosystem) {
  const findings = []
  const list = data.vulnerabilities?.list ?? []

  for (const item of list) {
    const advisory = item.advisory ?? {}
    const pkg = item.package ?? {}

    const cveId = Array.isArray(advisory.aliases)
      ? (advisory.aliases.find((a) => /^CVE-/i.test(a)) ?? null)
      : null

    // CVSS vector string — extract base score from it? Too complex; mark Unknown for now
    findings.push({
      package: pkg.name ?? 'unknown',
      installedVersion: pkg.version ?? 'unknown',
      severity: 'Unknown',
      cveId,
      advisoryUrl: advisory.url ?? null,
      title: advisory.title ?? null,
      patchedVersions: Array.isArray(item.versions?.patched) ? item.versions.patched.join(', ') : null,
      ecosystem,
      isDirect: null,
    })
  }

  return findings
}

/**
 * Parse bundler-audit JSON output.
 * @param {any} data
 * @param {string} ecosystem
 * @returns {VulnerabilityFinding[]}
 */
function parseBundlerAudit(data, ecosystem) {
  const findings = []
  const results = data.results ?? []

  for (const result of results) {
    const advisory = result.advisory ?? {}
    const gem = result.gem ?? {}

    findings.push({
      package: gem.name ?? 'unknown',
      installedVersion: gem.version ?? 'unknown',
      severity: normalizeSeverity(advisory.criticality),
      cveId: advisory.cve ?? null,
      advisoryUrl: advisory.url ?? null,
      title: advisory.title ?? null,
      patchedVersions: Array.isArray(advisory.patched_versions) ? advisory.patched_versions.join(', ') : null,
      ecosystem,
      isDirect: null,
    })
  }

  return findings
}

/**
 * Parse composer audit JSON output.
 * @param {any} data
 * @param {string} ecosystem
 * @returns {VulnerabilityFinding[]}
 */
function parseComposerAudit(data, ecosystem) {
  const findings = []
  const advisories = data.advisories ?? {}

  for (const [pkgName, pkgAdvisories] of Object.entries(advisories)) {
    if (!Array.isArray(pkgAdvisories)) continue
    for (const advisory of pkgAdvisories) {
      findings.push({
        package: pkgName,
        installedVersion: 'unknown',
        severity: 'Unknown',
        cveId: advisory.cve ?? null,
        advisoryUrl: advisory.link ?? null,
        title: advisory.title ?? null,
        patchedVersions: null,
        ecosystem,
        isDirect: null,
      })
    }
  }

  return findings
}

/**
 * Run the audit command for a detected ecosystem and return normalized findings.
 * @param {PackageEcosystem} ecosystem
 * @returns {Promise<{ findings: VulnerabilityFinding[], error: string|null }>}
 */
export async function runAudit(ecosystem) {
  const [cmd, ...args] = ecosystem.auditCommand.split(' ')

  let result
  try {
    result = await execa(cmd, args, {
      cwd: dirname(ecosystem.lockFilePath),
      reject: false,
      all: true,
    })
  } catch (err) {
    // Binary not found — tool not installed
    const errMsg = /** @type {any} */ (err).code === 'ENOENT'
      ? `"${cmd}" is not installed. Install it to scan ${ecosystem.name} dependencies.`
      : String(err)
    return { findings: [], error: errMsg }
  }

  const output = result.stdout ?? result.all ?? ''

  if (!output.trim()) {
    if (result.exitCode !== 0 && result.exitCode !== 1) {
      return { findings: [], error: `${cmd} exited with code ${result.exitCode}: ${result.stderr ?? ''}` }
    }
    return { findings: [], error: null }
  }

  try {
    switch (ecosystem.name) {
      case 'npm': {
        const data = JSON.parse(output)
        return { findings: parseNpmAudit(data, ecosystem.name), error: null }
      }
      case 'pnpm': {
        const data = JSON.parse(output)
        return { findings: parsePnpmAudit(data, ecosystem.name), error: null }
      }
      case 'yarn': {
        return { findings: parseYarnAudit(output, ecosystem.name), error: null }
      }
      case 'pip': {
        const data = JSON.parse(output)
        return { findings: parsePipAudit(data, ecosystem.name), error: null }
      }
      case 'cargo': {
        const data = JSON.parse(output)
        return { findings: parseCargoAudit(data, ecosystem.name), error: null }
      }
      case 'bundler': {
        const data = JSON.parse(output)
        return { findings: parseBundlerAudit(data, ecosystem.name), error: null }
      }
      case 'composer': {
        const data = JSON.parse(output)
        return { findings: parseComposerAudit(data, ecosystem.name), error: null }
      }
      default:
        return { findings: [], error: `Unknown ecosystem: ${ecosystem.name}` }
    }
  } catch (parseErr) {
    return { findings: [], error: `Failed to parse ${ecosystem.name} audit output: ${parseErr.message}` }
  }
}

/**
 * Summarize a list of findings into counts per severity level.
 * @param {VulnerabilityFinding[]} findings
 * @returns {import('../types.js').ScanSummary}
 */
export function summarizeFindings(findings) {
  const summary = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 }
  for (const f of findings) {
    summary.total++
    switch (f.severity) {
      case 'Critical': summary.critical++; break
      case 'High':     summary.high++;     break
      case 'Medium':   summary.medium++;   break
      case 'Low':      summary.low++;      break
      default:         summary.unknown++;  break
    }
  }
  return summary
}

/**
 * Filter findings by minimum severity level.
 * @param {VulnerabilityFinding[]} findings
 * @param {'low'|'medium'|'high'|'critical'|undefined} minSeverity
 * @returns {VulnerabilityFinding[]}
 */
export function filterBySeverity(findings, minSeverity) {
  if (!minSeverity) return findings
  const order = ['Low', 'Medium', 'High', 'Critical']
  const minIdx = order.indexOf(minSeverity[0].toUpperCase() + minSeverity.slice(1).toLowerCase())
  if (minIdx === -1) return findings
  return findings.filter((f) => {
    const idx = order.indexOf(f.severity)
    return idx === -1 ? false : idx >= minIdx
  })
}

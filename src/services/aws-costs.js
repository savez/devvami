import {CostExplorerClient, GetCostAndUsageCommand} from '@aws-sdk/client-cost-explorer'

/** @import { AWSCostEntry, CostGroupMode, CostTrendSeries } from '../types.js' */

/**
 * Get the date range for a cost period.
 * @param {'last-month'|'last-week'|'mtd'} period
 * @returns {{ start: string, end: string }}
 */
function getPeriodDates(period) {
  const now = new Date()
  const fmt = (d) => d.toISOString().split('T')[0]

  if (period === 'last-month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 1)
    return {start: fmt(start), end: fmt(end)}
  }
  if (period === 'last-week') {
    const end = new Date(now)
    end.setDate(now.getDate() - now.getDay())
    const start = new Date(end)
    start.setDate(end.getDate() - 7)
    return {start: fmt(start), end: fmt(end)}
  }
  // mtd
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return {start: fmt(start), end: fmt(now)}
}

/**
 * Get the rolling 2-month date range for trend queries.
 * @returns {{ start: string, end: string }}
 */
export function getTwoMonthPeriod() {
  const now = new Date()
  const fmt = (d) => d.toISOString().split('T')[0]
  const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  return {start: fmt(start), end: fmt(now)}
}

/**
 * Strip the "tagkey$" prefix from an AWS tag group key response.
 * AWS returns tag values as "<tagKey>$<value>" — strip the prefix.
 * An empty stripped value is displayed as "(untagged)".
 * @param {string} rawKey - Raw key from AWS response (e.g. "env$prod" or "env$")
 * @returns {string}
 */
function stripTagPrefix(rawKey) {
  const dollarIdx = rawKey.indexOf('$')
  if (dollarIdx === -1) return rawKey
  const stripped = rawKey.slice(dollarIdx + 1)
  return stripped === '' ? '(untagged)' : stripped
}

/**
 * Build the GroupBy array for Cost Explorer based on the grouping mode.
 * AWS limits GroupBy to max 2 entries.
 * @param {CostGroupMode} groupBy
 * @param {string} [tagKey]
 * @returns {Array<{Type: string, Key: string}>}
 */
function buildGroupBy(groupBy, tagKey) {
  if (groupBy === 'service') {
    return [{Type: 'DIMENSION', Key: 'SERVICE'}]
  }
  if (groupBy === 'tag') {
    return [{Type: 'TAG', Key: tagKey ?? ''}]
  }
  // both
  return [
    {Type: 'DIMENSION', Key: 'SERVICE'},
    {Type: 'TAG', Key: tagKey ?? ''},
  ]
}

/**
 * Query AWS Cost Explorer for costs filtered by project tags.
 * @param {string} serviceName - Tag value for filtering
 * @param {Record<string, string>} tags - Project tags (key-value pairs)
 * @param {'last-month'|'last-week'|'mtd'} [period]
 * @param {CostGroupMode} [groupBy]
 * @param {string} [tagKey]
 * @returns {Promise<{ entries: AWSCostEntry[], period: { start: string, end: string } }>}
 */
export async function getServiceCosts(serviceName, tags, period = 'last-month', groupBy = 'service', tagKey) {
  // Cost Explorer always uses us-east-1
  const client = new CostExplorerClient({region: 'us-east-1'})
  const {start, end} = getPeriodDates(period)

  // Build tag filter from project tags
  const tagEntries = Object.entries(tags)
  const filter =
    tagEntries.length === 1
      ? {Tags: {Key: tagEntries[0][0], Values: [tagEntries[0][1]]}}
      : {
          And: tagEntries.map(([k, v]) => ({
            Tags: {Key: k, Values: [v]},
          })),
        }

  const command = new GetCostAndUsageCommand({
    TimePeriod: {Start: start, End: end},
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
    Filter: filter,
    GroupBy: buildGroupBy(groupBy, tagKey),
  })

  const result = await client.send(command)
  const entries = []

  for (const timeResult of result.ResultsByTime ?? []) {
    for (const group of timeResult.Groups ?? []) {
      const amount = Number(group.Metrics?.UnblendedCost?.Amount ?? 0)
      if (amount > 0) {
        const keys = group.Keys ?? []
        /** @type {AWSCostEntry} */
        const entry = {
          serviceName: groupBy === 'tag' ? stripTagPrefix(keys[0] ?? '') : (keys[0] ?? 'Unknown'),
          amount,
          unit: group.Metrics?.UnblendedCost?.Unit ?? 'USD',
          period: {start, end},
        }
        if (groupBy === 'both') {
          entry.tagValue = stripTagPrefix(keys[1] ?? '')
        } else if (groupBy === 'tag') {
          entry.tagValue = entry.serviceName
        }
        entries.push(entry)
      }
    }
  }

  return {entries, period: {start, end}}
}

/**
 * Query AWS Cost Explorer for daily costs over the last 2 months, grouped by the given mode.
 * Handles NextPageToken pagination internally.
 * @param {CostGroupMode} groupBy
 * @param {string} [tagKey]
 * @returns {Promise<CostTrendSeries[]>}
 */
export async function getTrendCosts(groupBy = 'service', tagKey) {
  const client = new CostExplorerClient({region: 'us-east-1'})
  const {start, end} = getTwoMonthPeriod()

  /** @type {Map<string, Map<string, number>>} seriesName → date → amount */
  const seriesMap = new Map()

  let nextPageToken = undefined
  do {
    const command = new GetCostAndUsageCommand({
      TimePeriod: {Start: start, End: end},
      Granularity: 'DAILY',
      Metrics: ['UnblendedCost'],
      GroupBy: buildGroupBy(groupBy, tagKey),
      ...(nextPageToken ? {NextPageToken: nextPageToken} : {}),
    })

    const result = await client.send(command)
    nextPageToken = result.NextPageToken

    for (const timeResult of result.ResultsByTime ?? []) {
      const date = timeResult.TimePeriod?.Start ?? ''
      for (const group of timeResult.Groups ?? []) {
        const amount = Number(group.Metrics?.UnblendedCost?.Amount ?? 0)
        const keys = group.Keys ?? []

        let seriesName
        if (groupBy === 'service') {
          seriesName = keys[0] ?? 'Unknown'
        } else if (groupBy === 'tag') {
          seriesName = stripTagPrefix(keys[0] ?? '')
        } else {
          // both: "ServiceName / tagValue"
          const svc = keys[0] ?? 'Unknown'
          const tag = stripTagPrefix(keys[1] ?? '')
          seriesName = `${svc} / ${tag}`
        }

        if (!seriesMap.has(seriesName)) {
          seriesMap.set(seriesName, new Map())
        }
        const dateMap = seriesMap.get(seriesName)
        dateMap.set(date, (dateMap.get(date) ?? 0) + amount)
      }
    }
  } while (nextPageToken)

  /** @type {CostTrendSeries[]} */
  const series = []
  for (const [name, dateMap] of seriesMap) {
    const points = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({date, amount}))
    if (points.some((p) => p.amount > 0)) {
      series.push({name, points})
    }
  }

  return series
}

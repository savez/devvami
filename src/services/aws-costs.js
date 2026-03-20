import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer'

/** @import { AWSCostEntry } from '../types.js' */

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
    return { start: fmt(start), end: fmt(end) }
  }
  if (period === 'last-week') {
    const end = new Date(now)
    end.setDate(now.getDate() - now.getDay())
    const start = new Date(end)
    start.setDate(end.getDate() - 7)
    return { start: fmt(start), end: fmt(end) }
  }
  // mtd
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return { start: fmt(start), end: fmt(now) }
}

/**
 * Query AWS Cost Explorer for costs filtered by project tags.
 * @param {string} serviceName - Tag value for filtering
 * @param {Record<string, string>} tags - Project tags (key-value pairs)
 * @param {'last-month'|'last-week'|'mtd'} [period]
 * @returns {Promise<{ entries: AWSCostEntry[], period: { start: string, end: string } }>}
 */
export async function getServiceCosts(serviceName, tags, period = 'last-month') {
  // Cost Explorer always uses us-east-1
  const client = new CostExplorerClient({ region: 'us-east-1' })
  const { start, end } = getPeriodDates(period)

  // Build tag filter from project tags
  const tagEntries = Object.entries(tags)
  const filter =
    tagEntries.length === 1
      ? { Tags: { Key: tagEntries[0][0], Values: [tagEntries[0][1]] } }
      : {
          And: tagEntries.map(([k, v]) => ({
            Tags: { Key: k, Values: [v] },
          })),
        }

  const command = new GetCostAndUsageCommand({
    TimePeriod: { Start: start, End: end },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
    Filter: filter,
    GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
  })

  const result = await client.send(command)
  const entries = []

  for (const timeResult of result.ResultsByTime ?? []) {
    for (const group of timeResult.Groups ?? []) {
      const amount = Number(group.Metrics?.UnblendedCost?.Amount ?? 0)
      if (amount > 0) {
        entries.push({
          serviceName: group.Keys?.[0] ?? 'Unknown',
          amount,
          unit: group.Metrics?.UnblendedCost?.Unit ?? 'USD',
          period: { start, end },
        })
      }
    }
  }

  return { entries, period: { start, end } }
}

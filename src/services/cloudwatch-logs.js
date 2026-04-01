import {CloudWatchLogsClient, paginateDescribeLogGroups, FilterLogEventsCommand} from '@aws-sdk/client-cloudwatch-logs'

/** @import { LogGroup, LogEvent, LogFilterResult } from '../types.js' */

/**
 * Convert a human-readable "since" string to epoch millisecond timestamps.
 * @param {'1h'|'24h'|'7d'} since
 * @returns {{ startTime: number, endTime: number }}
 */
export function sinceToEpochMs(since) {
  const now = Date.now()
  const MS = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  }
  const offset = MS[since]
  if (!offset) throw new Error(`Invalid since value: ${since}. Must be one of: 1h, 24h, 7d`)
  return {startTime: now - offset, endTime: now}
}

/**
 * List all CloudWatch log groups in the given region using pagination.
 * @param {string} [region] - AWS region (defaults to 'eu-west-1')
 * @returns {Promise<LogGroup[]>}
 */
export async function listLogGroups(region = 'eu-west-1') {
  const client = new CloudWatchLogsClient({region})
  /** @type {LogGroup[]} */
  const groups = []

  const paginator = paginateDescribeLogGroups({client}, {})
  for await (const page of paginator) {
    for (const lg of page.logGroups ?? []) {
      groups.push({
        name: lg.logGroupName ?? '',
        storedBytes: lg.storedBytes,
        retentionDays: lg.retentionInDays,
        creationTime: lg.creationTime ? new Date(lg.creationTime).toISOString() : undefined,
      })
    }
  }

  return groups
}

/**
 * Filter log events from a CloudWatch log group.
 * @param {string} logGroupName
 * @param {string} filterPattern - CloudWatch filter pattern ('' = all events)
 * @param {number} startTime - Epoch milliseconds
 * @param {number} endTime - Epoch milliseconds
 * @param {number} limit - Max events to return (1–10000)
 * @param {string} [region] - AWS region (defaults to 'eu-west-1')
 * @returns {Promise<LogFilterResult>}
 */
export async function filterLogEvents(logGroupName, filterPattern, startTime, endTime, limit, region = 'eu-west-1') {
  const client = new CloudWatchLogsClient({region})

  const command = new FilterLogEventsCommand({
    logGroupName,
    filterPattern: filterPattern || undefined,
    startTime,
    endTime,
    limit,
  })

  const result = await client.send(command)

  /** @type {LogEvent[]} */
  const events = (result.events ?? []).map((e) => ({
    eventId: e.eventId ?? '',
    logStreamName: e.logStreamName ?? '',
    timestamp: e.timestamp ?? 0,
    message: e.message ?? '',
  }))

  const truncated = events.length >= limit || Boolean(result.nextToken)

  return {
    events,
    truncated,
    logGroupName,
    startTime,
    endTime,
    filterPattern: filterPattern ?? '',
  }
}

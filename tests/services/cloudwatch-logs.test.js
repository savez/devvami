import {describe, it, expect, vi, beforeEach} from 'vitest'
import {sinceToEpochMs} from '../../src/services/cloudwatch-logs.js'

// Mock the CloudWatch Logs SDK
vi.mock('@aws-sdk/client-cloudwatch-logs', () => {
  return {
    CloudWatchLogsClient: vi.fn().mockImplementation(() => ({send: vi.fn()})),
    paginateDescribeLogGroups: vi.fn(),
    FilterLogEventsCommand: vi.fn(),
  }
})

describe('sinceToEpochMs', () => {
  it('returns a startTime roughly 1 hour ago for "1h"', () => {
    const before = Date.now()
    const {startTime, endTime} = sinceToEpochMs('1h')
    const after = Date.now()

    expect(endTime).toBeGreaterThanOrEqual(before)
    expect(endTime).toBeLessThanOrEqual(after + 5)
    expect(endTime - startTime).toBeCloseTo(60 * 60 * 1000, -2)
  })

  it('returns a startTime roughly 24 hours ago for "24h"', () => {
    const {startTime, endTime} = sinceToEpochMs('24h')
    expect(endTime - startTime).toBeCloseTo(24 * 60 * 60 * 1000, -2)
  })

  it('returns a startTime roughly 7 days ago for "7d"', () => {
    const {startTime, endTime} = sinceToEpochMs('7d')
    expect(endTime - startTime).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -2)
  })

  it('throws for an invalid since value', () => {
    // @ts-ignore — intentionally invalid
    expect(() => sinceToEpochMs('2d')).toThrow('Invalid since value')
  })
})

describe('listLogGroups', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns paginated log groups as LogGroup[]', async () => {
    const {paginateDescribeLogGroups} = await import('@aws-sdk/client-cloudwatch-logs')

    // Mock async iterable paginator returning 2 pages
    vi.mocked(paginateDescribeLogGroups).mockReturnValue(
      (async function* () {
        yield {
          logGroups: [
            {logGroupName: '/aws/lambda/fn-a', storedBytes: 1024, retentionInDays: 30, creationTime: 1711234567890},
            {logGroupName: '/aws/lambda/fn-b', storedBytes: 2048},
          ],
        }
        yield {
          logGroups: [{logGroupName: '/aws/lambda/fn-c'}],
        }
      })(),
    )

    const {listLogGroups} = await import('../../src/services/cloudwatch-logs.js')
    const groups = await listLogGroups('eu-west-1')

    expect(groups).toHaveLength(3)
    expect(groups[0].name).toBe('/aws/lambda/fn-a')
    expect(groups[0].storedBytes).toBe(1024)
    expect(groups[0].retentionDays).toBe(30)
    expect(groups[0].creationTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(groups[1].name).toBe('/aws/lambda/fn-b')
    expect(groups[2].name).toBe('/aws/lambda/fn-c')
  })
})

describe('filterLogEvents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a LogFilterResult with events', async () => {
    const {CloudWatchLogsClient} = await import('@aws-sdk/client-cloudwatch-logs')
    const mockSend = vi.fn().mockResolvedValue({
      events: [
        {eventId: 'e1', logStreamName: 'stream-a', timestamp: 1711234567890, message: 'hello world'},
        {eventId: 'e2', logStreamName: 'stream-a', timestamp: 1711234568000, message: 'second event'},
      ],
      nextToken: undefined,
    })
    vi.mocked(CloudWatchLogsClient).mockImplementation(() => ({send: mockSend}))

    const {filterLogEvents} = await import('../../src/services/cloudwatch-logs.js')
    const result = await filterLogEvents('/aws/lambda/fn-a', 'ERROR', 1000, 2000, 100)

    expect(result.events).toHaveLength(2)
    expect(result.events[0].eventId).toBe('e1')
    expect(result.events[0].message).toBe('hello world')
    expect(result.truncated).toBe(false)
    expect(result.logGroupName).toBe('/aws/lambda/fn-a')
    expect(result.filterPattern).toBe('ERROR')
  })

  it('sets truncated=true when events count equals the limit', async () => {
    const {CloudWatchLogsClient} = await import('@aws-sdk/client-cloudwatch-logs')
    const events = Array.from({length: 5}, (_, i) => ({
      eventId: `e${i}`,
      logStreamName: 'stream',
      timestamp: 1000 + i,
      message: `msg ${i}`,
    }))
    vi.mocked(CloudWatchLogsClient).mockImplementation(() => ({
      send: vi.fn().mockResolvedValue({events, nextToken: undefined}),
    }))

    const {filterLogEvents} = await import('../../src/services/cloudwatch-logs.js')
    const result = await filterLogEvents('/aws/lambda/fn-a', '', 0, 9999, 5)

    expect(result.truncated).toBe(true)
    expect(result.events).toHaveLength(5)
  })

  it('sets truncated=true when nextToken is present', async () => {
    const {CloudWatchLogsClient} = await import('@aws-sdk/client-cloudwatch-logs')
    vi.mocked(CloudWatchLogsClient).mockImplementation(() => ({
      send: vi.fn().mockResolvedValue({
        events: [{eventId: 'x', logStreamName: 's', timestamp: 0, message: 'm'}],
        nextToken: 'token123',
      }),
    }))

    const {filterLogEvents} = await import('../../src/services/cloudwatch-logs.js')
    const result = await filterLogEvents('/aws/lambda/fn-a', '', 0, 9999, 100)
    expect(result.truncated).toBe(true)
  })
})

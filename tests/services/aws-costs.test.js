import {describe, it, expect, vi, beforeEach} from 'vitest'

// Mock AWS SDK
vi.mock('@aws-sdk/client-cost-explorer', () => ({
  CostExplorerClient: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
  })),
  GetCostAndUsageCommand: vi.fn(),
}))

describe('getServiceCosts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns cost entries with correct structure (service grouping)', async () => {
    const {CostExplorerClient} = await import('@aws-sdk/client-cost-explorer')
    const mockSend = vi.fn().mockResolvedValue({
      ResultsByTime: [
        {
          TimePeriod: {Start: '2026-02-01', End: '2026-03-01'},
          Groups: [
            {Keys: ['AWS Lambda'], Metrics: {UnblendedCost: {Amount: '12.34', Unit: 'USD'}}},
            {Keys: ['API Gateway'], Metrics: {UnblendedCost: {Amount: '5.67', Unit: 'USD'}}},
          ],
        },
      ],
    })
    vi.mocked(CostExplorerClient).mockImplementation(() => ({send: mockSend}))

    const {getServiceCosts} = await import('../../src/services/aws-costs.js')
    const {entries} = await getServiceCosts('my-service', {project: 'my-service'})

    expect(entries).toHaveLength(2)
    expect(entries[0].serviceName).toBe('AWS Lambda')
    expect(entries[0].amount).toBeCloseTo(12.34)
    expect(entries[1].serviceName).toBe('API Gateway')
  })

  it('returns empty entries when no costs found', async () => {
    const {CostExplorerClient} = await import('@aws-sdk/client-cost-explorer')
    vi.mocked(CostExplorerClient).mockImplementation(() => ({
      send: vi.fn().mockResolvedValue({ResultsByTime: []}),
    }))

    const {getServiceCosts} = await import('../../src/services/aws-costs.js')
    const {entries} = await getServiceCosts('unknown-service', {project: 'unknown'})
    expect(entries).toHaveLength(0)
  })

  it('strips tag prefix and returns tagValue for groupBy=tag', async () => {
    const {CostExplorerClient} = await import('@aws-sdk/client-cost-explorer')
    vi.mocked(CostExplorerClient).mockImplementation(() => ({
      send: vi.fn().mockResolvedValue({
        ResultsByTime: [
          {
            Groups: [
              {Keys: ['env$prod'], Metrics: {UnblendedCost: {Amount: '20.00', Unit: 'USD'}}},
              {Keys: ['env$'], Metrics: {UnblendedCost: {Amount: '5.00', Unit: 'USD'}}},
            ],
          },
        ],
      }),
    }))

    const {getServiceCosts} = await import('../../src/services/aws-costs.js')
    const {entries} = await getServiceCosts('svc', {}, 'last-month', 'tag', 'env')

    expect(entries).toHaveLength(2)
    expect(entries[0].serviceName).toBe('prod')
    expect(entries[0].tagValue).toBe('prod')
    expect(entries[1].serviceName).toBe('(untagged)')
    expect(entries[1].tagValue).toBe('(untagged)')
  })

  it('returns correct row labels for groupBy=both', async () => {
    const {CostExplorerClient} = await import('@aws-sdk/client-cost-explorer')
    vi.mocked(CostExplorerClient).mockImplementation(() => ({
      send: vi.fn().mockResolvedValue({
        ResultsByTime: [
          {
            Groups: [{Keys: ['AWS Lambda', 'env$prod'], Metrics: {UnblendedCost: {Amount: '15.00', Unit: 'USD'}}}],
          },
        ],
      }),
    }))

    const {getServiceCosts} = await import('../../src/services/aws-costs.js')
    const {entries} = await getServiceCosts('svc', {}, 'last-month', 'both', 'env')

    expect(entries).toHaveLength(1)
    expect(entries[0].serviceName).toBe('AWS Lambda')
    expect(entries[0].tagValue).toBe('prod')
  })
})

describe('getTrendCosts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns CostTrendSeries[] with daily granularity', async () => {
    const {CostExplorerClient} = await import('@aws-sdk/client-cost-explorer')
    vi.mocked(CostExplorerClient).mockImplementation(() => ({
      send: vi.fn().mockResolvedValue({
        ResultsByTime: [
          {
            TimePeriod: {Start: '2026-01-01'},
            Groups: [{Keys: ['AWS Lambda'], Metrics: {UnblendedCost: {Amount: '5.00', Unit: 'USD'}}}],
          },
          {
            TimePeriod: {Start: '2026-01-02'},
            Groups: [{Keys: ['AWS Lambda'], Metrics: {UnblendedCost: {Amount: '7.00', Unit: 'USD'}}}],
          },
        ],
        NextPageToken: undefined,
      }),
    }))

    const {getTrendCosts} = await import('../../src/services/aws-costs.js')
    const series = await getTrendCosts('service')

    expect(series).toHaveLength(1)
    expect(series[0].name).toBe('AWS Lambda')
    expect(series[0].points).toHaveLength(2)
    expect(series[0].points[0].date).toBe('2026-01-01')
    expect(series[0].points[0].amount).toBeCloseTo(5.0)
  })

  it('handles NextPageToken pagination', async () => {
    const {CostExplorerClient} = await import('@aws-sdk/client-cost-explorer')
    const mockSend = vi
      .fn()
      .mockResolvedValueOnce({
        ResultsByTime: [
          {
            TimePeriod: {Start: '2026-01-01'},
            Groups: [{Keys: ['EC2'], Metrics: {UnblendedCost: {Amount: '3.00', Unit: 'USD'}}}],
          },
        ],
        NextPageToken: 'page2',
      })
      .mockResolvedValueOnce({
        ResultsByTime: [
          {
            TimePeriod: {Start: '2026-01-02'},
            Groups: [{Keys: ['EC2'], Metrics: {UnblendedCost: {Amount: '4.00', Unit: 'USD'}}}],
          },
        ],
        NextPageToken: undefined,
      })

    vi.mocked(CostExplorerClient).mockImplementation(() => ({send: mockSend}))

    const {getTrendCosts} = await import('../../src/services/aws-costs.js')
    const series = await getTrendCosts('service')

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(series[0].points).toHaveLength(2)
    expect(series[0].points[1].amount).toBeCloseTo(4.0)
  })
})

describe('cost formatting helpers', () => {
  it('formats currency correctly', async () => {
    const {formatCurrency} = await import('../../src/formatters/cost.js')
    expect(formatCurrency(12.345)).toBe('$12.35')
  })

  it('calculates total', async () => {
    const {calculateTotal} = await import('../../src/formatters/cost.js')
    const entries = [
      {serviceName: 'A', amount: 10, unit: 'USD', period: {start: '', end: ''}},
      {serviceName: 'B', amount: 5.5, unit: 'USD', period: {start: '', end: ''}},
    ]
    expect(calculateTotal(entries)).toBeCloseTo(15.5)
  })
})

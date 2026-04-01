import {describe, it, expect, vi, beforeEach} from 'vitest'
import {formatCurrency, calculateTotal} from '../../src/formatters/cost.js'

// Mock AWS SDK
vi.mock('@aws-sdk/client-cost-explorer', () => ({
  CostExplorerClient: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
  })),
  GetCostAndUsageCommand: vi.fn(),
}))

describe('getServiceCosts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns cost entries with correct structure', async () => {
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
})

describe('cost formatting helpers', () => {
  it('formats currency correctly', () => {
    expect(formatCurrency(12.345)).toBe('$12.35')
  })

  it('calculates total', () => {
    const entries = [
      {serviceName: 'A', amount: 10, unit: 'USD', period: {start: '', end: ''}},
      {serviceName: 'B', amount: 5.5, unit: 'USD', period: {start: '', end: ''}},
    ]
    expect(calculateTotal(entries)).toBeCloseTo(15.5)
  })
})

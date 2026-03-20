import { describe, it, expect } from 'vitest'
import { formatCurrency, calculateTotal, formatTrend, formatCostTable } from '../../../src/formatters/cost.js'

describe('formatCurrency', () => {
  it('formats positive amount', () => {
    expect(formatCurrency(12.34)).toBe('$12.34')
  })

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00')
  })

  it('rounds to 2 decimal places', () => {
    expect(formatCurrency(1.999)).toBe('$2.00')
  })
})

describe('calculateTotal', () => {
  it('sums amounts', () => {
    const entries = [
      { serviceName: 'Lambda', amount: 10.5, unit: 'USD', period: { start: '', end: '' } },
      { serviceName: 'API Gateway', amount: 5.25, unit: 'USD', period: { start: '', end: '' } },
    ]
    expect(calculateTotal(entries)).toBeCloseTo(15.75)
  })

  it('returns 0 for empty array', () => {
    expect(calculateTotal([])).toBe(0)
  })
})

describe('formatTrend', () => {
  it('calculates positive trend', () => {
    expect(formatTrend(110, 100)).toBe('+10.0%')
  })

  it('calculates negative trend', () => {
    expect(formatTrend(90, 100)).toBe('-10.0%')
  })

  it('handles zero previous', () => {
    expect(formatTrend(50, 0)).toBe('N/A')
  })
})

describe('formatCostTable', () => {
  it('includes service name and total', () => {
    const entries = [
      { serviceName: 'AWS Lambda', amount: 12.34, unit: 'USD', period: { start: '2026-02-01', end: '2026-03-01' } },
    ]
    const output = formatCostTable(entries, 'my-service')
    expect(output).toContain('my-service')
    expect(output).toContain('$12.34')
    expect(output).toContain('Total')
  })
})

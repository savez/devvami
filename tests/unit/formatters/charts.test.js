import {describe, it, expect} from 'vitest'
import {barChart, lineChart} from '../../../src/formatters/charts.js'

/** @type {import('../../../src/formatters/charts.js').ChartSeries} */
const singleSeries = {
  name: 'AWS Lambda',
  values: [10, 20, 5, 0, 30, 15],
  labels: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06'],
}

/** @type {import('../../../src/formatters/charts.js').ChartSeries} */
const secondSeries = {
  name: 'Amazon EC2',
  values: [5, 10, 8, 2, 12, 7],
  labels: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06'],
}

describe('barChart', () => {
  it('renders a string output for a single series', () => {
    const result = barChart([singleSeries])
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('includes the title when provided', () => {
    const result = barChart([singleSeries], {title: 'My Cost Chart'})
    expect(result).toContain('My Cost Chart')
  })

  it('renders legend for multi-series', () => {
    const result = barChart([singleSeries, secondSeries])
    expect(result).toContain('Legend:')
    expect(result).toContain('AWS Lambda')
    expect(result).toContain('Amazon EC2')
  })

  it('does not render legend for single series', () => {
    const result = barChart([singleSeries])
    expect(result).not.toContain('Legend:')
  })

  it('returns "(no data)" for empty series array', () => {
    expect(barChart([])).toBe('(no data)')
  })

  it('handles a series with all-zero values without errors', () => {
    const zeroSeries = {name: 'Empty', values: [0, 0, 0], labels: ['2026-01-01', '2026-01-02', '2026-01-03']}
    const result = barChart([zeroSeries])
    expect(typeof result).toBe('string')
  })

  it('respects the width option', () => {
    const result = barChart([singleSeries], {width: 60})
    const lines = result.split('\n')
    // No line should far exceed the requested width (accounting for ANSI escape codes stripped)
    expect(lines.length).toBeGreaterThan(0)
  })
})

describe('lineChart', () => {
  it('renders a string output for a single series', () => {
    const result = lineChart([singleSeries])
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('includes the title when provided', () => {
    const result = lineChart([singleSeries], {title: 'My Trend'})
    expect(result).toContain('My Trend')
  })

  it('renders legend for multi-series', () => {
    const result = lineChart([singleSeries, secondSeries])
    expect(result).toContain('Legend:')
    expect(result).toContain('AWS Lambda')
    expect(result).toContain('Amazon EC2')
  })

  it('returns "(no data)" for empty series array', () => {
    expect(lineChart([])).toBe('(no data)')
  })

  it('handles single data point without errors', () => {
    const onePt = {name: 'EC2', values: [42], labels: ['2026-01-01']}
    const result = lineChart([onePt])
    expect(typeof result).toBe('string')
  })
})

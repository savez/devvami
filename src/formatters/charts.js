import chalk from 'chalk'

/** @import { ChartSeries } from '../types.js' */

// Colour palette for multi-series charts (cycles if more than 8 series)
const PALETTE = [
  chalk.cyan,
  chalk.yellow,
  chalk.green,
  chalk.magenta,
  chalk.blue,
  chalk.red,
  chalk.white,
  chalk.gray,
]

/**
 * Get the terminal width, falling back to 80 columns.
 * @returns {number}
 */
function terminalWidth() {
  return process.stdout.columns ?? 80
}

/**
 * Scale a value to a bar width in characters.
 * @param {number} value
 * @param {number} max
 * @param {number} maxWidth
 * @returns {number}
 */
function scaleBar(value, max, maxWidth) {
  if (max === 0) return 0
  return Math.round((value / max) * maxWidth)
}

/**
 * Render a single-series or stacked ASCII bar chart.
 *
 * Each series contributes a coloured segment to each bar. With a single series
 * the bars are monochrome cyan. Labels on the x-axis are sampled to avoid
 * overlap at ~10-column intervals.
 *
 * @param {ChartSeries[]} series - One or more data series
 * @param {{ title?: string, width?: number }} [options]
 * @returns {string}
 */
export function barChart(series, options = {}) {
  if (!series.length) return '(no data)'

  const width = options.width ?? Math.min(terminalWidth() - 2, 120)
  const labelColWidth = 12 // space reserved for y-axis labels ($xx.xx)
  const chartWidth = Math.max(width - labelColWidth - 2, 10)

  // Combine all series into per-label totals for scaling
  const allLabels = series[0]?.labels ?? []
  const totals = allLabels.map((_, i) =>
    series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
  )
  const maxTotal = Math.max(...totals, 0)

  const lines = []

  if (options.title) {
    lines.push(chalk.bold(options.title))
    lines.push('─'.repeat(width))
  }

  // Bar rows: one per time label
  const BAR_HEIGHT = 8

  // Build chart column by column (one char per day)
  // We render it as a 2D grid: rows = height levels, cols = days
  const grid = Array.from({ length: BAR_HEIGHT }, () => Array(allLabels.length).fill(' '))

  for (let col = 0; col < allLabels.length; col++) {
    const total = totals[col]
    const barLen = scaleBar(total, maxTotal, BAR_HEIGHT)

    // Determine colour per series for stacked effect (simplified: colour by dominant series)
    let dominantIdx = 0
    let dominantVal = 0
    for (let si = 0; si < series.length; si++) {
      if ((series[si].values[col] ?? 0) > dominantVal) {
        dominantVal = series[si].values[col] ?? 0
        dominantIdx = si
      }
    }
    const colour = PALETTE[dominantIdx % PALETTE.length]

    for (let row = 0; row < barLen; row++) {
      grid[BAR_HEIGHT - 1 - row][col] = colour('█')
    }
  }

  // Render grid rows with y-axis labels on the leftmost and rightmost rows
  for (let row = 0; row < BAR_HEIGHT; row++) {
    let yLabel = '            '
    if (row === 0) {
      yLabel = `$${maxTotal.toFixed(2)}`.padStart(labelColWidth)
    } else if (row === BAR_HEIGHT - 1) {
      yLabel = '$0.00'.padStart(labelColWidth)
    }

    // Sample columns to fit chartWidth (one char per label, spaced if needed)
    const step = Math.max(1, Math.ceil(allLabels.length / chartWidth))
    const rowStr = grid[row].filter((_, i) => i % step === 0).join('')
    lines.push(`${yLabel} ${rowStr}`)
  }

  // X-axis date labels (sample every ~10 positions)
  const step = Math.max(1, Math.ceil(allLabels.length / Math.floor(chartWidth / 10)))
  const xLabels = allLabels
    .filter((_, i) => i % step === 0)
    .map((l) => l.slice(5)) // "MM-DD"
  lines.push(' '.repeat(labelColWidth + 1) + xLabels.join('         '))

  // Legend for multi-series
  if (series.length > 1) {
    lines.push('')
    lines.push(chalk.dim('Legend:'))
    for (let i = 0; i < series.length; i++) {
      const colour = PALETTE[i % PALETTE.length]
      lines.push(`  ${colour('█')}  ${series[i].name}`)
    }
  }

  return lines.join('\n')
}

/**
 * Render an ASCII line chart. Each series is drawn as a distinct coloured line.
 * Values are plotted on a fixed-height canvas using half-block characters.
 *
 * @param {ChartSeries[]} series - One or more data series
 * @param {{ title?: string, width?: number }} [options]
 * @returns {string}
 */
export function lineChart(series, options = {}) {
  if (!series.length) return '(no data)'

  const width = options.width ?? Math.min(terminalWidth() - 2, 120)
  const labelColWidth = 12
  const chartWidth = Math.max(width - labelColWidth - 2, 10)
  const chartHeight = 10

  const allLabels = series[0]?.labels ?? []
  const allValues = series.flatMap((s) => s.values)
  const maxVal = Math.max(...allValues, 0)

  const lines = []

  if (options.title) {
    lines.push(chalk.bold(options.title))
    lines.push('─'.repeat(width))
  }

  // Build a 2D canvas: rows = chartHeight, cols = chartWidth
  const canvas = Array.from({ length: chartHeight }, () =>
    Array(chartWidth).fill(' '),
  )

  const step = Math.max(1, Math.ceil(allLabels.length / chartWidth))

  for (let si = 0; si < series.length; si++) {
    const colour = PALETTE[si % PALETTE.length]
    const sampledValues = series[si].values.filter((_, i) => i % step === 0)

    for (let col = 0; col < Math.min(sampledValues.length, chartWidth); col++) {
      const val = sampledValues[col] ?? 0
      const row = maxVal === 0 ? chartHeight - 1 : chartHeight - 1 - Math.round((val / maxVal) * (chartHeight - 1))
      canvas[Math.max(0, Math.min(row, chartHeight - 1))][col] = colour('●')
    }
  }

  // Render rows with y-axis labels
  for (let row = 0; row < chartHeight; row++) {
    let yLabel = '            '
    if (row === 0) {
      yLabel = `$${maxVal.toFixed(2)}`.padStart(labelColWidth)
    } else if (row === chartHeight - 1) {
      yLabel = '$0.00'.padStart(labelColWidth)
    }
    lines.push(`${yLabel} ${canvas[row].join('')}`)
  }

  // X-axis date labels
  const xStep = Math.max(1, Math.ceil(allLabels.length / Math.floor(chartWidth / 10)))
  const xLabels = allLabels
    .filter((_, i) => i % xStep === 0)
    .map((l) => l.slice(5))
  lines.push(' '.repeat(labelColWidth + 1) + xLabels.join('         '))

  // Legend
  if (series.length > 0) {
    lines.push('')
    lines.push(chalk.dim('Legend:'))
    for (let i = 0; i < series.length; i++) {
      const colour = PALETTE[i % PALETTE.length]
      lines.push(`  ${colour('●')}  ${series[i].name}`)
    }
  }

  return lines.join('\n')
}

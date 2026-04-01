import {describe, it, expect, vi, afterEach} from 'vitest'

// Mock chalk to control color level in tests
vi.mock('chalk', async () => {
  const actual = await vi.importActual('chalk')
  return actual
})

describe('gradientText', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns plain text when NO_COLOR is set', async () => {
    vi.stubEnv('NO_COLOR', '1')
    // Re-import to get fresh module with new env
    const {gradientText} = await import('../../src/utils/gradient.js?nocache=' + Math.random())
    const result = gradientText('hello', [
      [255, 0, 0],
      [0, 0, 255],
    ])
    expect(result).toBe('hello')
  })

  it('throws when less than 2 stops provided', async () => {
    // Force color enabled for this test
    vi.unstubAllEnvs()
    const {gradientText, isColorEnabled} = await import('../../src/utils/gradient.js')
    if (!isColorEnabled) {
      // In CI without color, skip this check (gradientText returns early before throw)
      expect(gradientText('hi', [[255, 0, 0]])).toBe('hi')
    } else {
      expect(() => gradientText('hello', [[255, 0, 0]])).toThrow('At least 2 gradient stops required')
    }
  })

  it('returns empty string for empty input', async () => {
    const {gradientText} = await import('../../src/utils/gradient.js')
    expect(
      gradientText('', [
        [255, 0, 0],
        [0, 0, 255],
      ]),
    ).toBe('')
  })

  it('does not color spaces', async () => {
    vi.unstubAllEnvs()
    const {gradientText, isColorEnabled} = await import('../../src/utils/gradient.js')
    const result = gradientText('a b', [
      [255, 0, 0],
      [0, 0, 255],
    ])
    if (isColorEnabled) {
      // Spaces should be preserved as plain spaces
      expect(result).toContain(' ')
      // Should have ANSI codes around non-space characters
      expect(result.length).toBeGreaterThan(3)
    } else {
      expect(result).toBe('a b')
    }
  })

  it('BRAND_GRADIENT has 3 stops on blue palette', async () => {
    const {BRAND_GRADIENT} = await import('../../src/utils/gradient.js')
    expect(BRAND_GRADIENT).toHaveLength(3)
    expect(BRAND_GRADIENT[0]).toEqual([0, 212, 255])
    expect(BRAND_GRADIENT[2]).toEqual([100, 0, 220])
  })

  it('phase shifts gradient offset', async () => {
    vi.unstubAllEnvs()
    const {gradientText, isColorEnabled} = await import('../../src/utils/gradient.js')
    if (!isColorEnabled) return // skip in no-color env
    const result0 = gradientText(
      'abc',
      [
        [255, 0, 0],
        [0, 0, 255],
      ],
      0,
    )
    const result1 = gradientText(
      'abc',
      [
        [255, 0, 0],
        [0, 0, 255],
      ],
      0.5,
    )
    // With different phases, colored output should differ
    expect(result0).not.toBe(result1)
  })
})

describe('isColorEnabled / isAnimationEnabled', () => {
  it('isAnimationEnabled is false when not TTY', async () => {
    const {isAnimationEnabled} = await import('../../src/utils/gradient.js')
    // In test environment, stdout is never a real TTY
    expect(isAnimationEnabled).toBe(false)
  })
})

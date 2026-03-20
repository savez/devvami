import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/utils/gradient.js', () => ({
  isAnimationEnabled: false, // always no-animation in tests
  BRAND_GRADIENT: [[255, 107, 43], [204, 34, 68], [136, 34, 170]],
  gradientText: vi.fn((text) => text), // pass-through in tests
}))

describe('typewriter', () => {
  let writtenOutput = ''
  beforeEach(() => {
    writtenOutput = ''
    vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
      writtenOutput += data
      return true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints text immediately when not animated (no-TTY)', async () => {
    const { typewriter } = await import('../../src/utils/typewriter.js')
    await typewriter('hello world')
    expect(writtenOutput).toContain('hello world')
    expect(writtenOutput).toContain('\n')
  })

  it('prints text with gradient when gradient option provided', async () => {
    const { gradientText } = await import('../../src/utils/gradient.js')
    const { typewriter } = await import('../../src/utils/typewriter.js')
    await typewriter('test', { gradient: [[255, 0, 0], [0, 0, 255]] })
    expect(gradientText).toHaveBeenCalled()
  })

  it('typewriterLine uses BRAND_GRADIENT', async () => {
    const { gradientText, BRAND_GRADIENT } = await import('../../src/utils/gradient.js')
    const { typewriterLine } = await import('../../src/utils/typewriter.js')
    await typewriterLine('done!')
    expect(gradientText).toHaveBeenCalledWith(expect.any(String), BRAND_GRADIENT)
  })

  it('typewriter completes and writes newline', async () => {
    const { typewriter } = await import('../../src/utils/typewriter.js')
    await typewriter('abc')
    expect(writtenOutput.endsWith('\n')).toBe(true)
  })
})

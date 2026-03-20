import { describe, it, expect, vi } from 'vitest'

describe('detectPlatform', () => {
  it('detects macOS', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' })
    const { detectPlatform } = await import('../../src/services/platform.js')
    const result = await detectPlatform()
    expect(result.platform).toBe('macos')
    expect(result.openCommand).toBe('open')
    expect(result.credentialHelper).toBe('osxkeychain')
    vi.unstubAllGlobals()
  })
})

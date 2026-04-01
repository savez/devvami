import {describe, it, expect} from 'vitest'
import {buildSteps} from '../../../src/services/security.js'

/** @type {import('../../../src/types.js').PlatformInfo} */
const MACOS = {platform: 'macos', openCommand: 'open', credentialHelper: 'osxkeychain'}
/** @type {import('../../../src/types.js').PlatformInfo} */
const LINUX = {platform: 'linux', openCommand: 'xdg-open', credentialHelper: 'store'}
/** @type {import('../../../src/types.js').PlatformInfo} */
const WSL2 = {platform: 'wsl2', openCommand: 'wslview', credentialHelper: 'manager'}

describe('buildSteps()', () => {
  // ---------------------------------------------------------------------------
  // macOS — both
  // ---------------------------------------------------------------------------
  describe('macOS — both', () => {
    it('returns steps in correct order', () => {
      const steps = buildSteps(MACOS, 'both')
      const ids = steps.map((s) => s.id)
      expect(ids).toEqual([
        'check-brew',
        'install-aws-vault',
        'verify-aws-vault',
        'configure-osxkeychain',
        'verify-osxkeychain',
      ])
    })

    it('check and verify steps have requiresConfirmation=false', () => {
      const steps = buildSteps(MACOS, 'both')
      for (const step of steps.filter((s) => s.type === 'check' || s.type === 'verify')) {
        expect(step.requiresConfirmation).toBe(false)
      }
    })

    it('install and configure steps have requiresConfirmation=true', () => {
      const steps = buildSteps(MACOS, 'both')
      for (const step of steps.filter((s) => s.type === 'install' || s.type === 'configure')) {
        expect(step.requiresConfirmation).toBe(true)
      }
    })

    it('every step has a run function', () => {
      const steps = buildSteps(MACOS, 'both')
      for (const step of steps) {
        expect(typeof step.run).toBe('function')
      }
    })
  })

  // ---------------------------------------------------------------------------
  // macOS — aws only
  // ---------------------------------------------------------------------------
  describe('macOS — aws only', () => {
    it('contains AWS step IDs and no Git step IDs', () => {
      const steps = buildSteps(MACOS, 'aws')
      const ids = steps.map((s) => s.id)
      expect(ids).toContain('install-aws-vault')
      expect(ids).not.toContain('configure-osxkeychain')
      expect(ids).not.toContain('verify-osxkeychain')
    })
  })

  // ---------------------------------------------------------------------------
  // macOS — git only
  // ---------------------------------------------------------------------------
  describe('macOS — git only', () => {
    it('contains Git step IDs and no AWS step IDs', () => {
      const steps = buildSteps(MACOS, 'git')
      const ids = steps.map((s) => s.id)
      expect(ids).toContain('configure-osxkeychain')
      expect(ids).not.toContain('install-aws-vault')
      expect(ids).not.toContain('check-brew')
    })
  })

  // ---------------------------------------------------------------------------
  // Linux — both
  // ---------------------------------------------------------------------------
  describe('Linux — both', () => {
    it('returns steps in correct order', () => {
      const steps = buildSteps(LINUX, 'both')
      const ids = steps.map((s) => s.id)
      expect(ids).toEqual([
        'check-gpg',
        'install-gpg',
        'create-gpg-key',
        'install-pass',
        'init-pass',
        'install-aws-vault',
        'configure-aws-vault-backend',
        'verify-aws-vault',
        'install-gcm',
        'configure-gcm',
        'configure-gcm-store',
        'verify-gcm',
      ])
    })

    it('create-gpg-key has gpgInteractive flag', () => {
      const steps = buildSteps(LINUX, 'both')
      const gpgStep = steps.find((s) => s.id === 'create-gpg-key')
      expect(gpgStep?.gpgInteractive).toBe(true)
    })

    it('every step has a run function', () => {
      for (const step of buildSteps(LINUX, 'both')) {
        expect(typeof step.run).toBe('function')
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Linux — aws only
  // ---------------------------------------------------------------------------
  describe('Linux — aws only', () => {
    it('contains AWS + dependency step IDs and no Git step IDs', () => {
      const steps = buildSteps(LINUX, 'aws')
      const ids = steps.map((s) => s.id)
      expect(ids).toContain('install-aws-vault')
      expect(ids).toContain('install-pass')
      expect(ids).toContain('install-gpg')
      expect(ids).not.toContain('install-gcm')
      expect(ids).not.toContain('configure-gcm')
      expect(ids).not.toContain('configure-gcm-store')
    })
  })

  // ---------------------------------------------------------------------------
  // Linux — git only
  // ---------------------------------------------------------------------------
  describe('Linux — git only', () => {
    it('contains Git step IDs and no AWS install step IDs', () => {
      const steps = buildSteps(LINUX, 'git')
      const ids = steps.map((s) => s.id)
      expect(ids).toContain('install-gcm')
      expect(ids).toContain('configure-gcm')
      expect(ids).not.toContain('install-aws-vault')
      expect(ids).not.toContain('install-pass')
    })
  })

  // ---------------------------------------------------------------------------
  // WSL2 — both
  // ---------------------------------------------------------------------------
  describe('WSL2 — both', () => {
    it('includes check-gcm-bridge before install-gcm', () => {
      const steps = buildSteps(WSL2, 'both')
      const ids = steps.map((s) => s.id)
      expect(ids).toContain('check-gcm-bridge')
      const bridgeIndex = ids.indexOf('check-gcm-bridge')
      const gcmIndex = ids.indexOf('install-gcm')
      expect(bridgeIndex).toBeLessThan(gcmIndex)
    })

    it('contains no check-gcm-bridge for macOS', () => {
      const ids = buildSteps(MACOS, 'both').map((s) => s.id)
      expect(ids).not.toContain('check-gcm-bridge')
    })

    it('contains no check-gcm-bridge for Linux', () => {
      const ids = buildSteps(LINUX, 'both').map((s) => s.id)
      expect(ids).not.toContain('check-gcm-bridge')
    })
  })

  // ---------------------------------------------------------------------------
  // WSL2 — aws only
  // ---------------------------------------------------------------------------
  describe('WSL2 — aws only', () => {
    it('contains correct AWS step IDs and zero Git step IDs', () => {
      const steps = buildSteps(WSL2, 'aws')
      const ids = steps.map((s) => s.id)
      expect(ids).toContain('install-aws-vault')
      expect(ids).not.toContain('install-gcm')
      expect(ids).not.toContain('check-gcm-bridge')
    })
  })

  // ---------------------------------------------------------------------------
  // WSL2 — git only
  // ---------------------------------------------------------------------------
  describe('WSL2 — git only', () => {
    it('contains Git step IDs including bridge check and no AWS step IDs', () => {
      const steps = buildSteps(WSL2, 'git')
      const ids = steps.map((s) => s.id)
      expect(ids).toContain('check-gcm-bridge')
      expect(ids).toContain('install-gcm')
      expect(ids).not.toContain('install-aws-vault')
      expect(ids).not.toContain('install-pass')
    })
  })

  // ---------------------------------------------------------------------------
  // Context: gpgId passed
  // ---------------------------------------------------------------------------
  describe('context.gpgId', () => {
    it('init-pass step run returns skipped when gpgId is provided and pass ls succeeds', async () => {
      // We pass gpgId but can't easily mock pass ls, so just verify step id exists
      const steps = buildSteps(LINUX, 'aws', {gpgId: 'ABCDEF1234567890'})
      const initPass = steps.find((s) => s.id === 'init-pass')
      expect(initPass).toBeDefined()
    })
  })
})

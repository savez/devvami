import {describe, it, expect} from 'vitest'

// Test pure logic functions extracted from pr/index.js
/**
 * @param {string} branchName
 * @returns {string}
 */
function titleFromBranch(branchName) {
  const [type, ...rest] = branchName.split('/')
  const desc = rest.join('/').replace(/-/g, ' ')
  const typeMap = {feature: 'Feature', fix: 'Fix', chore: 'Chore', hotfix: 'Hotfix'}
  return `${typeMap[type] ?? type}: ${desc}`
}

/**
 * @param {string} branchType
 * @returns {string[]}
 */
function labelFromType(branchType) {
  const map = {feature: ['feature'], fix: ['bug'], chore: ['chore'], hotfix: ['critical']}
  return map[branchType] ?? []
}

describe('titleFromBranch', () => {
  it('generates title from feature branch', () => {
    expect(titleFromBranch('feature/user-auth')).toBe('Feature: user auth')
  })

  it('generates title from fix branch', () => {
    expect(titleFromBranch('fix/login-timeout')).toBe('Fix: login timeout')
  })

  it('handles multi-segment descriptions', () => {
    expect(titleFromBranch('chore/update-npm-deps')).toBe('Chore: update npm deps')
  })
})

describe('labelFromType', () => {
  it('maps feature to feature label', () => {
    expect(labelFromType('feature')).toEqual(['feature'])
  })

  it('maps fix to bug label', () => {
    expect(labelFromType('fix')).toEqual(['bug'])
  })

  it('maps hotfix to critical label', () => {
    expect(labelFromType('hotfix')).toEqual(['critical'])
  })

  it('returns empty array for unknown type', () => {
    expect(labelFromType('unknown')).toEqual([])
  })
})

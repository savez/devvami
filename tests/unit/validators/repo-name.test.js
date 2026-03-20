import { describe, it, expect } from 'vitest'
import { validateRepoName } from '../../../src/validators/repo-name.js'

describe('validateRepoName', () => {
  it('accepts valid kebab-case name', () => {
    expect(validateRepoName('my-service')).toEqual({ valid: true })
  })

  it('accepts single word', () => {
    expect(validateRepoName('myservice')).toEqual({ valid: true })
  })

  it('rejects empty string', () => {
    const result = validateRepoName('')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('empty')
  })

  it('rejects uppercase', () => {
    const result = validateRepoName('MyService')
    expect(result.valid).toBe(false)
    expect(result.suggestion).toBe('myservice')
  })

  it('rejects spaces', () => {
    const result = validateRepoName('my service')
    expect(result.valid).toBe(false)
    expect(result.suggestion).toBe('my-service')
  })

  it('rejects name exceeding max length', () => {
    const result = validateRepoName('a'.repeat(101))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('too long')
  })
})

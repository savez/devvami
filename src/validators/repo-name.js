const REPO_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_LENGTH = 100

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string} [error]
 * @property {string} [suggestion]
 */

/**
 * Validate a GitHub repository name.
 * @param {string} name
 * @returns {ValidationResult}
 */
export function validateRepoName(name) {
  if (!name || name.length === 0) {
    return {valid: false, error: 'Repository name cannot be empty'}
  }

  if (name.length > MAX_LENGTH) {
    return {
      valid: false,
      error: `Repository name too long (${name.length} chars, max ${MAX_LENGTH})`,
    }
  }

  if (!REPO_NAME_RE.test(name)) {
    const suggested = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    return {
      valid: false,
      error: `Repository name must be lowercase kebab-case. Got "${name}"`,
      suggestion: suggested,
    }
  }

  return {valid: true}
}

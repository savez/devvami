import yaml from 'js-yaml'

/**
 * @typedef {Object} ParsedFrontmatter
 * @property {Record<string, unknown>} frontmatter - Parsed YAML frontmatter object (empty if none)
 * @property {string} body - Body content without frontmatter
 */

/**
 * Parse YAML frontmatter from a markdown string.
 *
 * Expects optional leading `---\n...\n---\n` block.
 * Returns an empty frontmatter object if none is found.
 *
 * @param {string} content - Raw file content
 * @returns {ParsedFrontmatter}
 */
export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)---\r?\n?([\s\S]*)$/)
  if (!match) {
    return {frontmatter: {}, body: content}
  }
  const rawYaml = match[1]
  const body = match[2] ?? ''
  try {
    const parsed = yaml.load(rawYaml)
    const frontmatter =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? /** @type {Record<string, unknown>} */ (parsed)
        : {}
    return {frontmatter, body}
  } catch {
    return {frontmatter: {}, body: content}
  }
}

/**
 * Serialize a frontmatter object and body back into a markdown string.
 *
 * If `frontmatter` is empty (`{}`), returns `body` without a frontmatter block.
 *
 * @param {Record<string, unknown>} frontmatter - Frontmatter data to serialize
 * @param {string} body - Body content
 * @returns {string}
 */
export function serializeFrontmatter(frontmatter, body) {
  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    return body
  }
  const yamlStr = yaml.dump(frontmatter, {lineWidth: -1}).trimEnd()
  return `---\n${yamlStr}\n---\n${body}`
}

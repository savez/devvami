import {load} from 'js-yaml'

/** @import { APIEndpoint, AsyncChannel } from '../types.js' */

/**
 * Parse a YAML or JSON string, returning null on error.
 * @param {string} content
 * @returns {Record<string, unknown>|null}
 */
export function parseYamlOrJson(content) {
  try {
    return JSON.parse(content)
  } catch {
    try {
      return /** @type {Record<string, unknown>} */ (load(content))
    } catch {
      return null
    }
  }
}

/**
 * Check whether a parsed document is an OpenAPI (3.x) or Swagger (2.0) spec.
 * @param {Record<string, unknown>} doc
 * @returns {boolean}
 */
export function isOpenApi(doc) {
  return Boolean(doc?.openapi || doc?.swagger)
}

/**
 * Check whether a parsed document is an AsyncAPI spec (2.x or 3.x).
 * @param {Record<string, unknown>} doc
 * @returns {boolean}
 */
export function isAsyncApi(doc) {
  return Boolean(doc?.asyncapi)
}

/**
 * Parse an OpenAPI/Swagger document into a list of APIEndpoints.
 * @param {string} content - Raw YAML or JSON string
 * @returns {{ endpoints: APIEndpoint[], error: string|null }}
 */
export function parseOpenApi(content) {
  const doc = parseYamlOrJson(content)
  if (!doc || !isOpenApi(doc)) {
    return {endpoints: [], error: 'Not a valid OpenAPI/Swagger document'}
  }

  /** @type {APIEndpoint[]} */
  const endpoints = []
  const paths = /** @type {Record<string, Record<string, unknown>>} */ (doc.paths ?? {})

  for (const [path, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== 'object') continue
    for (const [method, op] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) continue
      const operation = /** @type {Record<string, unknown>} */ (op)
      const rawParams = /** @type {Array<Record<string, unknown>>} */ (operation.parameters ?? [])
      const parameters = rawParams.map((p) => (p.required ? `${p.name}*` : String(p.name))).join(', ')
      endpoints.push({
        method: method.toUpperCase(),
        path,
        summary: String(operation.summary ?? ''),
        parameters,
      })
    }
  }

  return {endpoints, error: null}
}

/**
 * Parse an AsyncAPI document (2.x or 3.x) into a list of AsyncChannels.
 * @param {string} content - Raw YAML or JSON string
 * @returns {{ channels: AsyncChannel[], error: string|null }}
 */
export function parseAsyncApi(content) {
  const doc = parseYamlOrJson(content)
  if (!doc || !isAsyncApi(doc)) {
    return {channels: [], error: 'Not a valid AsyncAPI document'}
  }

  /** @type {AsyncChannel[]} */
  const channels = []
  const version = String(doc.asyncapi ?? '')
  const rawChannels = /** @type {Record<string, unknown>} */ (doc.channels ?? {})

  if (version.startsWith('3')) {
    // AsyncAPI 3.x: channels + operations
    const rawOps = /** @type {Record<string, Record<string, unknown>>} */ (doc.operations ?? {})
    for (const [channelName] of Object.entries(rawChannels)) {
      const matchingOps = Object.values(rawOps).filter((op) => {
        const ch = /** @type {Record<string, unknown>} */ (op.channel ?? {})
        return String(ch.$ref ?? '').includes(channelName) || String(ch ?? '') === channelName
      })
      if (matchingOps.length === 0) {
        channels.push({channel: channelName, operation: '—', summary: '', message: '—'})
      }
      for (const op of matchingOps) {
        const msgTitle = resolveMessageTitle(op.messages)
        channels.push({
          channel: channelName,
          operation: String(op.action ?? '—'),
          summary: String(op.summary ?? ''),
          message: msgTitle,
        })
      }
    }
  } else {
    // AsyncAPI 2.x: channels[name].publish / .subscribe
    for (const [channelName, channelDef] of Object.entries(rawChannels)) {
      const def = /** @type {Record<string, unknown>} */ (channelDef ?? {})
      for (const op of ['publish', 'subscribe']) {
        if (!def[op]) continue
        const opDef = /** @type {Record<string, unknown>} */ (def[op])
        const msgDef = /** @type {Record<string, unknown>} */ (opDef.message ?? {})
        const msgTitle = String(msgDef.name ?? msgDef.title ?? '—')
        channels.push({
          channel: channelName,
          operation: op,
          summary: String(opDef.summary ?? ''),
          message: msgTitle,
        })
      }
    }
  }

  return {channels, error: null}
}

/**
 * Resolve a message title from an AsyncAPI 3.x messages ref list.
 * @param {unknown} messages
 * @returns {string}
 */
function resolveMessageTitle(messages) {
  if (!messages || typeof messages !== 'object') return '—'
  const msgs = Object.values(/** @type {Record<string, unknown>} */ (messages))
  if (msgs.length === 0) return '—'
  const first = /** @type {Record<string, unknown>} */ (msgs[0])
  return String(first.name ?? first.title ?? '—')
}

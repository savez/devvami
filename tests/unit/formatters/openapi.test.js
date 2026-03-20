import { describe, it, expect } from 'vitest'
import {
  parseOpenApi,
  parseAsyncApi,
  isOpenApi,
  isAsyncApi,
} from '../../../src/formatters/openapi.js'

const OPENAPI_3_YAML = `
openapi: '3.0.0'
info:
  title: Test API
  version: '1.0'
paths:
  /users:
    get:
      summary: List users
      parameters:
        - name: q
          in: query
          required: false
    post:
      summary: Create user
      parameters:
        - name: body
          in: body
          required: true
  /users/{id}:
    get:
      summary: Get user
      parameters:
        - name: id
          in: path
          required: true
`

const SWAGGER_2_YAML = `
swagger: '2.0'
info:
  title: Swagger Test
  version: '1.0'
paths:
  /items:
    get:
      summary: List items
`

const ASYNCAPI_2_YAML = `
asyncapi: '2.0.0'
info:
  title: Events
  version: '1.0'
channels:
  user/created:
    subscribe:
      summary: User created event
      message:
        name: UserCreated
        title: UserCreated
  user/deleted:
    publish:
      summary: Delete user command
      message:
        name: DeleteUser
`

describe('isOpenApi', () => {
  it('returns true for OpenAPI 3.x doc', () => {
    expect(isOpenApi({ openapi: '3.0.0' })).toBe(true)
  })

  it('returns true for Swagger 2.0 doc', () => {
    expect(isOpenApi({ swagger: '2.0' })).toBe(true)
  })

  it('returns false for non-OpenAPI doc', () => {
    expect(isOpenApi({ asyncapi: '2.0.0' })).toBe(false)
    expect(isOpenApi({})).toBe(false)
  })
})

describe('isAsyncApi', () => {
  it('returns true for AsyncAPI doc', () => {
    expect(isAsyncApi({ asyncapi: '2.0.0' })).toBe(true)
    expect(isAsyncApi({ asyncapi: '3.0.0' })).toBe(true)
  })

  it('returns false for non-AsyncAPI doc', () => {
    expect(isAsyncApi({ openapi: '3.0.0' })).toBe(false)
    expect(isAsyncApi({})).toBe(false)
  })
})

describe('parseOpenApi', () => {
  it('parses a valid OpenAPI 3.x YAML', () => {
    const { endpoints, error } = parseOpenApi(OPENAPI_3_YAML)
    expect(error).toBeNull()
    expect(endpoints.length).toBeGreaterThan(0)

    const listUsers = endpoints.find((e) => e.path === '/users' && e.method === 'GET')
    expect(listUsers).toBeDefined()
    expect(listUsers?.summary).toBe('List users')
    expect(listUsers?.parameters).toBe('q')

    const createUser = endpoints.find((e) => e.path === '/users' && e.method === 'POST')
    expect(createUser?.parameters).toBe('body*')
  })

  it('parses a valid Swagger 2.0 YAML', () => {
    const { endpoints, error } = parseOpenApi(SWAGGER_2_YAML)
    expect(error).toBeNull()
    expect(endpoints.some((e) => e.path === '/items' && e.method === 'GET')).toBe(true)
  })

  it('returns error for non-OpenAPI content', () => {
    const { endpoints, error } = parseOpenApi('# Just a markdown document')
    expect(endpoints).toHaveLength(0)
    expect(error).toBeTruthy()
  })

  it('returns error for invalid YAML', () => {
    const { endpoints, error } = parseOpenApi(': invalid: yaml: :::')
    expect(endpoints).toHaveLength(0)
    expect(error).toBeTruthy()
  })

  it('parses valid JSON input', () => {
    const json = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'T', version: '1' },
      paths: {
        '/ping': { get: { summary: 'Ping' } },
      },
    })
    const { endpoints, error } = parseOpenApi(json)
    expect(error).toBeNull()
    expect(endpoints[0].path).toBe('/ping')
  })
})

describe('parseAsyncApi', () => {
  it('parses AsyncAPI 2.x YAML with publish/subscribe', () => {
    const { channels, error } = parseAsyncApi(ASYNCAPI_2_YAML)
    expect(error).toBeNull()
    expect(channels.length).toBeGreaterThanOrEqual(2)

    const sub = channels.find((c) => c.channel === 'user/created' && c.operation === 'subscribe')
    expect(sub).toBeDefined()
    expect(sub?.summary).toBe('User created event')
    expect(sub?.message).toBe('UserCreated')

    const pub = channels.find((c) => c.channel === 'user/deleted' && c.operation === 'publish')
    expect(pub).toBeDefined()
    expect(pub?.message).toBe('DeleteUser')
  })

  it('returns error for non-AsyncAPI content', () => {
    const { channels, error } = parseAsyncApi('# Not asyncapi')
    expect(channels).toHaveLength(0)
    expect(error).toBeTruthy()
  })

  it('returns error for invalid YAML', () => {
    const { channels, error } = parseAsyncApi('::: bad yaml')
    expect(channels).toHaveLength(0)
    expect(error).toBeTruthy()
  })
})

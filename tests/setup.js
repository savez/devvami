import {setupServer} from 'msw/node'
import {handlers} from './fixtures/msw-handlers.js'
import {beforeAll, afterAll, afterEach} from 'vitest'

export const server = setupServer(...handlers)

beforeAll(() => server.listen({onUnhandledRequest: 'warn'}))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

import {describe, it, expect, beforeEach, vi} from 'vitest'
import {vol} from 'memfs'

vi.mock('node:fs', async () => {
  const {fs} = await import('memfs')
  return fs
})
vi.mock('node:fs/promises', async () => {
  const {fs} = await import('memfs')
  return fs.promises
})

const CONFIG_PATH = '/tmp/dvmi-test/config.json'

describe('loadConfig', () => {
  beforeEach(() => vol.reset())

  it('returns defaults when config missing', async () => {
    const {loadConfig} = await import('../../src/services/config.js')
    const config = await loadConfig(CONFIG_PATH)
    expect(config.org).toBe('')
    expect(config.awsRegion).toBe('eu-west-1')
  })

  it('reads existing config', async () => {
    vol.fromJSON({[CONFIG_PATH]: JSON.stringify({org: 'acme', awsProfile: 'dev'})})
    const {loadConfig} = await import('../../src/services/config.js')
    const config = await loadConfig(CONFIG_PATH)
    expect(config.org).toBe('acme')
    expect(config.awsProfile).toBe('dev')
  })
})

describe('saveConfig', () => {
  beforeEach(() => vol.reset())

  it('creates config file', async () => {
    const {saveConfig, loadConfig} = await import('../../src/services/config.js')
    await saveConfig({org: 'test', awsProfile: 'prod', awsRegion: 'us-east-1'}, CONFIG_PATH)
    const config = await loadConfig(CONFIG_PATH)
    expect(config.org).toBe('test')
  })
})

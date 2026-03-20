import { describe, it, expect } from 'vitest'
import { runCli } from './helpers.js'

describe('pr review', () => {
  it('mostra errore se org non configurata', async () => {
    // DVMI_CONFIG_PATH punta a file inesistente → config vuota → errore non-zero
    const { exitCode } = await runCli(['pr', 'review'])
    expect(exitCode).not.toBe(0)
  })
})

describe('pr detail', () => {
  it('errore se --repo non è nel formato owner/repo', async () => {
    const { exitCode, stderr } = await runCli(['pr', 'detail', '42', '--repo', 'repo-senza-owner'])
    expect(exitCode).not.toBe(0)
    expect(stderr).toContain('owner/repo')
  })

  it('errore se manca il numero PR', async () => {
    const { exitCode } = await runCli(['pr', 'detail'])
    expect(exitCode).not.toBe(0)
  })
})

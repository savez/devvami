import {describe, it, expect} from 'vitest'
import {runCli, runCliJson} from './helpers.js'

// Tests that call the real ClickUp API require a token in the keychain.
// In CI there are no real credentials, so we skip those tests.
const isCI = Boolean(process.env.CI)

describe('tasks assigned', () => {
  it.skipIf(isCI)('shows assigned tasks table with Lista and Cartella columns', async () => {
    const {stdout, exitCode} = await runCli(['tasks', 'assigned'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Your assigned tasks')
    expect(stdout).toContain('Lista')
    expect(stdout).toContain('Cartella')
  })

  it.skipIf(isCI)('--json returns tasks array with list/folder fields', async () => {
    const data = await runCliJson(['tasks', 'assigned'])
    expect(data).toHaveProperty('tasks')
    expect(Array.isArray(data.tasks)).toBe(true)
    expect(data.tasks.length).toBeGreaterThan(0)
    const task = data.tasks[0]
    expect(task).toHaveProperty('id')
    expect(task).toHaveProperty('name')
    expect(task).toHaveProperty('listId')
    expect(task).toHaveProperty('listName')
    expect(task).toHaveProperty('folderId')
    expect(task).toHaveProperty('folderName')
  })

  it('--help shows command description', async () => {
    const {stdout, exitCode} = await runCli(['tasks', 'assigned', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('assigned')
  })
})

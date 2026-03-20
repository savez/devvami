import { describe, it, expect } from 'vitest'
import { runCli, runCliJson } from './helpers.js'

// Tests that call the real ClickUp API require a token in the keychain.
// In CI there are no real credentials, so we skip those tests.
const isCI = Boolean(process.env.CI)

describe('--json flag', () => {
  it('doctor --json returns valid JSON with checks array', async () => {
    const { stdout, exitCode } = await runCli(['doctor', '--json'])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data).toHaveProperty('checks')
    expect(Array.isArray(data.checks)).toBe(true)
    expect(data).toHaveProperty('summary')
    expect(data.summary).toHaveProperty('ok')
    expect(data.summary).toHaveProperty('warn')
    expect(data.summary).toHaveProperty('fail')
  })

  it('changelog --json returns sections object', async () => {
    const { stdout, exitCode } = await runCli(['changelog', '--json'])
    // May fail if not in a git repo with tags, but should produce valid JSON or non-zero exit
    if (exitCode === 0) {
      const data = JSON.parse(stdout)
      expect(data).toHaveProperty('sections')
    }
  })

  it.skipIf(isCI)('tasks list --json returns tasks with listId/listName/folderId/folderName', async () => {
    const data = await runCliJson(['tasks', 'list'])
    expect(data).toHaveProperty('tasks')
    expect(Array.isArray(data.tasks)).toBe(true)
    if (data.tasks.length > 0) {
      const task = data.tasks[0]
      expect(task).toHaveProperty('listId')
      expect(task).toHaveProperty('listName')
      expect(task).toHaveProperty('folderId')
      expect(task).toHaveProperty('folderName')
    }
  })

  it.skipIf(isCI)('tasks assigned --json returns same shape as tasks list --json', async () => {
    const listData = await runCliJson(['tasks', 'list'])
    const assignedData = await runCliJson(['tasks', 'assigned'])
    // Both must have the tasks array
    expect(listData).toHaveProperty('tasks')
    expect(assignedData).toHaveProperty('tasks')
    // If both have tasks, the field shapes must match
    if (listData.tasks.length > 0 && assignedData.tasks.length > 0) {
      const listKeys = Object.keys(listData.tasks[0]).sort()
      const assignedKeys = Object.keys(assignedData.tasks[0]).sort()
      expect(assignedKeys).toEqual(listKeys)
    }
  })
})

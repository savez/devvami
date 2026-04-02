import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'

vi.mock('node:fs')

import {existsSync, readFileSync, readdirSync} from 'node:fs'
import {
  scanEnvironments,
  getCompatibleEnvironments,
  computeCategoryCounts,
  parseNativeEntries,
  getSharedPathGroups,
  ENVIRONMENTS,
} from '../../../src/services/ai-env-scanner.js'

const CWD = '/fake/project'

beforeEach(() => {
  vi.mocked(readdirSync).mockReturnValue([])
  // Default: nothing exists
  vi.mocked(existsSync).mockReturnValue(false)
  vi.mocked(readFileSync).mockReturnValue('{}')
})

afterEach(() => {
  vi.resetAllMocks()
})

// ──────────────────────────────────────────────────────────────────────────────
// scanEnvironments
// ──────────────────────────────────────────────────────────────────────────────

describe('scanEnvironments', () => {
  it('returns only detected environments when some paths exist', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('CLAUDE.md'))

    const result = scanEnvironments(CWD)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('claude-code')
    expect(result[0].detected).toBe(true)
  })

  it('returns empty array when no paths exist', () => {
    vi.mocked(existsSync).mockReturnValue(false)

    const result = scanEnvironments(CWD)

    expect(result).toHaveLength(0)
  })

  it('marks JSON file as unreadable when it exists but cannot be parsed', () => {
    // .mcp.json exists but contains invalid JSON
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('.mcp.json'))
    vi.mocked(readFileSync).mockReturnValue('not valid json {{{}')

    const result = scanEnvironments(CWD)

    expect(result).toHaveLength(1)
    const env = result[0]
    expect(env.id).toBe('claude-code')

    const mcpJsonStatus = env.projectPaths.find((s) => s.path.endsWith('.mcp.json'))
    expect(mcpJsonStatus).toBeDefined()
    expect(mcpJsonStatus.exists).toBe(true)
    expect(mcpJsonStatus.readable).toBe(false)
    expect(env.unreadable).toHaveLength(1)
    expect(env.unreadable[0]).toMatch(/.mcp.json$/)
  })

  it('marks JSON file as readable when it exists and parses successfully', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('.mcp.json'))
    vi.mocked(readFileSync).mockReturnValue('{"mcpServers":{}}')

    const result = scanEnvironments(CWD)

    expect(result).toHaveLength(1)
    const mcpJsonStatus = result[0].projectPaths.find((s) => s.path.endsWith('.mcp.json'))
    expect(mcpJsonStatus.exists).toBe(true)
    expect(mcpJsonStatus.readable).toBe(true)
    expect(result[0].unreadable).toHaveLength(0)
  })

  it('computes scope as "project" when only project paths exist', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('CLAUDE.md'))

    const result = scanEnvironments(CWD)

    expect(result[0].scope).toBe('project')
  })

  it('computes scope as "global" when only global paths exist', () => {
    // gemini-cli has both project (GEMINI.md) and global paths; trigger only global
    vi.mocked(existsSync).mockImplementation((p) => String(p).includes('.gemini/settings.json'))

    const result = scanEnvironments(CWD)

    const gemini = result.find((e) => e.id === 'gemini-cli')
    expect(gemini).toBeDefined()
    expect(gemini.scope).toBe('global')
  })

  it('computes scope as "both" when project and global paths both exist', () => {
    // GEMINI.md (project) + ~/.gemini/settings.json (global)
    vi.mocked(existsSync).mockImplementation(
      (p) => String(p).endsWith('GEMINI.md') || String(p).includes('.gemini/settings.json'),
    )

    const result = scanEnvironments(CWD)

    const gemini = result.find((e) => e.id === 'gemini-cli')
    expect(gemini).toBeDefined()
    expect(gemini.scope).toBe('both')
  })

  it('each detected environment has the correct supportedCategories', () => {
    // Make every first project/global path of every env exist
    const firstProjectPaths = [
      'copilot-instructions.md', // vscode-copilot: .github/copilot-instructions.md
      'CLAUDE.md', // claude-code
      'AGENTS.md', // opencode
      'GEMINI.md', // gemini-cli
    ]

    vi.mocked(existsSync).mockImplementation((p) => {
      const str = String(p)
      return firstProjectPaths.some((fp) => str.endsWith(fp)) || str.includes('.copilot/config.json')
    })

    const result = scanEnvironments(CWD)

    const byId = Object.fromEntries(result.map((e) => [e.id, e]))

    expect(byId['vscode-copilot']?.supportedCategories).toEqual(['mcp', 'command', 'rule', 'skill', 'agent'])
    expect(byId['claude-code']?.supportedCategories).toEqual(['mcp', 'command', 'rule', 'skill', 'agent'])
    expect(byId['opencode']?.supportedCategories).toEqual(['mcp', 'command', 'rule', 'skill', 'agent'])
    expect(byId['gemini-cli']?.supportedCategories).toEqual(['mcp', 'command', 'rule'])
    expect(byId['copilot-cli']?.supportedCategories).toEqual(['mcp', 'command', 'rule', 'skill', 'agent'])
  })

  it('non-JSON paths are always readable when they exist', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('CLAUDE.md'))

    const result = scanEnvironments(CWD)

    const claudeMdStatus = result[0].projectPaths.find((s) => s.path.endsWith('CLAUDE.md'))
    expect(claudeMdStatus.exists).toBe(true)
    expect(claudeMdStatus.readable).toBe(true)
    expect(result[0].unreadable).toHaveLength(0)
  })

  it('initialises counts to all zeros', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('CLAUDE.md'))

    const result = scanEnvironments(CWD)

    expect(result[0].counts).toEqual({mcp: 0, command: 0, rule: 0, skill: 0, agent: 0})
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// getCompatibleEnvironments
// ──────────────────────────────────────────────────────────────────────────────

describe('getCompatibleEnvironments', () => {
  /** @type {import('../../../src/services/ai-env-scanner.js').DetectedEnvironment[]} */
  const allDetected = [
    {
      id: 'vscode-copilot',
      name: 'VS Code Copilot',
      detected: true,
      projectPaths: [],
      globalPaths: [],
      unreadable: [],
      supportedCategories: ['mcp', 'command', 'skill', 'agent'],
      counts: {mcp: 0, command: 0, skill: 0, agent: 0},
      scope: 'project',
    },
    {
      id: 'claude-code',
      name: 'Claude Code',
      detected: true,
      projectPaths: [],
      globalPaths: [],
      unreadable: [],
      supportedCategories: ['mcp', 'command', 'skill', 'agent'],
      counts: {mcp: 0, command: 0, skill: 0, agent: 0},
      scope: 'project',
    },
    {
      id: 'opencode',
      name: 'OpenCode',
      detected: true,
      projectPaths: [],
      globalPaths: [],
      unreadable: [],
      supportedCategories: ['mcp', 'command', 'skill', 'agent'],
      counts: {mcp: 0, command: 0, skill: 0, agent: 0},
      scope: 'project',
    },
    {
      id: 'gemini-cli',
      name: 'Gemini CLI',
      detected: true,
      projectPaths: [],
      globalPaths: [],
      unreadable: [],
      supportedCategories: ['mcp', 'command'],
      counts: {mcp: 0, command: 0, skill: 0, agent: 0},
      scope: 'global',
    },
    {
      id: 'copilot-cli',
      name: 'GitHub Copilot CLI',
      detected: true,
      projectPaths: [],
      globalPaths: [],
      unreadable: [],
      supportedCategories: ['mcp', 'command', 'skill', 'agent'],
      counts: {mcp: 0, command: 0, skill: 0, agent: 0},
      scope: 'global',
    },
  ]

  it('filters by type "agent" — excludes gemini-cli', () => {
    const result = getCompatibleEnvironments('agent', allDetected)

    expect(result).not.toContain('gemini-cli')
    expect(result).toContain('vscode-copilot')
    expect(result).toContain('claude-code')
    expect(result).toContain('opencode')
    expect(result).toContain('copilot-cli')
  })

  it('filters by type "skill" — excludes gemini-cli', () => {
    const result = getCompatibleEnvironments('skill', allDetected)

    expect(result).not.toContain('gemini-cli')
    expect(result).toHaveLength(4)
  })

  it('returns all env ids when type is "mcp" (every env supports mcp)', () => {
    const result = getCompatibleEnvironments('mcp', allDetected)

    expect(result).toHaveLength(5)
    expect(result).toContain('gemini-cli')
  })

  it('returns all env ids when type is "command" (every env supports command)', () => {
    const result = getCompatibleEnvironments('command', allDetected)

    expect(result).toHaveLength(5)
  })

  it('returns empty array when detectedEnvs is empty', () => {
    expect(getCompatibleEnvironments('mcp', [])).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// computeCategoryCounts
// ──────────────────────────────────────────────────────────────────────────────

describe('computeCategoryCounts', () => {
  it('counts active entries for the given environment', () => {
    /** @type {import('../../../src/types.js').CategoryEntry[]} */
    const entries = [
      {
        id: '1',
        name: 'my-mcp',
        type: 'mcp',
        active: true,
        environments: ['claude-code'],
        params: {transport: 'stdio', command: 'node', args: ['server.js']},
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        name: 'my-command',
        type: 'command',
        active: true,
        environments: ['claude-code', 'vscode-copilot'],
        params: {content: 'do something'},
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: '3',
        name: 'my-agent',
        type: 'agent',
        active: true,
        environments: ['claude-code'],
        params: {instructions: 'be helpful'},
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]

    const counts = computeCategoryCounts('claude-code', entries)

    expect(counts).toEqual({mcp: 1, command: 1, rule: 0, skill: 0, agent: 1})
  })

  it('excludes inactive entries', () => {
    /** @type {import('../../../src/types.js').CategoryEntry[]} */
    const entries = [
      {
        id: '1',
        name: 'disabled-mcp',
        type: 'mcp',
        active: false,
        environments: ['claude-code'],
        params: {transport: 'stdio', command: 'node', args: []},
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        name: 'active-command',
        type: 'command',
        active: true,
        environments: ['claude-code'],
        params: {content: 'do something'},
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]

    const counts = computeCategoryCounts('claude-code', entries)

    expect(counts.mcp).toBe(0)
    expect(counts.command).toBe(1)
  })

  it('returns all zeros when no entries match the environment', () => {
    /** @type {import('../../../src/types.js').CategoryEntry[]} */
    const entries = [
      {
        id: '1',
        name: 'vscode-mcp',
        type: 'mcp',
        active: true,
        environments: ['vscode-copilot'],
        params: {transport: 'stdio', command: 'node', args: []},
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]

    const counts = computeCategoryCounts('claude-code', entries)

    expect(counts).toEqual({mcp: 0, command: 0, rule: 0, skill: 0, agent: 0})
  })

  it('returns all zeros when entries array is empty', () => {
    const counts = computeCategoryCounts('claude-code', [])

    expect(counts).toEqual({mcp: 0, command: 0, rule: 0, skill: 0, agent: 0})
  })

  it('counts entries correctly when env appears in a multi-env list', () => {
    /** @type {import('../../../src/types.js').CategoryEntry[]} */
    const entries = [
      {
        id: '1',
        name: 'shared-skill',
        type: 'skill',
        active: true,
        environments: ['claude-code', 'opencode', 'vscode-copilot'],
        params: {content: 'skill content'},
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        name: 'claude-only-skill',
        type: 'skill',
        active: true,
        environments: ['claude-code'],
        params: {content: 'another skill'},
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]

    const counts = computeCategoryCounts('claude-code', entries)

    expect(counts.skill).toBe(2)
    expect(counts.mcp).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 10 environments detection (T011)
// ──────────────────────────────────────────────────────────────────────────────

describe('scanEnvironments — 10 environments', () => {
  it('detects cursor via .cursor/mcp.json', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('.cursor/mcp.json'))
    vi.mocked(readFileSync).mockReturnValue('{"mcpServers":{}}')

    const result = scanEnvironments(CWD)

    expect(result.some((e) => e.id === 'cursor')).toBe(true)
  })

  it('detects windsurf via .windsurf/rules directory', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('.windsurf/rules'))

    const result = scanEnvironments(CWD)

    expect(result.some((e) => e.id === 'windsurf')).toBe(true)
  })

  it('detects continue-dev via .continue/config.yaml', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('.continue/config.yaml'))

    const result = scanEnvironments(CWD)

    expect(result.some((e) => e.id === 'continue-dev')).toBe(true)
  })

  it('detects zed via .rules', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('.rules'))

    const result = scanEnvironments(CWD)

    expect(result.some((e) => e.id === 'zed')).toBe(true)
  })

  it('detects amazon-q via .amazonq/mcp.json', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('.amazonq/mcp.json'))
    vi.mocked(readFileSync).mockReturnValue('{"mcpServers":{}}')

    const result = scanEnvironments(CWD)

    expect(result.some((e) => e.id === 'amazon-q')).toBe(true)
  })

  it('ENVIRONMENTS array contains all 10 environments', () => {
    const ids = ENVIRONMENTS.map((e) => e.id)
    expect(ids).toContain('vscode-copilot')
    expect(ids).toContain('claude-code')
    expect(ids).toContain('opencode')
    expect(ids).toContain('gemini-cli')
    expect(ids).toContain('copilot-cli')
    expect(ids).toContain('cursor')
    expect(ids).toContain('windsurf')
    expect(ids).toContain('continue-dev')
    expect(ids).toContain('zed')
    expect(ids).toContain('amazon-q')
    expect(ids).toHaveLength(10)
  })

  it('cursor supportedCategories includes rule but not agent', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('.cursor/mcp.json'))
    vi.mocked(readFileSync).mockReturnValue('{"mcpServers":{}}')

    const result = scanEnvironments(CWD)
    const cursor = result.find((e) => e.id === 'cursor')

    expect(cursor?.supportedCategories).toContain('rule')
    expect(cursor?.supportedCategories).not.toContain('agent')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// parseNativeEntries (T011)
// ──────────────────────────────────────────────────────────────────────────────

describe('parseNativeEntries', () => {
  const claudeCodeDef = ENVIRONMENTS.find((e) => e.id === 'claude-code')

  it('returns MCP entries from .mcp.json', () => {
    const mcpJson = JSON.stringify({mcpServers: {'my-server': {command: 'npx', args: ['-y', 'server'], type: 'stdio'}}})
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('.mcp.json'))
    vi.mocked(readFileSync).mockReturnValue(mcpJson)

    const result = parseNativeEntries(claudeCodeDef, CWD, [])

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('my-server')
    expect(result[0].type).toBe('mcp')
    expect(result[0].environmentId).toBe('claude-code')
    expect(result[0].level).toBe('project')
    expect(result[0].params.command).toBe('npx')
  })

  it('excludes managed entries matched by name+type', () => {
    const mcpJson = JSON.stringify({mcpServers: {'managed-server': {command: 'node'}, 'native-server': {command: 'npx'}}})
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('.mcp.json'))
    vi.mocked(readFileSync).mockReturnValue(mcpJson)

    const managedEntries = [
      {
        id: '1',
        name: 'managed-server',
        type: 'mcp',
        active: true,
        environments: ['claude-code'],
        params: {transport: 'stdio', command: 'node'},
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]

    const result = parseNativeEntries(claudeCodeDef, CWD, managedEntries)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('native-server')
  })

  it('returns file-based rule entries from .claude/rules/ directory', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).includes('.claude/rules'))
    vi.mocked(readdirSync).mockImplementation((p) => {
      if (String(p).endsWith('.claude/rules')) {
        return /** @type {any} */ ([{name: 'my-rule.md', isFile: () => true, isDirectory: () => false}])
      }
      return []
    })

    const result = parseNativeEntries(claudeCodeDef, CWD, [])
    const rules = result.filter((e) => e.type === 'rule')

    expect(rules.length).toBeGreaterThanOrEqual(1)
    expect(rules.some((r) => r.name === 'my-rule')).toBe(true)
  })

  it('returns empty array when no config files exist', () => {
    vi.mocked(existsSync).mockReturnValue(false)

    const result = parseNativeEntries(claudeCodeDef, CWD, [])

    expect(result).toHaveLength(0)
  })

  it('returns entries from command directory', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).includes('.claude/commands'))
    vi.mocked(readdirSync).mockImplementation((p) => {
      if (String(p).endsWith('.claude/commands')) {
        return /** @type {any} */ ([
          {name: 'refactor.md', isFile: () => true, isDirectory: () => false},
          {name: 'review.md', isFile: () => true, isDirectory: () => false},
        ])
      }
      return []
    })

    const result = parseNativeEntries(claudeCodeDef, CWD, [])
    const cmds = result.filter((e) => e.type === 'command')

    expect(cmds).toHaveLength(2)
    expect(cmds.map((c) => c.name)).toContain('refactor')
    expect(cmds.map((c) => c.name)).toContain('review')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// getSharedPathGroups (T011)
// ──────────────────────────────────────────────────────────────────────────────

describe('getSharedPathGroups', () => {
  it('returns mcp group for claude-code and copilot-cli', () => {
    const groups = getSharedPathGroups('mcp')
    expect(groups.some((g) => g.includes('claude-code') && g.includes('copilot-cli'))).toBe(true)
  })

  it('returns command group for vscode-copilot and copilot-cli', () => {
    const groups = getSharedPathGroups('command')
    expect(groups.some((g) => g.includes('vscode-copilot') && g.includes('copilot-cli'))).toBe(true)
  })

  it('returns empty array for skill', () => {
    const groups = getSharedPathGroups('skill')
    expect(groups).toHaveLength(0)
  })

  it('returns group for agent (vscode-copilot and copilot-cli share .github/agents/)', () => {
    const groups = getSharedPathGroups('agent')
    expect(groups.some((g) => g.includes('vscode-copilot') && g.includes('copilot-cli'))).toBe(true)
  })
})

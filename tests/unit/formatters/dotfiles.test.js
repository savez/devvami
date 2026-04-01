import {describe, it, expect} from 'vitest'
import {
  formatDotfilesSetup,
  formatDotfilesSummary,
  formatDotfilesStatus,
  formatDotfilesAdd,
  formatDotfilesSync,
} from '../../../src/formatters/dotfiles.js'

// ---------------------------------------------------------------------------
// formatDotfilesSummary
// ---------------------------------------------------------------------------
describe('formatDotfilesSummary()', () => {
  it('formats counts correctly', () => {
    const result = formatDotfilesSummary({total: 12, encrypted: 3, plaintext: 9})
    expect(result).toBe('12 total: 9 plaintext, 3 encrypted')
  })

  it('handles zero counts', () => {
    const result = formatDotfilesSummary({total: 0, encrypted: 0, plaintext: 0})
    expect(result).toBe('0 total: 0 plaintext, 0 encrypted')
  })

  it('handles all encrypted', () => {
    const result = formatDotfilesSummary({total: 5, encrypted: 5, plaintext: 0})
    expect(result).toBe('5 total: 0 plaintext, 5 encrypted')
  })
})

// ---------------------------------------------------------------------------
// formatDotfilesSetup
// ---------------------------------------------------------------------------
describe('formatDotfilesSetup()', () => {
  it('includes platform and status for success', () => {
    const result = formatDotfilesSetup({
      platform: 'macos',
      chezmoiInstalled: true,
      encryptionConfigured: true,
      sourceDir: '/Users/dev/.local/share/chezmoi',
      publicKey: 'age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p',
      status: 'success',
      message: 'Chezmoi configured with age encryption',
    })
    expect(result).toContain('macos')
    expect(result).toContain('success')
    expect(result).toContain('/Users/dev/.local/share/chezmoi')
    expect(result).toContain('age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p')
  })

  it('shows backup warning when publicKey is present', () => {
    const result = formatDotfilesSetup({
      platform: 'linux',
      chezmoiInstalled: true,
      encryptionConfigured: true,
      sourceDir: null,
      publicKey: 'age1abc123',
      status: 'success',
    })
    expect(result.toLowerCase()).toContain('back up')
  })

  it('shows hint to run dvmi dotfiles add on success', () => {
    const result = formatDotfilesSetup({
      platform: 'linux',
      chezmoiInstalled: true,
      encryptionConfigured: true,
      sourceDir: null,
      publicKey: null,
      status: 'success',
    })
    expect(result).toContain('dvmi dotfiles add')
  })

  it('shows failed status without publicKey section', () => {
    const result = formatDotfilesSetup({
      platform: 'macos',
      chezmoiInstalled: false,
      encryptionConfigured: false,
      sourceDir: null,
      publicKey: null,
      status: 'failed',
      message: 'chezmoi not installed',
    })
    expect(result).toContain('failed')
    expect(result).toContain('chezmoi not installed')
  })

  it('shows skipped status', () => {
    const result = formatDotfilesSetup({
      platform: 'wsl2',
      chezmoiInstalled: false,
      encryptionConfigured: false,
      sourceDir: null,
      publicKey: null,
      status: 'skipped',
      message: 'chezmoi not installed',
    })
    expect(result).toContain('skipped')
  })
})

// ---------------------------------------------------------------------------
// formatDotfilesStatus
// ---------------------------------------------------------------------------
describe('formatDotfilesStatus()', () => {
  it('includes platform, source dir, encryption and remote for full setup', () => {
    const result = formatDotfilesStatus({
      platform: 'macos',
      enabled: true,
      chezmoiInstalled: true,
      encryptionConfigured: true,
      repo: 'git@github.com:user/dotfiles.git',
      sourceDir: '/Users/dev/.local/share/chezmoi',
      files: [
        {
          path: '/Users/dev/.zshrc',
          sourcePath: '/Users/dev/.local/share/chezmoi/dot_zshrc',
          encrypted: false,
          type: 'file',
        },
        {
          path: '/Users/dev/.ssh/id_ed25519',
          sourcePath: '/Users/dev/.local/share/chezmoi/encrypted_id_ed25519.age',
          encrypted: true,
          type: 'file',
        },
      ],
      summary: {total: 2, encrypted: 1, plaintext: 1},
    })
    expect(result).toContain('macos')
    expect(result).toContain('/Users/dev/.local/share/chezmoi')
    expect(result).toContain('age (configured)')
    expect(result).toContain('git@github.com:user/dotfiles.git')
    expect(result).toContain('2 total: 1 plaintext, 1 encrypted')
  })

  it('shows not-configured message when enabled is false', () => {
    const result = formatDotfilesStatus({
      platform: 'linux',
      enabled: false,
      chezmoiInstalled: true,
      encryptionConfigured: false,
      repo: null,
      sourceDir: null,
      files: [],
      summary: {total: 0, encrypted: 0, plaintext: 0},
    })
    expect(result).toContain('dvmi dotfiles setup')
  })

  it('shows empty message when no files managed', () => {
    const result = formatDotfilesStatus({
      platform: 'macos',
      enabled: true,
      chezmoiInstalled: true,
      encryptionConfigured: true,
      repo: null,
      sourceDir: '/Users/dev/.local/share/chezmoi',
      files: [],
      summary: {total: 0, encrypted: 0, plaintext: 0},
    })
    expect(result).toContain('dvmi dotfiles add')
  })

  it('marks encrypted files in output', () => {
    const result = formatDotfilesStatus({
      platform: 'macos',
      enabled: true,
      chezmoiInstalled: true,
      encryptionConfigured: true,
      repo: null,
      sourceDir: null,
      files: [{path: '/Users/dev/.ssh/id_ed25519', sourcePath: '', encrypted: true, type: 'file'}],
      summary: {total: 1, encrypted: 1, plaintext: 0},
    })
    expect(result).toContain('encrypted')
  })

  it('shows not-configured encryption when encryptionConfigured is false', () => {
    const result = formatDotfilesStatus({
      platform: 'linux',
      enabled: true,
      chezmoiInstalled: true,
      encryptionConfigured: false,
      repo: null,
      sourceDir: null,
      files: [],
      summary: {total: 0, encrypted: 0, plaintext: 0},
    })
    expect(result).toContain('not configured')
  })

  it('shows not-configured remote when repo is null', () => {
    const result = formatDotfilesStatus({
      platform: 'macos',
      enabled: true,
      chezmoiInstalled: true,
      encryptionConfigured: true,
      repo: null,
      sourceDir: null,
      files: [],
      summary: {total: 0, encrypted: 0, plaintext: 0},
    })
    expect(result).toContain('not configured')
  })
})

// ---------------------------------------------------------------------------
// formatDotfilesAdd
// ---------------------------------------------------------------------------
describe('formatDotfilesAdd()', () => {
  it('shows added files with encryption status', () => {
    const result = formatDotfilesAdd({
      added: [
        {path: '~/.zshrc', encrypted: false},
        {path: '~/.ssh/id_ed25519', encrypted: true},
      ],
      skipped: [],
      rejected: [],
    })
    expect(result).toContain('~/.zshrc')
    expect(result).toContain('~/.ssh/id_ed25519')
    expect(result).toContain('[encrypted]')
    expect(result).toContain('Added (2)')
  })

  it('shows skipped files with reason', () => {
    const result = formatDotfilesAdd({
      added: [],
      skipped: [{path: '~/.bashrc', reason: 'File not found'}],
      rejected: [],
    })
    expect(result).toContain('~/.bashrc')
    expect(result).toContain('File not found')
    expect(result).toContain('Skipped (1)')
  })

  it('shows rejected files with reason', () => {
    const result = formatDotfilesAdd({
      added: [],
      skipped: [],
      rejected: [{path: '/mnt/c/Users/dev/.gitconfig', reason: 'Windows filesystem paths not supported on WSL2'}],
    })
    expect(result).toContain('/mnt/c/Users/dev/.gitconfig')
    expect(result).toContain('Windows filesystem paths not supported on WSL2')
    expect(result).toContain('Rejected (1)')
  })

  it('shows no files processed message when all empty', () => {
    const result = formatDotfilesAdd({added: [], skipped: [], rejected: []})
    expect(result).toContain('No files processed')
  })
})

// ---------------------------------------------------------------------------
// formatDotfilesSync
// ---------------------------------------------------------------------------
describe('formatDotfilesSync()', () => {
  it('formats successful push', () => {
    const result = formatDotfilesSync({
      action: 'push',
      repo: 'git@github.com:user/dotfiles.git',
      status: 'success',
      message: '2 files pushed to remote',
      conflicts: [],
    })
    expect(result).toContain('Push')
    expect(result).toContain('success')
    expect(result).toContain('git@github.com:user/dotfiles.git')
    expect(result).toContain('2 files pushed to remote')
  })

  it('formats init-remote action', () => {
    const result = formatDotfilesSync({
      action: 'init-remote',
      repo: 'git@github.com:user/dotfiles.git',
      status: 'success',
      message: 'Remote repository configured',
    })
    expect(result).toContain('Remote Setup')
    expect(result).toContain('success')
  })

  it('shows conflicts when present', () => {
    const result = formatDotfilesSync({
      action: 'pull',
      repo: 'git@github.com:user/dotfiles.git',
      status: 'failed',
      message: 'Merge conflicts detected',
      conflicts: ['~/.zshrc'],
    })
    expect(result).toContain('~/.zshrc')
    expect(result).toContain('Conflicts (1)')
    expect(result).toContain('failed')
  })

  it('formats pull action', () => {
    const result = formatDotfilesSync({
      action: 'pull',
      repo: 'https://github.com/user/dotfiles',
      status: 'success',
      message: 'Applied 5 files',
    })
    expect(result).toContain('Pull')
    expect(result).toContain('success')
  })
})

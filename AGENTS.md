# Contributing with AI: Development Guidelines

This document provides guidelines for developers and AI agents contributing to Devvami.

## Project Overview

**Devvami** is a DevEx CLI (Developer Experience) tool written in JavaScript (ESM) that helps teams manage GitHub repositories, CI/CD pipelines, AWS costs, and task management from the terminal.

- **Language**: JavaScript (ESM, `.js` files)
- **Runtime**: Node.js >= 24
- **CLI Framework**: @oclif/core v4
- **Package Manager**: pnpm >= 10

## Repository Structure

```
devvami/
├── src/
│   ├── commands/          # CLI commands (oclif auto-discovers)
│   │   ├── auth/
│   │   ├── costs/
│   │   ├── create/
│   │   ├── docs/
│   │   ├── pipeline/
│   │   ├── pr/
│   │   ├── repo/
│   │   ├── tasks/
│   │   └── [root commands]
│   ├── services/          # Business logic (GitHub, AWS, ClickUp, etc.)
│   ├── formatters/        # Output formatting (tables, markdown, etc.)
│   ├── hooks/             # oclif hooks (init, postrun)
│   ├── utils/             # Utilities (errors, banner, colors, etc.)
│   ├── validators/        # Input validation
│   ├── types.js           # JSDoc type definitions
│   ├── help.js            # Custom help system
│   └── index.js           # Main entry point
├── tests/
│   ├── unit/              # Unit tests
│   ├── services/          # Service/integration tests
│   ├── integration/       # End-to-end CLI tests
│   ├── fixtures/          # Mock data and tools
│   └── setup.js           # Test configuration
├── bin/                   # CLI entry points
├── .github/workflows/     # GitHub Actions CI/CD
├── package.json
├── vitest.config.js
└── lefthook.yml           # Git hooks (lint, test, commitlint)
```

## Code Style

### JavaScript Standards

- **ESM** (ECMAScript Modules) only, no CommonJS
- **JSDoc** required on all public functions
- **Type annotations** in JSDoc comments
- **No TypeScript** — pure JavaScript with JSDoc

### JSDoc Requirements

Every public function/export must have JSDoc with `@param`, `@returns`, and `@typedef` for types:

```javascript
/**
 * Fetch pull requests for a repository.
 * @param {string} org - GitHub organization name
 * @param {string} repo - Repository name
 * @param {Object} options - Options
 * @param {number} [options.limit=10] - Max results
 * @returns {Promise<Array<{number: number, title: string}>>}
 */
export async function getPullRequests(org, repo, options = {}) {
  // ...
}
```

### Code Organization

- **One command = one file** in `src/commands/`
- **Services handle API calls** — never in commands
- **Formatters handle output** — use chalk for colors, ora for spinners
- **Utils for cross-cutting concerns** — errors, logging, helpers
- **Config is loaded from `~/.config/dvmi/config.json`** — never hardcode

### Naming Conventions

- **Files**: lowercase with hyphens (`pull-requests.js`, not `pullRequests.js`)
- **Commands**: match directory structure (`src/commands/pr/create.js` → `dvmi pr create`)
- **Functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Classes**: PascalCase

### Error Handling

All errors should extend `DvmiError` from `src/utils/errors.js`:

```javascript
import { DvmiError } from '../utils/errors.js'

if (!config.org) {
  throw new DvmiError(
    'No organization configured',
    'Run `dvmi init` to set up your organization'
  )
}
```

## Testing

Tests use **Vitest** with the following structure:

- **Unit tests**: `tests/unit/` — test pure functions
- **Service tests**: `tests/services/` — test API integration logic
- **Integration tests**: `tests/integration/` — test full CLI flows

### Running Tests

```bash
pnpm test                 # Run all tests
pnpm test:unit           # Run unit tests only
pnpm test:services       # Run service tests only
pnpm test:integration    # Run integration tests only
pnpm test:watch          # Watch mode
pnpm test:coverage       # Generate coverage report
```

### Test Standards

- **Test files**: `*.test.js` co-located near source
- **Fixtures**: `tests/fixtures/` for mock data, stub binaries
- **MSW**: Mock Service Worker for HTTP mocking
- **Coverage target**: 80%+ (enforced by pre-commit hooks)

Example:

```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { getPullRequests } from '../src/services/github.js'

describe('GitHub Service', () => {
  it('fetches PRs for a repository', async () => {
    const prs = await getPullRequests('acme', 'my-app')
    expect(prs).toHaveLength(1)
    expect(prs[0].title).toBe('Add cool feature')
  })
})
```

## Linting & Formatting

- **ESLint**: Enforces code style, JSDoc validation
- **Prettier**: Auto-formats code
- **Commitlint**: Validates commit messages
- **Lefthook**: Runs checks on pre-commit, pre-push

### Commands

```bash
pnpm lint         # Run ESLint
pnpm lint:fix     # Fix auto-fixable issues
pnpm format       # Format with Prettier
pnpm commit       # Interactive commit (uses commitlint)
```

## Commit Conventions

Follow **Conventional Commits**:

```
<type>(<scope>): <subject>

<body>
<footer>
```

**Types**:
- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation
- `style` — Code style (no behavior change)
- `refactor` — Code refactor (no behavior change)
- `perf` — Performance improvement
- `test` — Test coverage
- `chore` — Build, CI, deps, etc.

**Examples**:
```
feat(commands): add dvmi tasks filter
fix(services): handle GitHub API rate limits
docs(readme): update installation instructions
chore(ci): update Node.js to 24.1.0
```

Use `pnpm commit` for an interactive guided commit.

## Adding a New Command

1. **Create the file**: `src/commands/my-topic/my-command.js`
2. **Extend `Command`** from @oclif/core
3. **Add JSDoc** and oclif metadata
4. **Implement `run()`** method
5. **Add tests**: `tests/integration/my-command.test.js`

Example:

```javascript
import { Command, Flags } from '@oclif/core'
import { getMyData } from '../services/my-service.js'

/**
 * Do something useful
 * @typedef {Object} MyResult
 * @property {string} status
 */

export default class MyCommand extends Command {
  static description = 'Description of what this command does'

  static examples = [
    '<%= config.bin %> my-topic my-command',
    '<%= config.bin %> my-topic my-command --flag value',
  ]

  static flags = {
    help: Flags.help({ char: 'h' }),
    flag: Flags.string({ description: 'A useful flag' }),
  }

  async run() {
    const { flags } = await this.parse(MyCommand)
    const data = await getMyData(flags.flag)
    this.log(`Result: ${data}`)
    return data
  }
}
```

## Adding a New Service

1. **Create the file**: `src/services/my-service.js`
2. **Export pure, testable functions**
3. **Use oclif config** for environment setup
4. **Handle errors gracefully** with `DvmiError`
5. **Add tests**: `tests/services/my-service.test.js`

Example:

```javascript
import { loadConfig } from './config.js'
import { DvmiError } from '../utils/errors.js'

/**
 * Fetch data from an API
 * @param {string} query
 * @returns {Promise<Array>}
 */
export async function fetchData(query) {
  const config = await loadConfig()
  if (!config.apiKey) {
    throw new DvmiError('API not configured', 'Run `dvmi init` to set up')
  }
  // ... fetch data
  return data
}
```

## CI/CD Pipeline

**GitHub Actions workflows** in `.github/workflows/`:

- **pull-request.yml**: Runs on PR — linting, testing
- **qa.yml**: Reusable workflow for QA checks
- **release.yml**: On push to `main` — semantic versioning, NPM publish

The pipeline uses **semantic-release** to automate versioning and changelog.

### Secrets Required

For releases to work, you need to set these on GitHub:

| Secret | Purpose |
|---|---|
| `MACHINE_PAT` | Fine-grained GitHub token (for pushing changelog/tags) |
| `NPM_TOKEN` | NPM automation token (for publishing to npmjs.org) |

## Key Technologies

| Tech | Version | Purpose |
|---|---|---|
| Node.js | >= 24 | Runtime |
| @oclif/core | v4 | CLI framework |
| octokit | v4 | GitHub API |
| @aws-sdk/client-cost-explorer | v3 | AWS costs |
| chalk | v5 | Colored output |
| ora | v8 | Spinners |
| @keytar/keytar | v7 | Secure credentials |
| @inquirer/prompts | v7 | Interactive prompts |
| vitest | v3 | Testing |
| ESLint | v9 | Linting |
| Prettier | v3 | Formatting |
| semantic-release | v24 | Versioning & release |

## Common Tasks for Contributors

### Run the CLI locally

```bash
npm run dev -- <command> [options]
# or use the bin/dev.js script directly
```

### Check what changed

```bash
git diff
git status
```

### Clean up before push

```bash
pnpm lint:fix
pnpm format
pnpm test
```

### Create a feature branch

```bash
git checkout -b feat/my-feature
git push -u origin feat/my-feature
# Open PR on GitHub
```

### Update dependencies

```bash
pnpm update
pnpm install
pnpm test  # Verify nothing broke
```

## Troubleshooting

| Issue | Solution |
|---|---|
| Tests fail locally but pass on CI | Clear cache: `rm -rf node_modules .vitest && pnpm install` |
| ESLint/Prettier conflicts | Run `pnpm lint:fix && pnpm format` |
| Keytar issues on Linux | Install: `sudo apt install libsecret-1-dev` |
| oclif manifest out of date | Run: `pnpm run prepack` |

## Questions?

- **Read docs**: [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md)
- **Open an issue**: [GitHub Issues](https://github.com/savez/devvami/issues)
- **Start a discussion**: [GitHub Discussions](https://github.com/savez/devvami/discussions)

---

**Last updated**: 2026-03-28

## Active Technologies
- JavaScript (ESM, `.js`) — Node.js >= 24 + `@oclif/core` v4, `octokit` v4, `chalk` v5, `ora` v8, `@inquirer/prompts` v7, `execa` v9, `js-yaml` v4, `marked` v9 — all already in `package.json`; no new runtime dependencies needed (001-prompt-hub)
- Local filesystem — `.prompts/` directory at project root for downloaded prompts; `~/.config/dvmi/config.json` for AI tool preference (001-prompt-hub)
- JavaScript (ESM, `.js`) — Node.js >= 24 + `@oclif/core` v4, `@inquirer/prompts` v7, `ora` v8, `chalk` v5, `execa` v9 — all already in `package.json`; no new runtime dependencies needed (002-secure-credentials-setup)
- Shell profile files (`~/.bashrc`, `~/.zshrc`) for environment variable persistence; `git config --global` for credential helper config; no dvmi config changes (002-secure-credentials-setup)
- JavaScript (ESM, `.js`) — Node.js >= 24 + `@oclif/core` v4, `@inquirer/prompts` v7, `chalk` v5, `ora` v8, `@aws-sdk/client-cost-explorer` v3 (existing), `@aws-sdk/client-cloudwatch-logs` v3 (new — justified by CloudWatch feature) (003-aws-costs-cloudwatch)
- N/A — all data fetched live from AWS APIs; no local persistence (003-aws-costs-cloudwatch)
- JavaScript (ESM, `.js`) with JSDoc — Node.js >= 24 + `@oclif/core` v4, `@inquirer/prompts` v7, `chalk` v5, `ora` v8, `execa` v9 (all existing — no new runtime dependencies) (004-chezmoi-dotfiles-setup)
- `~/.config/dvmi/config.json` (dvmi config, extended with `dotfiles` field) + `~/.config/chezmoi/chezmoi.toml` (chezmoi native config, managed by chezmoi CLI) (004-chezmoi-dotfiles-setup)
- JavaScript (ESM, `.js`) with JSDoc — Node.js >= 24 + `@oclif/core` v4 (CLI framework), `execa` v9 (subprocess execution for audit commands), `chalk` v5 (colors), `ora` v8 (spinners), `open` v10 (browser launch), native `fetch` (NVD API calls — built into Node.js >= 18) (005-cve-vuln-scanning)
- N/A — no local persistence; all data fetched live (005-cve-vuln-scanning)
- JavaScript (ESM, `.js`) — Node.js >= 24 + `@oclif/core` v4 (CLI framework), `execa` v9 (subprocess for audit commands), `chalk` v5 (colors), `ora` v8 (spinners), `open` v10 (browser launch), native `fetch` (NVD API — built into Node.js >= 18). All existing in `package.json`. (005-cve-vuln-scanning)
- N/A — all data fetched live from APIs; no local persistence (005-cve-vuln-scanning)
- JavaScript (ESM, `.js`) with JSDoc — Node.js >= 24 + `chalk` v5 (colors), Node.js built-in `readline` + `process.stdin.setRawMode` + ANSI escape sequences for TUI rendering. Zero new runtime dependencies. (006-interactive-cve-table)
- N/A — no persistence; TUI state exists only during interactive session (006-interactive-cve-table)

## Recent Changes
- 006-interactive-cve-table: Replaces `@inquirer/prompts` select loop in `dvmi vuln search` with navigable table (arrow keys, viewport scrolling) + modal overlay (Enter to open, Esc to dismiss). Zero new deps — Node.js built-in `readline` + ANSI escape sequences + existing `chalk` v5. Two new modules: `src/utils/tui/navigable-table.js`, `src/utils/tui/modal.js`. This is a `refactor:` of spec 005 interactive behaviour.
- 001-prompt-hub: Added JavaScript (ESM, `.js`) — Node.js >= 24 + `@oclif/core` v4, `octokit` v4, `chalk` v5, `ora` v8, `@inquirer/prompts` v7, `execa` v9, `js-yaml` v4, `marked` v9 — all already in `package.json`; no new runtime dependencies needed

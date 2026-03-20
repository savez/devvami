# Contributing to Devvami

Thank you for your interest in contributing to Devvami! We welcome contributions from everyone.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

### Prerequisites

- **Node.js >= 24** — managed with [nvm](https://github.com/nvm-sh/nvm)
- **pnpm >= 10** — see [pnpm docs](https://pnpm.io/installation)
- **Git**

### Setup Development Environment

1. **Fork the repository** on GitHub

2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/devvami.git
   cd devvami
   ```

3. **Use correct Node.js version:**
   ```bash
   nvm use
   ```

4. **Install dependencies:**
   ```bash
   pnpm install
   ```

5. **Verify setup:**
   ```bash
   pnpm test
   pnpm lint
   ```

## Making Changes

### Code Style

- **JavaScript (ESM)** with JSDoc type annotations
- **JSDoc required** on all public functions: `@param`, `@returns`, `@typedef`, `@type`
- Files must have `"type": "module"` in package.json (native ESM)
- ESLint + Prettier enforced via lefthook pre-commit

### Creating a Commit

Use the interactive commit wizard:
```bash
pnpm commit
```

This ensures your commits follow [Conventional Commits](https://www.conventionalcommits.org/) format:
```
<type>(<scope>): <subject>

<body>
<footer>
```

Examples:
```
feat(commands): add dvmi tasks filter
fix(services): correct github auth flow
docs(readme): update install instructions
```

### Before Submitting a PR

1. **Run tests & linting:**
   ```bash
   pnpm test
   pnpm lint
   ```

2. **Fix any issues:**
   ```bash
   pnpm lint:fix
   pnpm format
   ```

3. **Update snapshots if needed:**
   ```bash
   pnpm test:update
   ```

## Pull Request Process

1. **Create a feature branch:**
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Push to your fork:**
   ```bash
   git push origin feat/my-feature
   ```

3. **Open a Pull Request** on the main repository

4. **Fill the PR template** with:
   - What does this PR do?
   - Link to related issue (if any)
   - Breaking changes?
   - Test coverage?

5. **Wait for CI/CD** to pass and maintainers to review

### PR Guidelines

- **One feature per PR** — keep scope focused
- **Tests required** — new features must have test coverage
- **Update docs** — if you change behavior, update README/AGENTS.md
- **Keep commits clean** — rebase before merging if needed
- **Be descriptive** — in commit messages and PR description

## Reporting Issues

Use GitHub Issues with the appropriate template:

- **Bug Report** — Something is broken
- **Feature Request** — A new idea or enhancement
- **Question** — Ask for help

Please search existing issues first to avoid duplicates.

## Security

Found a vulnerability? **Do not open a public issue.** Please read [SECURITY.md](SECURITY.md) for responsible disclosure.

## Questions?

- **Documentation** — Read [README.md](README.md) and [AGENTS.md](AGENTS.md)
- **Issues** — Open a GitHub Discussion or Issue
- **Chat** — Check if there's an active community channel

Thank you for contributing! 🎉

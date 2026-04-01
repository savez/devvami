# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-04-01

### Added

- `dvmi sync-config-ai` — interactive TUI to manage AI coding tool configurations (MCP servers, commands, skills, agents) across VS Code Copilot, Claude Code, OpenCode, Gemini CLI, and GitHub Copilot CLI
- 5-tab TUI layout: Environments (read-only) + dedicated tab per category type (MCPs | Commands | Skills | Agents)
- Inline forms with Environments multi-select filtered by compatibility matrix
- OpenCode global detection via `~/.config/opencode/`
- `--json` flag for non-interactive / CI use

## [1.4.2] - 2026-03-29

### Changed

- **vuln:** extend navigable TUI table to `dvmi vuln scan` ([#10](https://github.com/savez/devvami/issues/10))

## [1.4.1] - 2026-03-29

### Changed

- **vuln:** interactive CVE table with navigable TUI and modal overlay — spec 006 ([#9](https://github.com/savez/devvami/issues/9))

## [1.4.0] - 2026-03-28

### Added

- **dotfiles:** `dvmi dotfiles` commands — setup, add, sync, status — with age encryption and chezmoi integration ([#8](https://github.com/savez/devvami/issues/8))

## [1.3.0] - 2026-03-27

### Added

- **aws:** `dvmi costs trend`, CloudWatch logs (`dvmi logs`), and aws-vault integration ([#7](https://github.com/savez/devvami/issues/7))

## [1.2.0] - 2026-03-25

### Added

- **security:** `dvmi security setup` wizard with automated security checks ([#6](https://github.com/savez/devvami/issues/6))
- Welcome message on first run

## [1.1.2] - 2026-03-24

### Fixed

- **init:** stop ora spinner before interactive prompts to prevent TTY freeze on macOS ([#5](https://github.com/savez/devvami/issues/5))

## [1.1.1] - 2026-03-23

### Fixed

- Apply security fixes and add pre-push version sync hook ([#4](https://github.com/savez/devvami/issues/4))
- Apply 7 security fixes from ZeroTrustino audit ([#3](https://github.com/savez/devvami/issues/3))

## [1.1.0] - 2026-03-23

### Added

- **prompts:** AI prompt hub — `dvmi prompts browse`, `download`, `run`, `list` ([#2](https://github.com/savez/devvami/issues/2))

## [1.0.0] - 2026-03-20

### Added

- Initial public open-source release of Devvami
- Commands: `auth`, `costs`, `create`, `docs`, `pipeline`, `pr`, `repo`, `tasks`, `branch`, `doctor`, `init`, `upgrade`, `whoami`
- GitHub, AWS, and ClickUp integrations
- Configuration wizard (`dvmi init`) and environment diagnostics (`dvmi doctor`)

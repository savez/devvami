# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-03-20

### Added

- Initial public release of Devvami
- DevEx CLI for developers and teams
- Commands: auth, costs, create, docs, pipeline, pr, repo, tasks
- Support for GitHub, AWS, and task management integrations
- Configuration wizard and environment diagnostics


### 🐛 Bug Fixes

* **tasks:** correct today filter to use date range and exclude closed status ([#10](https://github.com/santagostino/cli-santagostino/issues/10)) ([36003e4](https://github.com/santagostino/cli-santagostino/commit/36003e4e2ace164b913ad9954794f5d3381e25a4))

## [1.7.0](https://github.com/santagostino/cli-santagostino/compare/v1.6.0...v1.7.0) (2026-03-19)

### ✨ Features

* **help:** add animated SNTG logo and categorized command layout ([#9](https://github.com/santagostino/cli-santagostino/issues/9)) ([58c5581](https://github.com/santagostino/cli-santagostino/commit/58c5581e99123b6ce66ebbdd2fd42a2990534a80))

## [1.6.0](https://github.com/santagostino/cli-santagostino/compare/v1.5.0...v1.6.0) (2026-03-19)

### ✨ Features

* **docs:** add sntg docs commands (list, read, search, projects) ([#8](https://github.com/santagostino/cli-santagostino/issues/8)) ([be92259](https://github.com/santagostino/cli-santagostino/commit/be92259ffdcb6a82b6f6cc11df4c736f9c71828a))

## [1.5.0](https://github.com/santagostino/cli-santagostino/compare/v1.4.0...v1.5.0) (2026-03-19)

### ✨ Features

* improve list tables with search, colors and remove repo limit ([#7](https://github.com/santagostino/cli-santagostino/issues/7)) ([4ad25fb](https://github.com/santagostino/cli-santagostino/commit/4ad25fbaa1d827d5ca41672b22c29c8507e410a6))

## [1.4.0](https://github.com/santagostino/cli-santagostino/compare/v1.3.0...v1.4.0) (2026-03-18)

### ✨ Features

* add link column to tasks, fix today filter timezone/status, add clickup to whoami ([#6](https://github.com/santagostino/cli-santagostino/issues/6)) ([2db8a41](https://github.com/santagostino/cli-santagostino/commit/2db8a41c74d85a84eb010c84dcc84d990798d4a6))

### 🐛 Bug Fixes

* **ci:** disable footer-max-line-length to allow semantic-release changelog URLs ([4a4b392](https://github.com/santagostino/cli-santagostino/commit/4a4b392ab6a880f28cf3c009508a72bf13466044))

## [1.3.0](https://github.com/santagostino/cli-santagostino/compare/v1.2.0...v1.3.0) (2026-03-18)

### ✨ Features

* add ClickUp configuration wizard & remove branch create command ([b8c3634](https://github.com/santagostino/cli-santagostino/commit/b8c36348c45df904f02f06227e9ad210bc7a88ab))
* add ClickUp configuration wizard to init command ([085defe](https://github.com/santagostino/cli-santagostino/commit/085defe562fd83bf699d2883ad535ddf9e321ec6))

## [1.2.0](https://github.com/santagostino/cli-santagostino/compare/v1.1.0...v1.2.0) (2026-03-18)

### ✨ Features

* aggiunge pr detail con QA steps/comments e pr review dedicato ([66b8f76](https://github.com/santagostino/cli-santagostino/commit/66b8f764b7d2a474b913d6c1e2a69d35cb16f26c))
* sntg pr detail + sntg pr review ([bcf9da1](https://github.com/santagostino/cli-santagostino/commit/bcf9da113ab8881e21c12766f292d1f90443e03e))

## [1.1.0](https://github.com/santagostino/cli-santagostino/compare/v1.0.0...v1.1.0) (2026-03-18)

### ✨ Features

* **cli:** redesign visivo con gradient animato, emoji e spinner brand-styled ([e452f25](https://github.com/santagostino/cli-santagostino/commit/e452f25f85523a4a34a4e8a79bfd16c123cdef25))
* **cli:** redesign visivo con gradient animato, emoji e spinner brand-styled ([313d718](https://github.com/santagostino/cli-santagostino/commit/313d71893229af4d14bde051f8610c48d2bc984f))

### 🐛 Bug Fixes

* **cli:** rimuovi --registry da npm install in upgrade per evitare 404 sulle dipendenze ([0fe4395](https://github.com/santagostino/cli-santagostino/commit/0fe4395b6a2c42fa93917bd4a8132927f33e4c40))
* **cli:** version check usa gh releases API invece di npm view ([0e78496](https://github.com/santagostino/cli-santagostino/commit/0e7849652d5606113838862f80e5ca594b3ca116))

## 1.0.0 (2026-03-18)

### ✨ Features

* refactor commands as pure topics and improve help discoverability ([0dda165](https://github.com/santagostino/cli-santagostino/commit/0dda165385f4df665148dba19af24b238a527e93))

### 🐛 Bug Fixes

* **ci:** aggiungi pnpm-lock.yaml al repo e rimuovilo dal gitignore ([77abeca](https://github.com/santagostino/cli-santagostino/commit/77abeca996e9339b844940089794e87b14e5432d))
* correggere sntg upgrade che non rilevava nuove versioni ([a922655](https://github.com/santagostino/cli-santagostino/commit/a922655bcda93dff89026dab786b1a2affb9c850))
* **ci:** disabilita body-max-line-length e rimuovi eslint-disable sec… ([4c99d98](https://github.com/santagostino/cli-santagostino/commit/4c99d9856800d4e7070d15545770b42af4b63980))
* **ci:** disabilita body-max-line-length e rimuovi eslint-disable security non valido ([b75f872](https://github.com/santagostino/cli-santagostino/commit/b75f872eacf038b921cbfbc981065a0401650c87))
* **ci:** rimuovi import readFile inutilizzato nel test version-check ([a630458](https://github.com/santagostino/cli-santagostino/commit/a630458a1f1d97b9f961fd1411c81dd1a0f564b9))

### 📚 Documentation

* aggiungi README con istruzioni installazione e aggiornamento CLI ([4ecb16b](https://github.com/santagostino/cli-santagostino/commit/4ecb16bc7b7780732077ba1c5b899947383c3f77))
* migliora README e aggiungi TODO.md al gitignore ([5116dc9](https://github.com/santagostino/cli-santagostino/commit/5116dc9f37f542843b47a07afe6daaf341e805eb))
* README in stile opensource con badge, emoji e sezione sviluppo locale ([ad720b5](https://github.com/santagostino/cli-santagostino/commit/ad720b59cbf700986861ab074da70ba4eccf8166))

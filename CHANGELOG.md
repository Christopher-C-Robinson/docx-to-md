# Changelog

All notable changes to this project will be documented in this file.

## [0.1.6] – 2026-03-06

### Added
- add automated monthly release workflow with manual trigger
- add --inline-images flag to embed images as Base64 data URIs

### Fixed
- address auto-release workflow review comments
- resolve ci test portability and regex risk
- harden and make inline image extraction reliable
- add default Mammoth style mappings for common unrecognized DOCX styles

### Changed
- Merge pull request #42 from Christopher-C-Robinson/copilot/create-monthly-release-workflow
- Initial plan
- Merge pull request #40 from Christopher-C-Robinson/dependabot/npm_and_yarn/dev-dependencies-b90b2bda72
- Merge pull request #36 from Christopher-C-Robinson/dependabot/github_actions/actions/download-artifact-8
- Merge pull request #37 from Christopher-C-Robinson/dependabot/github_actions/actions/upload-artifact-7
- Merge pull request #38 from Christopher-C-Robinson/dependabot/github_actions/actions/setup-node-6
- Merge pull request #39 from Christopher-C-Robinson/dependabot/github_actions/actions/checkout-6
- bump the dev-dependencies group with 3 updates
- bump actions/checkout from 4 to 6
- bump actions/setup-node from 4 to 6
- bump actions/upload-artifact from 4 to 7
- bump actions/download-artifact from 4 to 8
- Merge pull request #35 from Christopher-C-Robinson/copilot/setup-dependabot-security-settings
- clarify security tooling prerequisites in README
- Merge pull request #33 from Christopher-C-Robinson/copilot/fix-lint-error-plist-type-definition
- Merge pull request #31 from Christopher-C-Robinson/copilot/add-inline-image-embedding
- add dependabot.yml and document security features in README
- Initial plan
- Fix TS2688: add explicit types array to tsconfig.json to prevent implicit plist type resolution
- Initial plan
- Merge pull request #29 from Christopher-C-Robinson/copilot/fix-mammoth-conversion-warnings
- Initial plan
- Initial plan

## [0.1.0] – Unreleased

### Added
- Initial project structure with TypeScript strict mode
- Pluggable engine adapter interface (`EngineAdapter`)
- Pandoc adapter with GFM/CommonMark output, media extraction, Lua filter support
- Mammoth adapter with HTML→Markdown pipeline via Turndown + GFM plugin
- LibreOffice adapter (headless soffice)
- Engine auto-detection registry (`resolveEngine`)
- CLI: `docx2md convert` and `docx2md batch` commands
- Internal AST type system
- `MarkdownFormatter` for AST→Markdown serialization
- `AssetManager` with zip-slip path sanitization
- Document metadata extractor
- Unit tests: style mapping, list indentation, table policy, path sanitization
- Integration tests: Pandoc and Mammoth adapters
- GitHub Actions CI workflow (Ubuntu, macOS, Windows)
- Dockerfile with Pandoc
- Documentation: architecture, engines, limitations
- SECURITY.md with threat model and CHANGELOG.md

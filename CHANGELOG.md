# Changelog

All notable changes to this project will be documented in this file.

## [0.1.14] – 2026-03-10

### Changed
- Merge pull request #72 from Christopher-C-Robinson/dependabot/github_actions/actions/upload-artifact-7
- Merge pull request #73 from Christopher-C-Robinson/dependabot/github_actions/actions/setup-node-6
- Merge pull request #74 from Christopher-C-Robinson/dependabot/github_actions/actions/download-artifact-8
- Merge pull request #75 from Christopher-C-Robinson/dependabot/github_actions/actions/checkout-6
- bump actions/checkout from 4 to 6
- bump actions/download-artifact from 4 to 8
- bump actions/setup-node from 4 to 6
- bump actions/upload-artifact from 4 to 7

## [0.1.13] – 2026-03-07

### Added
- improve installer to place app in correct system directories for each OS

### Fixed
- ignore workflow commits in release detection
- move changelog update to publish job to prevent orphan entries on failed builds

### Changed
- Merge pull request #69 from Christopher-C-Robinson/copilot/improve-install-behavior
- Merge pull request #71 from Christopher-C-Robinson/copilot/fix-changelog-inconsistencies
- Address PR review feedback for installer behavior
- Initial plan
- Initial plan

## [0.1.12] – 2026-03-07

### Added
- add one-command cross-platform installer scripts
- add code signing and notarization for seamless Windows/macOS installs

### Fixed
- restore valid GitHub Actions versions and Windows release shell
- fix invalid electron-builder.yml configuration schema
- scope signing secrets by workflow target os

### Changed
- Merge pull request #67 from Christopher-C-Robinson/codex/fix-build-issues-from-recent-changes
- Improves package install reliability in CI and script
- v0.1.11 [skip ci]
- Merge pull request #66 from Christopher-C-Robinson/codex/github-mention-fix-invalid-electron-builder.yml-schema-for
- Unset empty signing secrets before Electron packaging
- v0.1.10 [skip ci]
- Merge pull request #65 from Christopher-C-Robinson/copilot/fix-electron-builder-schema
- Keep mac notarization enabled in electron-builder config
- Initial plan
- v0.1.9 [skip ci]
- Merge pull request #63 from Christopher-C-Robinson/copilot/add-unified-install-scripts
- fix installer script review feedback
- Initial plan
- Merge pull request #61 from Christopher-C-Robinson/copilot/improve-installer-and-signing
- Initial plan
- Merge pull request #59 from Christopher-C-Robinson/add-copilot-instructions-and-agent-md-files
- Adds PR review workflow guidelines to docs
- Adds mirrored agent instruction docs for project tooling

## [0.1.11] – 2026-03-07

### Added
- add one-command cross-platform installer scripts
- add code signing and notarization for seamless Windows/macOS installs

### Fixed
- fix invalid electron-builder.yml configuration schema
- scope signing secrets by workflow target os

### Changed
- Merge pull request #66 from Christopher-C-Robinson/codex/github-mention-fix-invalid-electron-builder.yml-schema-for
- Unset empty signing secrets before Electron packaging
- v0.1.10 [skip ci]
- Merge pull request #65 from Christopher-C-Robinson/copilot/fix-electron-builder-schema
- Keep mac notarization enabled in electron-builder config
- Initial plan
- v0.1.9 [skip ci]
- Merge pull request #63 from Christopher-C-Robinson/copilot/add-unified-install-scripts
- fix installer script review feedback
- Initial plan
- Merge pull request #61 from Christopher-C-Robinson/copilot/improve-installer-and-signing
- Initial plan
- Merge pull request #59 from Christopher-C-Robinson/add-copilot-instructions-and-agent-md-files
- Adds PR review workflow guidelines to docs
- Adds mirrored agent instruction docs for project tooling

## [0.1.10] – 2026-03-07

### Added
- add one-command cross-platform installer scripts
- add code signing and notarization for seamless Windows/macOS installs

### Fixed
- fix invalid electron-builder.yml configuration schema
- scope signing secrets by workflow target os

### Changed
- Merge pull request #65 from Christopher-C-Robinson/copilot/fix-electron-builder-schema
- Keep mac notarization enabled in electron-builder config
- Initial plan
- v0.1.9 [skip ci]
- Merge pull request #63 from Christopher-C-Robinson/copilot/add-unified-install-scripts
- fix installer script review feedback
- Initial plan
- Merge pull request #61 from Christopher-C-Robinson/copilot/improve-installer-and-signing
- Initial plan
- Merge pull request #59 from Christopher-C-Robinson/add-copilot-instructions-and-agent-md-files
- Adds PR review workflow guidelines to docs
- Adds mirrored agent instruction docs for project tooling

## [0.1.9] – 2026-03-07

### Added
- add one-command cross-platform installer scripts
- add code signing and notarization for seamless Windows/macOS installs

### Fixed
- scope signing secrets by workflow target os

### Changed
- Merge pull request #63 from Christopher-C-Robinson/copilot/add-unified-install-scripts
- fix installer script review feedback
- Initial plan
- Merge pull request #61 from Christopher-C-Robinson/copilot/improve-installer-and-signing
- Initial plan
- Merge pull request #59 from Christopher-C-Robinson/add-copilot-instructions-and-agent-md-files
- Adds PR review workflow guidelines to docs
- Adds mirrored agent instruction docs for project tooling

## [0.1.8] – 2026-03-07

### Added
- download markdown and media as zip
- deterministic image ordering based on document flow
- clean Word auto-generated accessibility alt text from images
- render images in markdown preview by rewriting media paths to API URLs

### Fixed
- eliminate codeql path taint in mammoth rename flow
- resolve codeql path warning and windows test paths
- harden zip downloads and validate archive contents
- harden mammoth image renaming path handling
- keep markdown table cell images inline
- rewrite preview image paths after markdown render
- preserve inline image placement in markdown AST serializer
- reset copy button label after clipboard failure with timeout

### Changed
- Merge pull request #46 from Christopher-C-Robinson/copilot/feat-deterministic-image-ordering
- Improves upload cleanup with stricter validation
- Improves DOCX upload handling and media asset ordering
- Allow Windows short-name paths in DOCX input validation
- Fix image filename sanitization to preserve 404 on missing assets
- Merge main and harden extractMedia path validation
- Improves session and asset path validation and sanitization
- Writes images to sequential filenames for deterministic ordering
- Potential fix for code scanning alert no. 27: Uncontrolled data used in path expression
- Potential fix for code scanning alert no. 26: Uncontrolled data used in path expression
- Merge pull request #58 from Christopher-C-Robinson/copilot/feat-download-markdown-and-media-zip
- Merge pull request #56 from Christopher-C-Robinson/copilot/improve-inline-image-placement
- Merge pull request #54 from Christopher-C-Robinson/copilot/improve-github-markdown-preview
- Merge branch 'main' of https://github.com/Christopher-C-Robinson/docx-to-md into copilot/improve-github-markdown-preview
- Reuse markdown-it renderer and disable typographer
- Merge pull request #50 from Christopher-C-Robinson/copilot/fix-image-rendering-markdown
- Merge pull request #48 from Christopher-C-Robinson/copilot/clean-alt-text-in-markdown
- attach alt-text JSDoc to cleanAltText
- Merge pull request #52 from Christopher-C-Robinson/copilot/add-copy-to-clipboard-button
- replace marked with markdown-it for GitHub-compatible preview
- add markdown-it.min.js vendor bundle
- Initial plan
- Initial plan
- Initial plan
- Initial plan
- Initial plan
- Initial plan
- Initial plan

## [0.1.7] – 2026-03-06

### Fixed
- correct mammoth style map syntax and add missing default style mappings

### Changed
- Merge pull request #44 from Christopher-C-Robinson/copilot/fix-mammoth-style-warnings
- Initial plan

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

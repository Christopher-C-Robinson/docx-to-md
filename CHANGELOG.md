# Changelog

All notable changes to this project will be documented in this file.

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

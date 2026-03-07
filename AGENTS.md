# Codex Agent Instructions for `docx-to-md`

## Scope
Use this file when working as Codex (or similar terminal coding agents) in this repository.

This is the Codex-side instruction file. The Copilot-side mirror lives at:
- `.github/copilot-instructions.md`

Both files should stay aligned on major project facts.

## Sync Policy With `.github/copilot-instructions.md` (Important)
Treat `AGENTS.md` and `.github/copilot-instructions.md` as mirrored guidance.

Update both files together when there are major changes, including:
- Build/test commands or runtime requirements
- API/CLI behavior changes that affect normal workflows
- Architecture changes (engine flow, conversion pipeline, storage model)
- Security-critical behavior or path-handling rules
- Any section that has become inaccurate or outdated

Do not update both files for routine noise, including:
- Minor refactors that do not change behavior
- Small wording polish
- One-off temporary debugging notes

If one file changes, include the corresponding mirror update in the same PR/commit when practical.
If intentional divergence is required, add a short note in both files explaining why.

## Project Purpose
`docx-to-md` converts DOCX files to Markdown using a pluggable engine architecture.

Primary delivery surfaces:
- CLI (`docx2md`)
- Programmatic core API
- Express web/API server
- Electron desktop shell around the local server

## Build, Test, and Run Commands
- Build TypeScript: `npm run build`
- Type-check lint: `npm run lint`
- Run tests: `npm run test`
- Run API/web server from built output: `npm run serve`
- Build Electron main process: `npm run electron:build`
- Run Electron locally: `npm run electron:dev`
- Package Electron app: `npm run electron:dist`

## Architecture Notes
- Engine abstraction is defined by `EngineAdapter`:
  - `src/core/engines/interface.ts`
- Engine registry and auto-resolution:
  - `src/core/engines/registry.ts`
- Main conversion entry:
  - `src/core/convert.ts`
- Adapters:
  - `src/core/engines/pandoc/adapter.ts`
  - `src/core/engines/mammoth/adapter.ts`
  - `src/core/engines/libreoffice/adapter.ts`

Engine behavior by entrypoint:
- Core/CLI conversion uses `resolveEngine()` with fallback order:
  - Pandoc -> Mammoth -> LibreOffice
- Web app endpoint (`POST /api/convert`) currently uses `MammothAdapter` directly.
  - Do not assume web conversion currently auto-selects Pandoc.

## Security and Path-Handling Rules
These are non-negotiable invariants:
- Never trust path-like input from users, archive entries, request params, or model output.
- Keep media extraction/path writes constrained to approved directories.
- Use sanitization helpers and containment checks before filesystem writes.
- Preserve zip-slip protections in media extraction (`extractMedia` + asset manager helpers).
- Preserve HTML sanitization in Mammoth conversion flow.
- Keep session/file access bounded to server-managed temp roots and validated session IDs.

Relevant files:
- `src/core/assets/manager.ts`
- `src/core/assets/extractMedia.ts`
- `src/api/server.ts`
- `src/core/engines/mammoth/adapter.ts`

## Common Pitfalls
- Do not break deterministic image ordering logic in Mammoth adapter.
- Do not bypass sanitization when introducing new asset paths.
- Do not write files outside `mediaDir`/session directories.
- Keep cleanup behavior intact for temp upload/session artifacts.
- Keep CLI and docs synchronized when changing flags or defaults.

## Testing Expectations
Before finalizing meaningful code changes:
- Run `npm run lint`
- Run targeted unit tests for touched modules
- Run full test suite when changes cross module boundaries

Note:
- Integration tests may depend on external binaries (e.g., Pandoc).

## PR Comment and Review Thread Workflow
When working on a branch/PR that has GitHub comments (issue comments or review threads):
- Read unresolved comments first and treat them as required tasks unless explicitly out of scope.
- Implement the requested fix (or provide a clear technical reason when not applying it).
- Reply on each addressed comment/thread with a short summary of what changed.
- Mark the thread/comment as resolved after the fix is in place.
- Do not leave addressed review comments open.
- If permissions/tooling do not allow resolving threads, explicitly report which items remain open so a maintainer can resolve them.

## High-Signal Files for Agents
- `src/core/convert.ts`
- `src/core/types.ts`
- `src/core/engines/registry.ts`
- `src/core/engines/pandoc/adapter.ts`
- `src/core/engines/mammoth/adapter.ts`
- `src/core/engines/libreoffice/adapter.ts`
- `src/core/assets/extractMedia.ts`
- `src/core/assets/manager.ts`
- `src/api/server.ts`
- `src/cli/commands/convert.ts`
- `src/cli/commands/batch.ts`
- `docs/architecture.md`
- `docs/limitations.md`

## Documentation Maintenance Rule
When a major/outdated change is made in this file:
1. Update `.github/copilot-instructions.md` in the same branch.
2. Keep the sync policy and core facts consistent between files.
3. Keep "last updated" metadata current in both files.

---

_Last updated: 2026-03-07_

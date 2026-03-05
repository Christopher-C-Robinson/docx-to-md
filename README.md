# docx-to-md

> Reliable DOCX → Markdown conversion with a pluggable engine architecture.

[![CI](https://github.com/YOUR_ORG/docx-to-md/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_ORG/docx-to-md/actions/workflows/ci.yml)

## Features

- **Multiple engines**: Pandoc (recommended), Mammoth (pure JS), LibreOffice
- **Auto-detection**: Falls back to the next available engine automatically
- **GFM & CommonMark** output formats
- **Media extraction**: Images saved to a configurable directory
- **Batch conversion**: Process entire directory trees in parallel
- **Tracked changes**: Accept/reject/include policy (Pandoc only)
- **Lua filters**: Custom Pandoc filters for advanced transformations
- **Security**: Zip-slip prevention, HTML sanitization

## Installation

```bash
npm install -g docx-to-md
# or
npx docx-to-md convert document.docx
```

Pandoc must be installed separately for the default engine:
- macOS: `brew install pandoc`
- Ubuntu: `apt-get install pandoc`
- Windows: https://pandoc.org/installing.html

## Usage

### Single file

```bash
docx2md convert document.docx
docx2md convert document.docx -o output.md --media-dir ./images
docx2md convert document.docx --engine mammoth
docx2md convert document.docx --track-changes accept
```

### Batch conversion

```bash
docx2md batch ./docs/ --out ./markdown/ --jobs 8
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-e, --engine` | `pandoc` \| `mammoth` \| `libreoffice` | auto |
| `-t, --to` | `gfm` \| `commonmark` | `gfm` |
| `-o, --output` | Output file path | input path with `.md` |
| `--media-dir` | Directory for extracted images | — |
| `--track-changes` | `accept` \| `reject` \| `all` | — |
| `--lua-filter` | Pandoc Lua filter path (repeatable) | — |
| `--timeout` | Engine timeout in ms | 60000 |
| `--jobs` | Parallel workers (batch) | 4 |

## Programmatic API

```typescript
import { resolveEngine } from 'docx-to-md';

const engine = await resolveEngine('mammoth');
const result = await engine.convert('input.docx', 'output.md', {
  format: 'gfm',
  mediaDir: './images',
});

console.log(result.markdown);
console.log(result.warnings);
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for a detailed overview.

## Security

See [SECURITY.md](SECURITY.md) for the threat model and vulnerability reporting.

## License

MIT

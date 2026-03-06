# docx-to-md

> Reliable DOCX → Markdown conversion with a pluggable engine architecture.

[![CI](https://github.com/Christopher-C-Robinson/docx-to-md/actions/workflows/ci.yml/badge.svg)](https://github.com/Christopher-C-Robinson/docx-to-md/actions/workflows/ci.yml)

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

### Desktop Application (Windows & macOS)

The recommended way to use docx-to-md on Windows and macOS is via the native desktop application built with Electron.

> **No terminal required**: If you install from a release package, all setup is point-and-click.

#### Prerequisites

- None required for basic app installation.
- Optional (for best conversion quality): [Pandoc](https://pandoc.org/installing.html)
  - Windows: download and run the official `.msi` installer from <https://pandoc.org/installing.html>
  - macOS: download and run the official `.pkg` installer from <https://pandoc.org/installing.html>

#### Option A — Download a pre-built release

1. Go to the [Releases page](https://github.com/Christopher-C-Robinson/docx-to-md/releases) and download the package for your platform:

   | Platform | File to download |
   |----------|-----------------|
   | Windows (installer) | `docx2md-<version>-win-x64.exe` |
   | Windows (portable)  | `docx2md-<version>-win-portable-x64.exe` |
   | macOS (Apple Silicon) | `docx2md-<version>-mac-arm64.dmg` |
   | macOS (Intel)         | `docx2md-<version>-mac-x64.dmg` |

2. **Windows — installer**: Run the `.exe` setup wizard.  Choose an installation directory, optionally create a Desktop shortcut, and follow the prompts.

3. **Windows — portable**: No installation needed.  Place the `.exe` anywhere and run it directly.

4. **macOS**: Open the `.dmg` file, drag **docx2md** to your *Applications* folder, then launch it from Launchpad or Spotlight.
   > **Gatekeeper notice**: macOS may show a warning because the app is not notarized.  Right-click the app, choose **Open**, then click **Open** in the dialog.

5. (Optional) Install Pandoc with the GUI installer from pandoc.org for improved DOCX fidelity. If Pandoc is not installed, docx-to-md automatically falls back to Mammoth.

#### Recommended for product/non-technical users

Use **Option A** only. It is the fully non-terminal installation path.

#### Option B — Build from source

This path is intended for developers.

```bash
# 1. Clone the repository
git clone https://github.com/Christopher-C-Robinson/docx-to-md.git
cd docx-to-md

# 2. Install dependencies
npm install

# 3a. Build and package for your current platform
npm run electron:dist

# 3b. Or build for a specific platform
npm run electron:dist:mac   # macOS DMG + zip
npm run electron:dist:win   # Windows NSIS installer + portable exe
npm run electron:dist:linux # Linux AppImage
```

Packaged installers are written to the `release/` directory.

#### Running in development

```bash
npm run electron:dev
```

This builds the TypeScript sources and launches Electron pointing at the local Express server.

---

### CLI / npm package

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
| `--jobs` | Parallel workers (batch) | CPU core count |

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

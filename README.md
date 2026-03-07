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

### One-command install (no signing hassle)

The quickest way to get the desktop app on any platform — no code signing prompts,
no admin rights, no manual extraction.

#### macOS & Linux

```bash
curl -fsSL https://raw.githubusercontent.com/Christopher-C-Robinson/docx-to-md/main/scripts/install.sh | bash
```

What the script does:

- Detects your OS and CPU architecture (macOS arm64/x64, Linux x64)
- Downloads the latest pre-built release from GitHub
- **macOS**: extracts the `.app` bundle to `~/Applications/` (or a writable fallback), preserving Gatekeeper checks by default
- **Linux**: copies the `.AppImage` to `~/.local/bin/` (or `/usr/local/bin/` if writable) and makes it executable
- Creates a `docx2md` terminal launcher

Override the install directories:

```bash
# Install binary to a custom directory
curl -fsSL https://raw.githubusercontent.com/Christopher-C-Robinson/docx-to-md/main/scripts/install.sh | INSTALL_DIR=~/bin bash

# macOS: install the .app to a custom location
curl -fsSL https://raw.githubusercontent.com/Christopher-C-Robinson/docx-to-md/main/scripts/install.sh | APP_DIR=/Applications INSTALL_DIR=/usr/local/bin bash

# macOS: opt in to removing quarantine from the installed app
curl -fsSL https://raw.githubusercontent.com/Christopher-C-Robinson/docx-to-md/main/scripts/install.sh | DOCX2MD_TRUST_APP=yes bash
```

#### Windows (PowerShell)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr https://raw.githubusercontent.com/Christopher-C-Robinson/docx-to-md/main/scripts/install.ps1 -UseBasicParsing | iex"
```

What the script does:

- Downloads the latest portable `.exe` from GitHub (no installer wizard, no UAC prompt)
- Copies it to `%LOCALAPPDATA%\docx-to-md\bin\docx2md.exe`
- Adds that directory to your **user** PATH (no admin rights required)

Override the install directory:

```powershell
$env:DOCX2MD_INSTALL_DIR = "$HOME\bin"; powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr https://raw.githubusercontent.com/Christopher-C-Robinson/docx-to-md/main/scripts/install.ps1 -UseBasicParsing | iex"
```

---

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
   | Windows (installer) | `docx2md-<version>-win-x64-installer.exe` |
   | Windows (portable)  | `docx2md-<version>-win-x64-portable.exe` |
   | macOS (Apple Silicon) | `docx2md-<version>-mac-arm64.dmg` |
   | macOS (Intel)         | `docx2md-<version>-mac-x64.dmg` |
   | Linux                 | `docx2md-<version>-linux-x86_64.AppImage` |

2. **Windows — installer**: Run the `.exe` setup wizard.  Choose an installation directory, optionally create a Desktop shortcut, and follow the prompts.

3. **Windows — portable**: No installation needed.  Place the `.exe` anywhere and run it directly.

4. **macOS**: Open the `.dmg`, drag **docx2md.app** to your *Applications* folder, then launch it from Launchpad or Spotlight.
   > **Signed & notarized releases**: When the release was built with code-signing secrets configured, macOS Gatekeeper will trust the app immediately and no extra steps are required.
   >
   > **Unsigned releases** (e.g. unofficial or locally built): macOS may show a Gatekeeper warning.  Right-click the app, choose **Open**, then click **Open** in the dialog.  If you only see **Move to Trash / Done**, go to **System Settings → Privacy & Security** and click **Open Anyway** for `docx2md.app`.

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
npm run electron:dist:mac   # macOS x64 zip + arm64 zip
npm run electron:dist:win   # Windows NSIS installer + portable exe
npm run electron:dist:linux # Linux AppImage
```

Packaged installers are written to the `release/` directory.

#### Maintainers — publish a GitHub release

This repository includes an automated release workflow at `.github/workflows/release.yml`.

```bash
# 1) Create and push a version tag
git tag v0.1.0
git push origin v0.1.0
```

When the tag is pushed, GitHub Actions will:
- build Windows, macOS, and Linux Electron installers
- create a GitHub Release for that tag if it does not exist
- upload the generated files as release assets

You can also run the workflow manually from the Actions tab using **Release** -> **Run workflow** and passing an existing tag.

##### Setting up code signing secrets (recommended)

Configure the following repository secrets under **Settings → Secrets and variables → Actions** to produce signed and notarized artifacts.  All secrets are optional — if they are absent, unsigned artifacts are built instead.

**macOS signing & Apple notarization**

| Secret | Description |
|--------|-------------|
| `CSC_LINK` | Base64-encoded `.p12` export of your *Developer ID Application* certificate from Keychain Access (export the cert + private key, then run `base64 -i cert.p12 | tr -d '\n'`). |
| `CSC_KEY_PASSWORD` | Passphrase you chose when exporting the `.p12` file. |
| `APPLE_ID` | Apple ID email used to log in to App Store Connect / notarytool. |
| `APPLE_ID_PASSWORD` | App-specific password for that Apple ID (generated at [appleid.apple.com](https://appleid.apple.com)). |
| `APPLE_TEAM_ID` | 10-character Team ID shown in the Apple Developer portal (e.g. `ABC1234XYZ`). |

**Windows code signing** (removes SmartScreen warnings)

| Secret | Description |
|--------|-------------|
| `WIN_CSC_LINK` | Base64-encoded `.p12` export of your Windows code-signing certificate. |
| `WIN_CSC_KEY_PASSWORD` | Passphrase for the Windows `.p12` file. |

> **Why signing matters**: A signed and notarized macOS build passes Gatekeeper on first launch without any terminal commands.  A signed Windows build eliminates the SmartScreen "Unknown publisher" dialog.

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

### Automated Security Features

This repository is set up to use the following security tooling. Some features also require
enabling them in your repository's GitHub security settings.

| Feature | Tool | Details |
|---------|------|---------|
| Dependency update PRs | [Dependabot](https://docs.github.com/en/code-security/dependabot) | Weekly PRs for npm and GitHub Actions (configured via this repo) |
| Vulnerability alerts | Dependabot alerts | Alerts on CVEs in direct/transitive deps (requires Dependabot alerts to be enabled in GitHub settings) |
| Automatic security updates | Dependabot security updates | Auto-PRs for security-only fixes (requires security updates to be enabled in GitHub settings) |
| Secret scanning | GitHub Secret Scanning | Detects accidental credential commits and raises alerts (requires Secret Scanning to be enabled in GitHub settings) |
| Static analysis | GitHub Code Scanning (CodeQL) | Runs via GitHub Actions when Code Scanning is enabled in GitHub settings and the workflow is configured |

## License

MIT

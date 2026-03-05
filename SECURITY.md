# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

## Reporting a Vulnerability

Please report security vulnerabilities by opening a GitHub Security Advisory at:
https://github.com/YOUR_ORG/docx-to-md/security/advisories/new

Do **not** open a public issue for security vulnerabilities.

## Threat Model

### Zip-Slip (Path Traversal in DOCX archives)
DOCX files are ZIP archives. A malicious DOCX could contain entries with paths like `../../etc/passwd`. The `AssetManager.sanitizePath()` method mitigates this by:
1. Stripping leading `../` sequences
2. Extracting only the basename
3. Replacing non-alphanumeric characters (except `.`, `-`, `_`)
4. Verifying the resolved path is inside the media directory

### HTML Injection (Mammoth adapter)
Mammoth converts DOCX to HTML before converting to Markdown. The `sanitizeHtml()` method in the Mammoth adapter strips `<script>`, `<object>`, `<embed>` tags and `on*` event handler attributes.

### Command Injection (Pandoc / LibreOffice adapters)
All arguments passed to external processes use array-form `spawn()` (never `exec()` with string interpolation), preventing shell injection.

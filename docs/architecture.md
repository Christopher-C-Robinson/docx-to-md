# Architecture

## Overview

`docx-to-md` is structured around a pluggable engine architecture. The core library exposes a stable interface (`EngineAdapter`) that each conversion backend implements.

## Layers

```
CLI (src/cli/)
    └── Commands: convert, batch
Core (src/core/)
    ├── Engine Registry   – selects and instantiates adapters
    ├── Engine Adapters   – Pandoc, Mammoth, LibreOffice
    ├── AST Types         – internal document representation
    ├── Markdown Formatter– serializes AST to Markdown text
    ├── Asset Manager     – handles media extraction & path sanitization
    └── Metadata Extractor– parses document properties
```

## Engine Selection

Engines are tried in priority order: **Pandoc → Mammoth → LibreOffice**. You can override with `--engine`.

## Security

- Zip-slip prevention via `AssetManager.sanitizePath()`
- HTML sanitization in the Mammoth adapter (strips `<script>`, event handlers)

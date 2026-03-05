import * as path from 'path';
import * as fs from 'fs';

export class AssetManager {
  private outputDir: string;
  private mediaDir: string;

  constructor(outputDir: string, mediaDir?: string) {
    this.outputDir = path.resolve(outputDir);
    this.mediaDir = mediaDir ? path.resolve(mediaDir) : path.join(this.outputDir, 'media');
  }

  /**
   * Sanitize a file path extracted from a DOCX container.
   * Prevents zip-slip attacks by ensuring the resolved path stays within the media directory.
   */
  sanitizePath(relativePath: string): string {
    const normalized = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
    const basename = path.basename(normalized);
    const safe = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const resolved = path.resolve(this.mediaDir, safe);

    const mediaDirWithSep = this.mediaDir.endsWith(path.sep) ? this.mediaDir : this.mediaDir + path.sep;
    if (!resolved.startsWith(mediaDirWithSep) && resolved !== this.mediaDir) {
      throw new Error(`Unsafe path detected: ${relativePath}`);
    }
    return resolved;
  }

  ensureMediaDir(): void {
    fs.mkdirSync(this.mediaDir, { recursive: true });
  }

  getMediaDir(): string {
    return this.mediaDir;
  }

  getOutputDir(): string {
    return this.outputDir;
  }
}

/** Standalone path sanitization utility used in tests */
export function sanitizeMediaPath(relativePath: string, baseDir: string): string {
  const resolvedBase = path.resolve(baseDir);
  const normalized = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  const basename = path.basename(normalized);
  const safe = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const resolved = path.resolve(resolvedBase, safe);
  const resolvedBaseWithSep = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;
  if (!resolved.startsWith(resolvedBaseWithSep) && resolved !== resolvedBase) {
    throw new Error(`Unsafe path detected: ${relativePath}`);
  }
  return resolved;
}

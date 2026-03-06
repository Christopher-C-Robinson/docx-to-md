import * as fs from 'fs';
import * as path from 'path';

/** Maps common image file extensions to their MIME types. */
const MIME_TYPES: Record<string, string> = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.bmp':  'image/bmp',
  '.tiff': 'image/tiff',
  '.tif':  'image/tiff',
  '.ico':  'image/x-icon',
};

/**
 * Replace markdown image references with inline Base64 data URIs.
 *
 * Paths that are already absolute, data URIs, or remote URLs are left
 * unchanged.  Any image whose MIME type is not recognised (e.g. EMF) is
 * also left unchanged so the reference is preserved rather than silently
 * dropped.
 *
 * @param markdown  - The markdown content with `![alt](src)` references.
 * @param outputDir - Directory of the output markdown file, used to resolve
 *                    relative image paths.
 * @returns Modified markdown with inline data URIs substituted for local
 *          image references.
 */
export function inlineImages(markdown: string, outputDir: string): string {
  const allowedRoot = path.resolve(outputDir);
  const allowedRootWithSep = allowedRoot.endsWith(path.sep)
    ? allowedRoot
    : allowedRoot + path.sep;

  // Matches: ![alt text](src) or ![alt text](src "title")
  return markdown.replace(
    /!\[([^\]]*)\]\(([^)"]+?)(?:\s+"([^"]*)")?\)/g,
    (match, alt: string, src: string, title: string | undefined) => {
      // Skip remote URLs and already-inlined images
      if (/^(?:https?|data|ftp):/.test(src)) {
        return match;
      }

      // Keep absolute paths unchanged so only local, relative markdown assets are inlined.
      if (path.isAbsolute(src)) {
        return match;
      }

      const imgPath = path.resolve(allowedRoot, src);
      if (!imgPath.startsWith(allowedRootWithSep) && imgPath !== allowedRoot) {
        return match;
      }

      if (!fs.existsSync(imgPath)) {
        return match;
      }

      const ext = path.extname(imgPath).toLowerCase();
      const mimeType = MIME_TYPES[ext];

      if (!mimeType) {
        return match;
      }

      const data = fs.readFileSync(imgPath);
      const base64 = data.toString('base64');
      const dataUri = `data:${mimeType};base64,${base64}`;

      const titlePart = title !== undefined ? ` "${title}"` : '';
      return `![${alt}](${dataUri}${titlePart})`;
    }
  );
}

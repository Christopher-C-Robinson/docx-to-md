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

  let result = '';
  let cursor = 0;

  while (cursor < markdown.length) {
    const imageStart = markdown.indexOf('![', cursor);
    if (imageStart === -1) {
      result += markdown.slice(cursor);
      break;
    }

    result += markdown.slice(cursor, imageStart);

    const altEnd = markdown.indexOf('](', imageStart + 2);
    if (altEnd === -1) {
      result += markdown.slice(imageStart);
      break;
    }

    const closeParen = markdown.indexOf(')', altEnd + 2);
    if (closeParen === -1) {
      result += markdown.slice(imageStart);
      break;
    }

    const original = markdown.slice(imageStart, closeParen + 1);
    const alt = markdown.slice(imageStart + 2, altEnd);
    const inner = markdown.slice(altEnd + 2, closeParen).trim();

    let src = inner;
    let title: string | undefined;
    const titleMarker = inner.lastIndexOf(' "');
    if (titleMarker !== -1) {
      const maybeTitle = inner.slice(titleMarker + 1);
      if (maybeTitle.startsWith('"') && maybeTitle.endsWith('"')) {
        title = maybeTitle.slice(1, -1);
        src = inner.slice(0, titleMarker);
      }
    }

    if (src.length === 0 || /^(?:https?|data|ftp):/.test(src) || path.isAbsolute(src)) {
      result += original;
      cursor = closeParen + 1;
      continue;
    }

    const imgPath = path.resolve(allowedRoot, src);
    if (
      (!imgPath.startsWith(allowedRootWithSep) && imgPath !== allowedRoot)
      || !fs.existsSync(imgPath)
    ) {
      result += original;
      cursor = closeParen + 1;
      continue;
    }

    const ext = path.extname(imgPath).toLowerCase();
    const mimeType = MIME_TYPES[ext];
    if (!mimeType) {
      result += original;
      cursor = closeParen + 1;
      continue;
    }

    const data = fs.readFileSync(imgPath);
    const base64 = data.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64}`;
    const titlePart = title !== undefined ? ` "${title}"` : '';
    result += `![${alt}](${dataUri}${titlePart})`;
    cursor = closeParen + 1;
  }

  return result;
}

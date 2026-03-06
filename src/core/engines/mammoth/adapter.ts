import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { EngineAdapter } from '../interface';
import { ConversionOptions, ConversionResult, EngineType } from '../../types';
import { extractMedia } from '../../assets/extractMedia';

export class MammothAdapter implements EngineAdapter {
  readonly name: EngineType = 'mammoth';

  async isAvailable(): Promise<boolean> {
    try {
      require.resolve('mammoth');
      return true;
    } catch {
      return false;
    }
  }

  async convert(
    inputPath: string,
    outputPath: string,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const warnings: string[] = [];
    const assets: string[] = [];
    const metadata: Record<string, unknown> = {};

    const format = options.format ?? 'gfm';

    const styleMap: string[] = this.buildStyleMap(options);

    // Build options object matching the mammoth Options interface
    const mammothOptions: {
      styleMap?: string | string[];
      convertImage?: ReturnType<typeof mammoth.images.imgElement>;
    } = {
      styleMap,
    };

    if (options.mediaDir) {
      const mediaDir = path.resolve(options.mediaDir);
      let contentMap = new Map<string, string>();

      // Extract all media from the DOCX archive up-front so that images get
      // their original names (e.g. image1.png) with sanitized, safe paths.
      // The returned `contentMap` is built during extraction so no extra
      // disk reads are needed to match images in the mammoth callback.
      try {
        const { assets: extracted, warnings: extractWarnings, contentMap: extractedContentMap } = extractMedia(inputPath, mediaDir);
        assets.push(...extracted);
        warnings.push(...extractWarnings);
        contentMap = extractedContentMap;
      } catch (err) {
        warnings.push(`Failed to pre-extract DOCX media: ${(err as Error).message}`);
      }

      let imageIndex = 0;
      // Tracks base64 keys that have already been renamed so that duplicate
      // appearances of the same image reuse the sequential name.
      const renamedKeys = new Set<string>();

      const imageHandler = mammoth.images.imgElement((image) => {
        return image.read('base64').then((imageBase64) => {
          const existing = contentMap.get(imageBase64);
          if (existing) {
            if (!renamedKeys.has(imageBase64)) {
              // First encounter: rename to the next sequential filename,
              // avoiding collisions with any existing files.
              const ext = this.resolveImageExtension(existing, image.contentType);
              const newPath = this.nextAvailableImagePath(mediaDir, ext, () => ++imageIndex);

              if (existing !== newPath) {
                fs.renameSync(existing, newPath);
                const idx = assets.indexOf(existing);
                if (idx !== -1) assets[idx] = newPath;
              }

              renamedKeys.add(imageBase64);
              contentMap.set(imageBase64, newPath);
            }
            // contentMap is guaranteed to have a value for imageBase64 here: it
            // was either just set above or was set during a previous encounter.
            const finalPath = contentMap.get(imageBase64) ?? existing;
            return { src: path.relative(path.dirname(outputPath), finalPath) };
          }

          // Fallback: image not found in the DOCX media directory (e.g. an
          // embedded OLE object).  Write it with a safe sequential name.
          const ext = this.resolveImageExtension('', image.contentType);
          const filepath = this.nextAvailableImagePath(mediaDir, ext, () => ++imageIndex);
          fs.writeFileSync(filepath, Buffer.from(imageBase64, 'base64'));
          assets.push(filepath);
          return { src: path.relative(path.dirname(outputPath), filepath) };
        });
      });
      mammothOptions.convertImage = imageHandler;
    }

    const htmlResult = await mammoth.convertToHtml({ path: inputPath }, mammothOptions);

    for (const msg of htmlResult.messages) {
      if (msg.type === 'warning' || msg.type === 'error') {
        warnings.push(`[mammoth] ${msg.message}`);
      }
    }

    const html = this.sanitizeHtml(htmlResult.value);

    const td = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      hr: '---',
    });

    if (format === 'gfm') {
      td.use(gfm);
    }

    const markdown = td.turndown(html);

    const finalMd = markdown.trim() + '\n';
    fs.writeFileSync(outputPath, finalMd, 'utf8');

    return { markdown: finalMd, assets, warnings, metadata };
  }

  /**
   * Built-in default style mappings for common DOCX paragraph and run styles
   * that Mammoth does not recognise out-of-the-box (e.g. styles produced by
   * Pandoc or Microsoft Word).  User-supplied mappings take priority because
   * they are prepended before these defaults and Mammoth uses first-match wins.
   */
  private static readonly DEFAULT_STYLE_MAP: readonly string[] = [
    "p[style-name='First Paragraph'] => p:fresh",
    "p[style-name='Body Text'] => p:fresh",
    "p[style-name='Compact'] => p:fresh",
    "p[style-name='Source Code'] => pre[class='language-text']:fresh",
    "r[style-name='Verbatim Char'] => code",
    "p[style-name='Title'] => h1:fresh",
    "p[style-name='Subtitle'] => p:fresh",
    "p[style-name='No Spacing'] => p:fresh",
    "r[style-name='Subtle Reference'] => em",
  ];

  private buildStyleMap(options: ConversionOptions): string[] {
    const userEntries: string[] = [];
    if (options.styleMap) {
      for (const entry of options.styleMap) {
        const prefix = entry.type === 'run' ? 'r' : 'p';
        userEntries.push(`${prefix}[style-name='${entry.docxStyle}'] => ${entry.markdownOutput}`);
      }
    }
    // User-provided rules come first so they override the built-in defaults.
    return [...userEntries, ...MammothAdapter.DEFAULT_STYLE_MAP];
  }

  /**
   * Basic HTML sanitization: remove script/object/embed elements and dangerous attributes.
   * Encoding of dangerous tag openers is performed first so no subsequent step
   * can re-introduce them, allowing CodeQL to verify the invariant statically.
   */
  private sanitizeHtml(html: string): string {
    return html
      // Encode dangerous tag openers first – this guarantees subsequent steps are safe
      .replace(/<(\/?\s*script)\b/gi, (_m, tag: string) => `&lt;${tag}`)
      .replace(/<(\/?\s*object)\b/gi, (_m, tag: string) => `&lt;${tag}`)
      .replace(/<(\/?\s*embed)\b/gi, (_m, tag: string) => `&lt;${tag}`)
      // Remove on* event handler attributes
      .replace(/(<[^>]+)\s+on\w+\s*=\s*"[^"]*"/gi, '$1')
      .replace(/(<[^>]+)\s+on\w+\s*=\s*'[^']*'/gi, '$1')
      .replace(/(<[^>]+)\s+on\w+\s*=[^\s>]*/gi, '$1');
  }

  /**
   * Uses either an existing file extension or a safe extension derived from
   * contentType to avoid building file paths from uncontrolled strings.
   */
  private resolveImageExtension(existingPath: string, contentType: string): string {
    const existingExt = path.extname(existingPath);
    if (existingExt) return existingExt;

    const typeSuffix = contentType.split('/')[1] ?? 'png';
    const sanitized = typeSuffix.toLowerCase().replace(/[^a-z0-9]/g, '');
    return sanitized ? `.${sanitized}` : '.png';
  }

  /**
   * Generates the next sequential image filename under mediaDir and ensures
   * the resolved path remains within that directory.
   */
  private nextAvailableImagePath(mediaDir: string, ext: string, nextIndex: () => number): string {
    const normalizedMediaDir = path.resolve(mediaDir);

    // Loop until we find a deterministic unused destination name.
    while (true) {
      const index = nextIndex();
      const filename = `image-${String(index).padStart(2, '0')}${ext}`;
      const candidate = path.resolve(normalizedMediaDir, filename);

      if (!candidate.startsWith(`${normalizedMediaDir}${path.sep}`)) {
        throw new Error(`Unsafe media path generated: ${filename}`);
      }

      if (!fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
}

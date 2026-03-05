import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { EngineAdapter } from '../interface';
import { ConversionOptions, ConversionResult, EngineType } from '../../types';

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
    } = {};

    if (styleMap.length > 0) {
      mammothOptions.styleMap = styleMap;
    }

    if (options.mediaDir) {
      const mediaDir = path.resolve(options.mediaDir);
      fs.mkdirSync(mediaDir, { recursive: true });
      const imageHandler = mammoth.images.imgElement((image) => {
        return image.read('base64').then((imageBuffer) => {
          const ext = image.contentType.split('/')[1] ?? 'png';
          const filename = `image-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const filepath = path.join(mediaDir, filename);
          fs.writeFileSync(filepath, Buffer.from(imageBuffer, 'base64'));
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

  private buildStyleMap(options: ConversionOptions): string[] {
    const map: string[] = [];
    if (options.styleMap) {
      for (const entry of options.styleMap) {
        map.push(`p[style-name='${entry.docxStyle}'] => ${entry.markdownOutput}`);
      }
    }
    return map;
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
}

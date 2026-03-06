import * as fs from 'fs';
import * as path from 'path';
import {
  ConversionOptions,
  ConversionResult,
  EngineType,
  MarkdownFormat,
  StyleMapping,
  TrackChangesPolicy,
} from './types';
import { resolveEngine } from './engines/registry';
import { inlineImages as inlineImagesTransform } from './assets/inlineImages';

export interface ConvertDocxOptions {
  inputPath: string;
  outputPath: string;
  engine?: EngineType;
  format?: MarkdownFormat;
  mediaDir?: string;
  trackChanges?: TrackChangesPolicy;
  luaFilters?: string[];
  timeout?: number;
  styleMap?: StyleMapping[];
  /** When true, replace image references with inline Base64 data URIs. */
  inlineImages?: boolean;
}

export interface ConvertDocxResult extends ConversionResult {
  engineName: EngineType;
}

export async function convertDocx(opts: ConvertDocxOptions): Promise<ConvertDocxResult> {
  const options: ConversionOptions = {
    engine: opts.engine,
    format: opts.format ?? 'gfm',
    mediaDir: opts.mediaDir,
    trackChanges: opts.trackChanges,
    luaFilters: opts.luaFilters,
    timeout: opts.timeout,
    styleMap: opts.styleMap,
  };

  const engine = await resolveEngine(options.engine);
  options.engine = engine.name;
  const result = await engine.convert(opts.inputPath, opts.outputPath, options);

  if (opts.inlineImages) {
    const outputDir = path.dirname(opts.outputPath);
    const inlinedMarkdown = inlineImagesTransform(result.markdown, outputDir);
    fs.writeFileSync(opts.outputPath, inlinedMarkdown, 'utf8');
    return { ...result, markdown: inlinedMarkdown, engineName: engine.name };
  }

  return { ...result, engineName: engine.name };
}

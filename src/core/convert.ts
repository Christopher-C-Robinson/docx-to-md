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
import { PandocAdapter } from './engines/pandoc/adapter';

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
  const resolvedOutputDir = path.dirname(opts.outputPath);
  const effectiveMediaDir = opts.mediaDir ?? (opts.inlineImages ? path.join(resolvedOutputDir, 'media') : undefined);

  const options: ConversionOptions = {
    engine: opts.engine,
    format: opts.format ?? 'gfm',
    mediaDir: effectiveMediaDir,
    trackChanges: opts.trackChanges,
    luaFilters: opts.luaFilters,
    timeout: opts.timeout,
    styleMap: opts.styleMap,
  };

  const engine = await resolveEngine(options.engine);
  options.engine = engine.name;
  const result = await engine.convert(opts.inputPath, opts.outputPath, options);

  if (opts.inlineImages) {
    const inlinedMarkdown = inlineImagesTransform(result.markdown, resolvedOutputDir);
    fs.writeFileSync(opts.outputPath, inlinedMarkdown, 'utf8');
    return { ...result, markdown: inlinedMarkdown, engineName: engine.name };
  }

  return { ...result, engineName: engine.name };
}

export interface RenderDocxOptions {
  inputPath: string;
  outputPath: string;
  referenceDoc?: string;
  resourcePath?: string[];
  toc?: boolean;
  timeout?: number;
}

/**
 * Converts a Markdown file to a DOCX file using Pandoc.
 * Pandoc must be installed and available on the system PATH.
 */
export async function renderDocx(opts: RenderDocxOptions): Promise<void> {
  const adapter = new PandocAdapter(null);

  const available = await adapter.isAvailable();
  if (!available) {
    throw new Error('Pandoc is required for Markdown to DOCX conversion but was not found on PATH');
  }

  fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });

  await adapter.convertMarkdownToDocx(opts.inputPath, opts.outputPath, {
    referenceDoc: opts.referenceDoc,
    resourcePath: opts.resourcePath,
    toc: opts.toc,
    timeout: opts.timeout,
  });
}

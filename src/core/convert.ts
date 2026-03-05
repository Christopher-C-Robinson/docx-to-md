import { ConversionOptions, ConversionResult, EngineType, MarkdownFormat, TrackChangesPolicy } from './types';
import { resolveEngine } from './engines/registry';

export interface ConvertDocxOptions {
  inputPath: string;
  outputPath: string;
  engine?: EngineType;
  format?: MarkdownFormat;
  mediaDir?: string;
  trackChanges?: TrackChangesPolicy;
  luaFilters?: string[];
  timeout?: number;
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
  };

  const engine = await resolveEngine(options.engine);
  const result = await engine.convert(opts.inputPath, opts.outputPath, options);
  return { ...result, engineName: engine.name };
}

import {
  ConversionOptions,
  ConversionResult,
  EngineType,
  MarkdownFormat,
  StyleMapping,
  TrackChangesPolicy,
} from './types';
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
  styleMap?: StyleMapping[];
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
  return { ...result, engineName: engine.name };
}

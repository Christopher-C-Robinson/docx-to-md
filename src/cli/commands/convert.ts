import * as path from 'path';
import * as fs from 'fs';
import { EngineType, MarkdownFormat, TrackChangesPolicy } from '../../core/types';
import { convertDocx } from '../../core/convert';

interface ConvertCommandOptions {
  engine?: string;
  to?: string;
  output?: string;
  mediaDir?: string;
  trackChanges?: string;
  luaFilter?: string[];
  timeout?: string;
}

export async function convertCommand(
  input: string,
  opts: ConvertCommandOptions
): Promise<void> {
  const inputPath = path.resolve(input);

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const outputPath = opts.output
    ? path.resolve(opts.output)
    : path.join(path.dirname(inputPath), path.basename(inputPath, '.docx') + '.md');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  try {
    const result = await convertDocx({
      inputPath,
      outputPath,
      engine: opts.engine as EngineType | undefined,
      format: (opts.to as MarkdownFormat | undefined) ?? 'gfm',
      mediaDir: opts.mediaDir ? path.resolve(opts.mediaDir) : undefined,
      trackChanges: opts.trackChanges as TrackChangesPolicy | undefined,
      luaFilters: opts.luaFilter,
      timeout: opts.timeout ? parseInt(opts.timeout, 10) : undefined,
    });

    console.error(`Using engine: ${result.engineName}`);

    for (const warning of result.warnings) {
      console.error(`Warning: ${warning}`);
    }

    if (result.assets.length > 0) {
      console.error(`Extracted ${result.assets.length} asset(s)`);
    }

    console.log(outputPath);
  } catch (err) {
    console.error(`Conversion failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

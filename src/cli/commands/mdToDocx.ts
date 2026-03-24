import * as path from 'path';
import * as fs from 'fs';
import { renderDocx } from '../../core/convert';

interface MdToDocxCommandOptions {
  output?: string;
  referenceDoc?: string;
  resourcePath?: string[];
  toc?: boolean;
  timeout?: string;
}

export async function mdToDocxCommand(
  input: string,
  opts: MdToDocxCommandOptions
): Promise<void> {
  const inputPath = path.resolve(input);

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const outputPath = opts.output
    ? path.resolve(opts.output)
    : path.join(path.dirname(inputPath), path.basename(inputPath, '.md') + '.docx');

  try {
    await renderDocx({
      inputPath,
      outputPath,
      referenceDoc: opts.referenceDoc ? path.resolve(opts.referenceDoc) : undefined,
      resourcePath: opts.resourcePath,
      toc: opts.toc,
      timeout: opts.timeout ? parseInt(opts.timeout, 10) : undefined,
    });

    console.log(outputPath);
  } catch (err) {
    console.error(`Conversion failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

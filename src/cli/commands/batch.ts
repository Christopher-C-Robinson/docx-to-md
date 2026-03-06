import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ConversionOptions, EngineType, MarkdownFormat, TrackChangesPolicy } from '../../core/types';
import { resolveEngine } from '../../core/engines/registry';
import { inlineImages as inlineImagesTransform } from '../../core/assets/inlineImages';

interface BatchCommandOptions {
  out?: string;
  to?: string;
  engine?: string;
  mediaDir?: string;
  trackChanges?: string;
  jobs?: string;
  timeout?: string;
  inlineImages?: boolean;
}

export async function batchCommand(
  inputDir: string,
  opts: BatchCommandOptions
): Promise<void> {
  const resolvedInput = path.resolve(inputDir);

  if (!fs.existsSync(resolvedInput)) {
    console.error(`Error: Input directory not found: ${resolvedInput}`);
    process.exit(1);
  }

  const outDir = opts.out ? resolveOutputPath(opts.out) : resolvedInput;
  fs.mkdirSync(outDir, { recursive: true });

  const rawConcurrency = opts.jobs ? parseInt(opts.jobs, 10) : os.cpus().length;
  const concurrency = Math.floor(rawConcurrency);
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    console.error(
      `Error: Invalid concurrency${
        opts.jobs
          ? ` value for --jobs: ${opts.jobs}`
          : ` detected from CPU count: ${rawConcurrency}`
      }. Please specify a positive integer.`
    );
    process.exit(1);
  }

  const options: ConversionOptions = {
    engine: opts.engine as EngineType | undefined,
    format: (opts.to as MarkdownFormat | undefined) ?? 'gfm',
    mediaDir: opts.mediaDir ? resolveOutputPath(opts.mediaDir) : undefined,
    trackChanges: opts.trackChanges as TrackChangesPolicy | undefined,
    timeout: opts.timeout ? parseInt(opts.timeout, 10) : undefined,
  };

  const docxFiles = findDocxFiles(resolvedInput);

  if (docxFiles.length === 0) {
    console.error('No DOCX files found in directory');
    return;
  }

  console.error(`Found ${docxFiles.length} DOCX file(s), converting with ${concurrency} worker(s)...`);

  const engine = await resolveEngine(options.engine);
  console.error(`Using engine: ${engine.name}`);

  let succeeded = 0;
  let failed = 0;

  const queue = [...docxFiles];
  const running: Promise<void>[] = [];

  const processNext = async (): Promise<void> => {
    const file = queue.shift();
    if (!file) return;

    const rel = path.relative(resolvedInput, file);
    const outPath = path.join(outDir, rel.replace(/\.docx$/i, '.md'));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    try {
      const result = await engine.convert(file, outPath, options);
      for (const w of result.warnings) {
        console.error(`[${rel}] Warning: ${w}`);
      }
      if (opts.inlineImages) {
        const inlinedMarkdown = inlineImagesTransform(result.markdown, path.dirname(outPath));
        fs.writeFileSync(outPath, inlinedMarkdown, 'utf8');
      }
      console.log(`✓ ${rel} → ${path.relative(process.cwd(), outPath)}`);
      succeeded++;
    } catch (err) {
      console.error(`✗ ${rel}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  };

  const runBatch = async (): Promise<void> => {
    while (queue.length > 0 || running.length > 0) {
      while (running.length < concurrency && queue.length > 0) {
        const p = processNext().then(() => {
          running.splice(running.indexOf(p), 1);
        });
        running.push(p);
      }
      if (running.length > 0) {
        await Promise.race(running);
      }
    }
  };

  await runBatch();

  console.error(`\nBatch complete: ${succeeded} succeeded, ${failed} failed`);

  if (failed > 0) process.exit(1);
}

function resolveOutputPath(value: string): string {
  if (path.isAbsolute(value)) {
    // Keep absolute paths rooted as provided (avoid injecting cwd drive letters on Windows),
    // but normalize separators so downstream path operations stay consistent.
    return path.normalize(value);
  }
  return path.resolve(value);
}

function findDocxFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findDocxFiles(full));
    } else if (entry.isFile() && /\.docx$/i.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

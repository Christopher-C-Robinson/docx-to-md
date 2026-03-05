import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { EngineAdapter } from '../interface';
import { ConversionOptions, ConversionResult, EngineType } from '../../types';
import { MammothAdapter } from '../mammoth/adapter';

const PANDOC_TIMEOUT_MS = 60_000;

export class PandocAdapter implements EngineAdapter {
  readonly name: EngineType = 'pandoc';
  private readonly fallback: EngineAdapter | null;

  constructor(fallback?: EngineAdapter | null) {
    this.fallback = fallback !== undefined ? fallback : new MammothAdapter();
  }

  async isAvailable(): Promise<boolean> {
    return new Promise(resolve => {
      const proc = spawn('pandoc', ['--version']);
      proc.on('error', () => resolve(false));
      proc.on('close', (code: number | null) => resolve(code === 0));
    });
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
    const timeout = options.timeout ?? PANDOC_TIMEOUT_MS;

    const cmd: string[] = ['-f', 'docx', '-t', format];

    if (options.mediaDir) {
      const mediaDir = path.resolve(options.mediaDir);
      fs.mkdirSync(mediaDir, { recursive: true });
      cmd.push('--extract-media', mediaDir);
    }

    if (options.trackChanges) {
      cmd.push('--track-changes', options.trackChanges);
    }

    if (options.luaFilters) {
      for (const filter of options.luaFilters) {
        cmd.push('--lua-filter', filter);
      }
    }

    cmd.push('-o', outputPath, inputPath);

    try {
      await this.runPandoc(cmd, timeout);
    } catch (err) {
      if (this.fallback) {
        const errMsg = err instanceof Error ? err.message : String(err);
        warnings.push(`Pandoc failed: ${errMsg}; falling back to ${this.fallback.name}`);
        const fallbackResult = await this.fallback.convert(inputPath, outputPath, options);
        return {
          ...fallbackResult,
          warnings: [...warnings, ...fallbackResult.warnings],
        };
      }
      throw err;
    }

    const markdown = fs.readFileSync(outputPath, 'utf8');

    if (options.mediaDir) {
      try {
        assets.push(...this.collectAssets(options.mediaDir));
      } catch {
        warnings.push(`Could not list media assets in ${options.mediaDir}`);
      }
    }

    return { markdown, assets, warnings, metadata };
  }

  private runPandoc(args: string[], timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('pandoc', args);
      const stderr: string[] = [];
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGKILL');
        reject(new Error(`Pandoc timed out after ${timeout}ms`));
      }, timeout);

      proc.stderr.on('data', (data: Buffer) => stderr.push(data.toString()));
      proc.on('error', (err: Error) => { clearTimeout(timer); reject(err); });
      proc.on('close', (code: number | null) => {
        clearTimeout(timer);
        if (timedOut) return;
        if (code !== 0) {
          reject(new Error(`Pandoc exited with code ${code}: ${stderr.join('')}`));
        } else {
          resolve();
        }
      });
    });
  }

  private collectAssets(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.collectAssets(full));
      } else {
        results.push(full);
      }
    }
    return results;
  }
}

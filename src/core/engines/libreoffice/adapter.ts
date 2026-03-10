import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EngineAdapter } from '../interface';
import { ConversionOptions, ConversionResult, EngineType } from '../../types';
import { extractMedia } from '../../assets/extractMedia';
import {
  MAX_STDERR_BYTES,
  buildSandboxedSpawn,
  validateInputFile,
  validateShellSafePath,
} from '../sandbox';

const LO_TIMEOUT_MS = 120_000;

/** Virtual-memory limit (MB) for the soffice process on Linux. */
const LO_MEM_LIMIT_MB = 2048;
/** CPU-time limit (seconds) for the soffice process on Linux. */
const LO_CPU_LIMIT_SECS = 300;

export class LibreOfficeAdapter implements EngineAdapter {
  readonly name: EngineType = 'libreoffice';

  async isAvailable(): Promise<boolean> {
    const candidates = ['soffice', 'libreoffice'];
    for (const cmd of candidates) {
      const available = await new Promise<boolean>(resolve => {
        const proc = spawn(cmd, ['--version']);
        proc.on('error', () => resolve(false));
        proc.on('close', code => resolve(code === 0));
      });
      if (available) return true;
    }
    return false;
  }

  async convert(
    inputPath: string,
    outputPath: string,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const warnings: string[] = [];
    const assets: string[] = [];
    const metadata: Record<string, unknown> = {};
    const timeout = options.timeout ?? LO_TIMEOUT_MS;

    validateInputFile(inputPath, options.maxFileSizeBytes);

    // Reject paths containing null bytes or control characters before they are
    // forwarded to prlimit / the external binary.
    validateShellSafePath(inputPath);
    validateShellSafePath(outputPath);

    const outDir = path.dirname(outputPath);
    fs.mkdirSync(outDir, { recursive: true });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx2md-lo-'));

    try {
      await this.runLibreOffice(inputPath, tmpDir, timeout);

      const inputBase = path.basename(inputPath, path.extname(inputPath));
      const tmpOutput = path.join(tmpDir, `${inputBase}.md`);

      if (!fs.existsSync(tmpOutput)) {
        const txtOutput = path.join(tmpDir, `${inputBase}.txt`);
        if (fs.existsSync(txtOutput)) {
          warnings.push('LibreOffice output .txt instead of .md; using as fallback');
          fs.copyFileSync(txtOutput, outputPath);
        } else {
          throw new Error(`LibreOffice did not produce output file at ${tmpOutput}`);
        }
      } else {
        fs.copyFileSync(tmpOutput, outputPath);
      }

      const markdown = fs.readFileSync(outputPath, 'utf8');

      if (options.mediaDir) {
        try {
          const { assets: extracted, warnings: extractWarnings } = extractMedia(inputPath, options.mediaDir);
          assets.push(...extracted);
          warnings.push(...extractWarnings);
        } catch (err) {
          warnings.push(`Media extraction failed: ${(err as Error).message}`);
        }
      }

      return { markdown, assets, warnings, metadata };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  private runLibreOffice(inputPath: string, outDir: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const sofficeArgs = [
        '--headless',
        '--convert-to', 'md:Markdown',
        '--outdir', outDir,
        inputPath,
      ];
      const [spawnCmd, spawnArgs] = buildSandboxedSpawn('soffice', sofficeArgs, {
        memLimitMb: LO_MEM_LIMIT_MB,
        cpuLimitSecs: LO_CPU_LIMIT_SECS,
      });
      const proc = spawn(spawnCmd, spawnArgs);

      const stderr: string[] = [];
      let stderrBytes = 0;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGKILL');
        reject(new Error(`LibreOffice timed out after ${timeout}ms`));
      }, timeout);

      proc.stderr.on('data', (d: Buffer) => {
        stderrBytes += d.length;
        if (stderrBytes > MAX_STDERR_BYTES) {
          proc.kill('SIGKILL');
          clearTimeout(timer);
          reject(new Error(`LibreOffice stderr exceeded ${MAX_STDERR_BYTES} bytes`));
          return;
        }
        stderr.push(d.toString());
      });
      proc.on('error', err => { clearTimeout(timer); reject(err); });
      proc.on('close', code => {
        clearTimeout(timer);
        if (timedOut) return;
        if (code !== 0) {
          reject(new Error(`LibreOffice exited with code ${code}: ${stderr.join('')}`));
        } else {
          resolve();
        }
      });
    });
  }
}

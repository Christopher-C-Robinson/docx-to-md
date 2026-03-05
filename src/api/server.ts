import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { resolveEngine } from '../core/engines/registry';
import { ConversionOptions } from '../core/types';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds
/** Maximum number of conversion requests per IP within the rate-limit window. */
export const RATE_LIMIT_MAX = 20;
/** Rate-limit window in milliseconds (15 minutes). */
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export interface AssetEntry {
  filename: string;
  contentBase64: string;
  contentType: string;
}

export interface ConvertResponse {
  markdown: string;
  assets: AssetEntry[];
  warnings: string[];
}

export function createServer(options?: {
  maxFileSizeBytes?: number;
  timeoutMs?: number;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
}): express.Application {
  const maxFileSizeBytes = options?.maxFileSizeBytes ?? MAX_FILE_SIZE_BYTES;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const rateLimitMaxReqs = options?.rateLimitMax ?? RATE_LIMIT_MAX;
  const rateLimitWindow = options?.rateLimitWindowMs ?? RATE_LIMIT_WINDOW_MS;

  const convertLimiter = rateLimit({
    windowMs: rateLimitWindow,
    max: rateLimitMaxReqs,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });

  const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: maxFileSizeBytes },
    fileFilter(_req, file, cb) {
      const isDocx =
        file.mimetype ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.originalname.toLowerCase().endsWith('.docx');
      if (isDocx) {
        cb(null, true);
      } else {
        cb(new Error('Only .docx files are supported'));
      }
    },
  });

  const app = express();

  app.post(
    '/convert',
    convertLimiter,
    upload.single('file'),
    async (req: Request, res: Response, next: NextFunction) => {
      if (!req.file) {
        res.status(400).json({
          error: 'No file uploaded. Send a .docx file as the "file" field.',
        });
        return;
      }

      const uploadedPath = req.file.path;
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-to-md-'));

      let cleaned = false;
      const cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;
        try {
          fs.rmSync(uploadedPath, { force: true });
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          // ignore cleanup errors
        }
      };

      const outputPath = path.join(tmpDir, 'output.md');
      const mediaDir = path.join(tmpDir, 'media');

      const conversionOptions: ConversionOptions = {
        format: 'gfm',
        mediaDir,
        timeout: timeoutMs,
      };

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        cleanup();
        if (!res.headersSent) {
          res.status(504).json({ error: 'Conversion timed out' });
        }
      }, timeoutMs);

      try {
        const engine = await resolveEngine();
        const result = await engine.convert(uploadedPath, outputPath, conversionOptions);

        clearTimeout(timer);
        if (timedOut) return;

        const assets: AssetEntry[] = [];
        for (const assetPath of result.assets) {
          try {
            const content = fs.readFileSync(assetPath);
            const ext = path.extname(assetPath).slice(1).toLowerCase();
            assets.push({
              filename: path.basename(assetPath),
              contentBase64: content.toString('base64'),
              contentType: mimeForExt(ext),
            });
          } catch {
            // skip unreadable assets
          }
        }

        const body: ConvertResponse = {
          markdown: result.markdown,
          assets,
          warnings: result.warnings,
        };
        res.json(body);
      } catch (err) {
        clearTimeout(timer);
        if (!timedOut) {
          next(err);
        }
      } finally {
        cleanup();
      }
    }
  );

  // Error handler – multer errors and general errors
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `File too large. Maximum size is ${maxFileSizeBytes / (1024 * 1024)} MB.`
          : err.message;
      res.status(status).json({ error: message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export function mimeForExt(ext: string): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

// Entry-point when run directly: `node dist/api/server.js`
if (require.main === module) {
  const port = parseInt(process.env['PORT'] ?? '3000', 10);
  const app = createServer();
  app.listen(port, () => {
    process.stdout.write(`docx-to-md API server listening on port ${port}\n`);
  });
}

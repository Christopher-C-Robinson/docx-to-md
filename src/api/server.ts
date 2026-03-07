import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import archiver from 'archiver';
import rateLimit from 'express-rate-limit';
import { resolveEngine } from '../core/engines/registry';
import { ConversionOptions } from '../core/types';
import { MammothAdapter } from '../core/engines/mammoth/adapter';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

// Root directory under which all upload/session directories must reside.
const UPLOAD_ROOT = path.resolve(path.join(os.tmpdir(), 'docx-to-markdown-sessions'));

function isPathWithinDirectory(rootDir: string, candidatePath: string): boolean {
  const normalizedRoot = path.resolve(rootDir);
  const normalizedCandidate = path.resolve(candidatePath);
  if (process.platform === 'win32') {
    return normalizedCandidate.toLowerCase().startsWith(normalizedRoot.toLowerCase() + path.sep);
  }
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(normalizedRoot + path.sep);
}
/** Maximum number of conversion requests per IP within the rate-limit window. */
export const RATE_LIMIT_MAX = 20;
/** Rate-limit window in milliseconds (15 minutes). */
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const APP_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const APP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const APP_CONVERT_RATE_LIMIT_MAX = 30;
const APP_DOWNLOAD_RATE_LIMIT_MAX = 120;
const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
]);

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

export interface SessionData {
  tempRootDir: string;
  markdownPath: string;
  mediaDir: string;
  createdAt: number;
}

class RequestValidationError extends Error {}

const sessions = new Map<string, SessionData>();

function createSessionId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** Remove sessions older than SESSION_TTL_MS and delete their temp dirs */
function cleanupSessions(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions.entries()) {
    if (session.createdAt < cutoff) {
      try {
        fs.rmSync(session.tempRootDir, { recursive: true, force: true });
      } catch {
        // best effort
      }
      sessions.delete(id);
    }
  }
}

/** Resolve a session-scoped path and verify it stays within the session dir */
function resolveSessionPath(sessionDir: string, filename: string): string {
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Path traversal detected');
  }
  const basename = path.basename(filename);
  const safe = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const resolved = path.resolve(sessionDir, safe);
  const sessionDirWithSep = sessionDir.endsWith(path.sep) ? sessionDir : sessionDir + path.sep;
  if (!resolved.startsWith(sessionDirWithSep) && resolved !== sessionDir) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

const appStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-upload-'));
    cb(null, tmpDir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.docx';
    cb(null, `upload${ext}`);
  },
});

const appUpload = multer({
  storage: appStorage,
  limits: { fileSize: APP_MAX_FILE_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.docx') {
      cb(new RequestValidationError('Only .docx files are supported'));
      return;
    }
    if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new RequestValidationError('Invalid MIME type'));
      return;
    }
    cb(null, true);
  },
});

/**
 * Backward-compatible API used by existing unit tests.
 * POST /convert with direct markdown + base64 assets in one response.
 */
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
        cb(new RequestValidationError('Only .docx files are supported'));
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

        const assetEntries = await Promise.all(
          result.assets.map(async (assetPath) => {
            try {
              const content = await fs.promises.readFile(assetPath);
              const ext = path.extname(assetPath).slice(1).toLowerCase();
              return {
                filename: path.basename(assetPath),
                contentBase64: content.toString('base64'),
                contentType: mimeForExt(ext),
              } as AssetEntry;
            } catch {
              // skip unreadable assets
              return null;
            }
          })
        );

        const assets: AssetEntry[] = assetEntries.filter(
          (entry): entry is AssetEntry => entry !== null
        );

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
      if (err instanceof RequestValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

/**
 * Current web/API server from main branch.
 * POST /api/convert creates a session and exposes image/download endpoints.
 */
export function createApp(): express.Application {
  const app = express();

  const convertLimiter = rateLimit({
    windowMs: APP_RATE_LIMIT_WINDOW_MS,
    max: APP_CONVERT_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });

  const downloadLimiter = rateLimit({
    windowMs: APP_RATE_LIMIT_WINDOW_MS,
    max: APP_DOWNLOAD_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });

  const webDir = path.resolve(__dirname, '../../web');
  app.use(express.static(webDir));

  app.post(
    '/api/convert',
    convertLimiter,
    appUpload.single('file'),
    async (req: Request, res: Response): Promise<void> => {
      cleanupSessions();

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Send a .docx file as the "file" field.' });
        return;
      }

      const rawUploadDir = req.file.destination;
      const normalizedUploadDir = path.resolve(rawUploadDir);
      if (!isPathWithinDirectory(UPLOAD_ROOT, normalizedUploadDir)) {
        res.status(400).json({ error: 'Invalid upload directory.' });
        return;
      }

      const uploadDir = normalizedUploadDir;
      const inputPath = req.file.path;
      const sessionId = createSessionId();
      const sessionDir = uploadDir;
      const outputPath = path.join(sessionDir, 'output.md');
      const mediaDir = path.join(sessionDir, 'media');

      try {
        const adapter = new MammothAdapter();
        const result = await adapter.convert(inputPath, outputPath, {
          format: 'gfm',
          mediaDir,
        });

        const imageFiles = fs.existsSync(mediaDir)
          ? fs.readdirSync(mediaDir).filter((f) => /(\.png|jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(f))
          : [];

        sessions.set(sessionId, {
          tempRootDir: sessionDir,
          markdownPath: outputPath,
          mediaDir,
          createdAt: Date.now(),
        });

        res.json({
          sessionId,
          markdown: result.markdown,
          warnings: result.warnings,
          images: imageFiles.map((f) => ({
            name: f,
            url: `/api/images/${encodeURIComponent(sessionId)}/${encodeURIComponent(f)}`,
          })),
        });
      } catch (err) {
        try {
          fs.rmSync(uploadDir, { recursive: true, force: true });
        } catch {
          // best effort
        }
        const errorId =
          typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : crypto.randomBytes(16).toString('hex');
        console.error(`Conversion failed [${errorId}]`, err);
        res.status(500).json({
          error: 'Conversion failed due to an internal error. Please try again later.',
          errorId,
        });
      }
    }
  );

  app.get('/api/images/:sessionId/:filename', downloadLimiter, (req: Request, res: Response): void => {
    const sessionId = String(req.params['sessionId']);
    const filename = String(req.params['filename']);
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    let filePath: string;
    try {
      filePath = resolveSessionPath(session.mediaDir, filename);
    } catch {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Image not found' });
      return;
    }
    res.sendFile(filePath);
  });

  app.get('/api/download/markdown/:sessionId', downloadLimiter, (req: Request, res: Response): void => {
    const sessionId = String(req.params['sessionId']);
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    if (!fs.existsSync(session.markdownPath)) {
      res.status(404).json({ error: 'Markdown file not found' });
      return;
    }
    res.download(session.markdownPath, 'converted.md');
  });

  app.get('/api/download/images/:sessionId', downloadLimiter, (req: Request, res: Response): void => {
    const sessionId = String(req.params['sessionId']);
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    if (!fs.existsSync(session.mediaDir)) {
      res.status(404).json({ error: 'No images found for this session' });
      return;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="images.zip"');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      if (res.headersSent || res.writableEnded) {
        res.destroy(err);
        return;
      }
      res.status(500).json({ error: 'Failed to archive images.' });
    });
    archive.pipe(res);
    archive.directory(session.mediaDir, false);
    archive.finalize().catch(() => {
      // best effort
    });
  });

  app.get('/api/health', (_req: Request, res: Response): void => {
    res.json({ status: 'ok' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : err.message;
      res.status(status).json({ error: message });
      return;
    }
    if (err instanceof RequestValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      const safePrefixes = ['Only .docx files are supported', 'Invalid MIME type', 'File too large'];
      const message = safePrefixes.some((p) => err.message.startsWith(p)) ? err.message : 'Invalid request';
      res.status(400).json({ error: message });
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

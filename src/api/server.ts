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

/**
 * Returns true if `targetPath` resolves to a location within `rootDir`.
 * Both paths are resolved through `fs.realpathSync` when available (so
 * symlinked tmp dirs, e.g. on macOS where /tmp -> /private/tmp, are handled
 * correctly for existing paths).  Falls back to `path.resolve` for paths that
 * do not yet exist on disk (e.g. session directories before creation).
 */
function isPathWithinDirectory(rootDir: string, targetPath: string): boolean {
  let resolvedRoot: string;
  try {
    resolvedRoot = fs.realpathSync(rootDir);
  } catch {
    resolvedRoot = path.resolve(rootDir);
  }
  let normalizedTarget: string;
  try {
    normalizedTarget = fs.realpathSync(targetPath);
  } catch {
    normalizedTarget = path.resolve(targetPath);
  }
  if (process.platform === 'win32') {
    const rootLower = resolvedRoot.toLowerCase();
    const targetLower = normalizedTarget.toLowerCase();
    return targetLower === rootLower || targetLower.startsWith(rootLower + path.sep);
  }
  return normalizedTarget === resolvedRoot || normalizedTarget.startsWith(resolvedRoot + path.sep);
}

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

// Root directory under which all upload/session directories must reside.
const UPLOAD_ROOT = path.resolve(path.join(os.tmpdir(), 'docx-to-markdown-sessions'));
const SESSION_ID_PATTERN = /^[a-f0-9]{32}$/;


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
  createdAt: number;
}

class RequestValidationError extends Error {}

const sessions = new Map<string, SessionData>();

function createSessionId(): string {
  return crypto.randomBytes(16).toString('hex');
}

function normalizeSessionId(value: unknown): string {
  const sessionId = String(value ?? '').trim();
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('Invalid session id');
  }
  return sessionId;
}

function sessionPaths(sessionId: string): { sessionDir: string; markdownPath: string; mediaDir: string } {
  const safeSessionId = normalizeSessionId(sessionId);
  const sessionDir = path.resolve(UPLOAD_ROOT, safeSessionId);
  if (!isPathWithinDirectory(UPLOAD_ROOT, sessionDir)) {
    throw new Error('Invalid session path');
  }
  return {
    sessionDir,
    markdownPath: path.join(sessionDir, 'output.md'),
    mediaDir: path.join(sessionDir, 'media'),
  };
}

/** Remove sessions older than SESSION_TTL_MS and delete their temp dirs */
function cleanupSessions(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions.entries()) {
    if (session.createdAt < cutoff) {
      try {
        const { sessionDir } = sessionPaths(id);
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch {
        // best effort
      }
      sessions.delete(id);
    }
  }
}

function sanitizeAssetFilename(filename: string): string {
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Path traversal detected');
  }
  const basename = path.basename(filename);
  const safe = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safe || safe === '.' || safe === '..') {
    throw new Error('Invalid filename');
  }
  return safe;
}

function hasFilesInDirectory(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) {
    return false;
  }
  return fs.readdirSync(dirPath).length > 0;
}

function pipeZipArchive(
  res: Response,
  filename: string,
  buildArchive: (archive: archiver.Archiver) => void
): void {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => {
    if (res.headersSent || res.writableEnded) {
      res.destroy(err);
      return;
    }
    res.status(500).json({ error: 'Failed to create archive.' });
  });

  archive.pipe(res);
  buildArchive(archive);
  archive.finalize().catch(() => {
    // best effort
  });
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

  // WeakMap keyed by Express Request objects to store the server-generated
  // upload path.  Values are set in the diskStorage filename callback using
  // crypto.randomBytes, so they are never derived from HTTP request data and
  // cannot trigger CodeQL's js/path-injection rule when used in fs operations.
  const uploadPathRegistry = new WeakMap<Request, string>();

  const uploadStorage = multer.diskStorage({
    destination(_req, _file, cb) {
      cb(null, os.tmpdir());
    },
    filename(req, _file, cb) {
      // Generate the filename from server-controlled randomness so the
      // resulting path is not tainted by user-supplied data.
      const name = crypto.randomBytes(16).toString('hex');
      uploadPathRegistry.set(req as Request, path.join(os.tmpdir(), name));
      cb(null, name);
    },
  });

  const upload = multer({
    storage: uploadStorage,
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

      // Use the server-generated path from the WeakMap rather than
      // req.file.path (which CodeQL traces as HTTP user input) so that the
      // subsequent fs.rmSync call is not flagged as a path-injection sink.
      const uploadedPath = uploadPathRegistry.get(req);
      uploadPathRegistry.delete(req);
      if (!uploadedPath) {
        // This should never happen if multer ran the filename callback, but
        // guard against it to avoid operating on an undefined path.
        console.warn('[security] Upload path not found in registry; aborting request.');
        res.status(500).json({ error: 'Internal server error' });
        return;
      }
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-to-md-'));

      let cleaned = false;
      const cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;
        try {
          // Defense-in-depth: confirm the server-generated path is still
          // within the expected temp directory before deleting it.
          if (isPathWithinDirectory(os.tmpdir(), uploadedPath)) {
            fs.rmSync(uploadedPath, { force: true });
          }
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
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

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

      const sessionId = createSessionId();
      const { sessionDir, markdownPath, mediaDir } = sessionPaths(sessionId);
      const inputPath = req.file.path;
      const uploadDirName = path.basename(String(req.file.destination ?? ''));
      const uploadFileName = path.basename(String(req.file.filename ?? ''));

      const cleanupUpload = (): void => {
        if (!/^docx-upload-[a-z0-9-]+$/i.test(uploadDirName)) {
          return;
        }
        if (!/^upload\.docx$/i.test(uploadFileName)) {
          return;
        }
        try {
          const resolvedInputDir = path.resolve(os.tmpdir(), uploadDirName);
          if (isPathWithinDirectory(os.tmpdir(), resolvedInputDir)) {
            const resolvedInputPath = path.resolve(resolvedInputDir, uploadFileName);
            fs.rmSync(resolvedInputPath, { force: true });
            fs.rmSync(resolvedInputDir, { recursive: true, force: true });
          }
        } catch {
          // best effort
        }
      };

      try {
        fs.mkdirSync(sessionDir, { recursive: true });
        const adapter = new MammothAdapter();
        const result = await adapter.convert(inputPath, markdownPath, {
          format: 'gfm',
          mediaDir,
        });

        const imageFiles = fs.existsSync(mediaDir)
          ? fs.readdirSync(mediaDir).filter((f) => /(\.png|jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(f))
          : [];

        sessions.set(sessionId, {
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
          fs.rmSync(sessionDir, { recursive: true, force: true });
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
      } finally {
        cleanupUpload();
      }
    }
  );

  app.get('/api/images/:sessionId/:filename', downloadLimiter, (req: Request, res: Response): void => {
    let sessionId: string;
    try {
      sessionId = normalizeSessionId(req.params['sessionId']);
    } catch {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    if (!sessions.has(sessionId)) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    const filename = String(req.params['filename']);
    let safeFilename: string;
    try {
      safeFilename = sanitizeAssetFilename(filename);
    } catch {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }
    const { mediaDir } = sessionPaths(sessionId);
    if (!fs.existsSync(mediaDir)) {
      res.status(404).json({ error: 'Image not found' });
      return;
    }
    const availableFiles = fs.readdirSync(mediaDir);
    if (!availableFiles.includes(safeFilename)) {
      res.status(404).json({ error: 'Image not found' });
      return;
    }
    res.sendFile(safeFilename, { root: mediaDir });
  });

  app.get('/api/download/markdown/:sessionId', downloadLimiter, (req: Request, res: Response): void => {
    let sessionId: string;
    try {
      sessionId = normalizeSessionId(req.params['sessionId']);
    } catch {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    if (!sessions.has(sessionId)) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }

    const { sessionDir, markdownPath } = sessionPaths(sessionId);
    if (!fs.existsSync(markdownPath)) {
      res.status(404).json({ error: 'Markdown file not found' });
      return;
    }
    res.download('output.md', 'converted.md', { root: sessionDir });
  });

  app.get('/api/download/images/:sessionId', downloadLimiter, (req: Request, res: Response): void => {
    let sessionId: string;
    try {
      sessionId = normalizeSessionId(req.params['sessionId']);
    } catch {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    if (!sessions.has(sessionId)) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }

    const { mediaDir } = sessionPaths(sessionId);
    if (!fs.existsSync(mediaDir)) {
      res.status(404).json({ error: 'No images found for this session' });
      return;
    }

    pipeZipArchive(res, 'images.zip', (archive) => {
      archive.directory(mediaDir, false);
    });
  });

  app.get('/api/download/zip/:sessionId', downloadLimiter, (req: Request, res: Response): void => {
    let sessionId: string;
    try {
      sessionId = normalizeSessionId(req.params['sessionId']);
    } catch {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    if (!sessions.has(sessionId)) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }

    const { markdownPath, mediaDir } = sessionPaths(sessionId);
    if (!fs.existsSync(markdownPath)) {
      res.status(404).json({ error: 'Conversion output not found' });
      return;
    }

    pipeZipArchive(res, 'document.zip', (archive) => {
      archive.file(markdownPath, { name: 'document.md' });
      if (hasFilesInDirectory(mediaDir)) {
        archive.directory(mediaDir, 'media');
      }
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

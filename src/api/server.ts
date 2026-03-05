import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import archiver from 'archiver';
import { MammothAdapter } from '../core/engines/mammoth/adapter';

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
]);

export interface SessionData {
  markdownPath: string;
  mediaDir: string;
  createdAt: number;
}

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
        fs.rmSync(path.dirname(session.markdownPath), { recursive: true, force: true });
      } catch {
        // best effort
      }
      sessions.delete(id);
    }
  }
}

/** Resolve a session-scoped path and verify it stays within the session dir */
function resolveSessionPath(sessionDir: string, filename: string): string {
  const basename = path.basename(filename);
  const safe = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const resolved = path.resolve(sessionDir, safe);
  const sessionDirWithSep = sessionDir.endsWith(path.sep) ? sessionDir : sessionDir + path.sep;
  if (!resolved.startsWith(sessionDirWithSep) && resolved !== sessionDir) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-upload-'));
    cb(null, tmpDir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.docx';
    cb(null, `upload${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.docx') {
      cb(new Error('Only .docx files are supported'));
      return;
    }
    if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('Invalid MIME type'));
      return;
    }
    cb(null, true);
  },
});

export function createApp(): express.Application {
  const app = express();

  // Serve web UI
  const webDir = path.resolve(__dirname, '../../web');
  app.use(express.static(webDir));

  // POST /api/convert – upload a .docx and return markdown + image list
  app.post(
    '/api/convert',
    upload.single('file'),
    async (req: Request, res: Response): Promise<void> => {
      cleanupSessions();

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Send a .docx file as the "file" field.' });
        return;
      }

      const uploadDir = req.file.destination;
      const inputPath = req.file.path;
      const sessionId = createSessionId();
      const sessionDir = path.join(uploadDir, sessionId);
      fs.mkdirSync(sessionDir, { recursive: true });
      const outputPath = path.join(sessionDir, 'output.md');
      const mediaDir = path.join(sessionDir, 'media');

      try {
        const adapter = new MammothAdapter();
        const result = await adapter.convert(inputPath, outputPath, {
          format: 'gfm',
          mediaDir,
        });

        const imageFiles = fs.existsSync(mediaDir)
          ? fs.readdirSync(mediaDir).filter((f) => /\.(png|jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(f))
          : [];

        sessions.set(sessionId, {
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
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `Conversion failed: ${message}` });
      }
    }
  );

  // GET /api/images/:sessionId/:filename – serve an extracted image
  app.get('/api/images/:sessionId/:filename', (req: Request, res: Response): void => {
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

  // GET /api/download/markdown/:sessionId – download the markdown file
  app.get('/api/download/markdown/:sessionId', (req: Request, res: Response): void => {
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

  // GET /api/download/images/:sessionId – download all images as a zip
  app.get('/api/download/images/:sessionId', (req: Request, res: Response): void => {
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
      res.status(500).json({ error: `Archive error: ${err.message}` });
    });
    archive.pipe(res);
    archive.directory(session.mediaDir, false);
    archive.finalize().catch(() => {
      // best effort
    });
  });

  // GET /api/health
  app.get('/api/health', (_req: Request, res: Response): void => {
    res.json({ status: 'ok' });
  });

  // Error handler for multer and other middleware errors
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
    // Only surface known safe messages (multer file filter errors); hide internals
    const SAFE_PREFIXES = ['Only .docx files are supported', 'Invalid MIME type', 'File too large'];
    const message = SAFE_PREFIXES.some((p) => err.message.startsWith(p))
      ? err.message
      : 'Invalid request';
    res.status(400).json({ error: message });
  });

  return app;
}

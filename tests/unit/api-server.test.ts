import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { createServer, MAX_FILE_SIZE_BYTES, DEFAULT_TIMEOUT_MS, mimeForExt } from '../../src/api/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid DOCX bytes (ZIP PK magic header) used when we just need to
 *  pass the file-type check without running a real conversion. */
const FAKE_DOCX_BYTES = Buffer.from('PK\x03\x04', 'binary');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createServer – exported constants', () => {
  test('MAX_FILE_SIZE_BYTES is 10 MB', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });

  test('DEFAULT_TIMEOUT_MS is 30 seconds', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
  });
});

describe('POST /convert – request validation', () => {
  const app = createServer();

  test('returns 400 when no file is sent', async () => {
    const res = await request(app).post('/convert');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 400 when a non-docx file is sent', async () => {
    const res = await request(app)
      .post('/convert')
      .attach('file', Buffer.from('hello'), { filename: 'test.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 400 when the field name is wrong', async () => {
    const res = await request(app)
      .post('/convert')
      .attach('document', FAKE_DOCX_BYTES, {
        filename: 'test.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    // multer will not find "file" field → no req.file → 400
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /convert – file-size limit', () => {
  test('returns 413 when file exceeds maxFileSizeBytes', async () => {
    const maxFileSizeBytes = 100; // 100 bytes
    const app = createServer({ maxFileSizeBytes });

    const bigFile = Buffer.alloc(200, 0);
    const res = await request(app)
      .post('/convert')
      .attach('file', bigFile, {
        filename: 'big.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/too large/i);
  });
});

describe('POST /convert – successful conversion (corpus)', () => {
  test('converts a DOCX corpus file', async () => {
    const corpusFile = path.join(__dirname, '../corpus/simple.docx');
    expect(fs.existsSync(corpusFile)).toBe(true);

    const app = createServer();
    const res = await request(app)
      .post('/convert')
      .attach('file', fs.readFileSync(corpusFile), {
        filename: 'simple.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('markdown');
    expect(typeof res.body.markdown).toBe('string');
    expect(res.body).toHaveProperty('assets');
    expect(Array.isArray(res.body.assets)).toBe(true);
    expect(res.body).toHaveProperty('warnings');
    expect(Array.isArray(res.body.warnings)).toBe(true);
  });

  test('temp docx upload file is cleaned up after request', async () => {
    const corpusFile = path.join(__dirname, '../corpus/simple.docx');
    expect(fs.existsSync(corpusFile)).toBe(true);

    // Track multer's tmp upload directory before the request
    const tmpBefore = new Set(fs.readdirSync(os.tmpdir()));

    const app = createServer();
    await request(app)
      .post('/convert')
      .attach('file', fs.readFileSync(corpusFile), {
        filename: 'simple.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

    // After the request the uploaded tmp file should have been removed
    const uploadedFiles = fs
      .readdirSync(os.tmpdir())
      .filter((f) => !tmpBefore.has(f) && !f.startsWith('docx-to-md-'));
    expect(uploadedFiles).toHaveLength(0);
  });
});

describe('POST /convert – timeout', () => {
  test('returns 504 when conversion exceeds timeoutMs', async () => {
    // Create a server with a very short timeout
    const app = createServer({ timeoutMs: 1 });

    const corpusFile = path.join(__dirname, '../corpus/simple.docx');
    expect(fs.existsSync(corpusFile)).toBe(true);

    const res = await request(app)
      .post('/convert')
      .attach('file', fs.readFileSync(corpusFile), {
        filename: 'simple.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

    expect(res.status).toBe(504);
    expect(res.body.error).toMatch(/timed out/i);
  }, 10_000);
});

describe('mimeForExt', () => {
  test.each([
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['gif', 'image/gif'],
    ['svg', 'image/svg+xml'],
    ['webp', 'image/webp'],
    ['bin', 'application/octet-stream'],
    ['', 'application/octet-stream'],
  ])('ext %j → %s', (ext, expected) => {
    expect(mimeForExt(ext)).toBe(expected);
  });
});

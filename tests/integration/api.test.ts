import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { createApp } from '../../src/api/server';

const MAMMOTH_TEST_DATA = path.resolve(
  __dirname,
  '../../node_modules/mammoth/test/test-data'
);
const SIMPLE_DOCX = path.join(MAMMOTH_TEST_DATA, 'single-paragraph.docx');
const IMAGE_DOCX = path.join(MAMMOTH_TEST_DATA, 'tiny-picture.docx');

describe('API server', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll((done) => {
    const app = createApp();
    server = app.listen(0, () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://localhost:${addr.port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  // ── helpers ──────────────────────────────────────────────────────────────

  /** POST /api/convert with a real .docx file via multipart form */
  function postConvert(filePath: string): Promise<{ status: number; body: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      const fileData = fs.readFileSync(filePath);
      const boundary = '----TestBoundary' + Date.now();
      const filename = path.basename(filePath);

      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`
        ),
        fileData,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const options: http.RequestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      };

      const url = new URL(`${baseUrl}/api/convert`);
      const req = http.request(url, options, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
          } catch {
            reject(new Error(`Non-JSON response: ${raw}`));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  function get(urlPath: string): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${urlPath}`, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
            headers: res.headers as Record<string, string | string[] | undefined>,
          });
        });
      }).on('error', reject);
    });
  }

  // ── tests ─────────────────────────────────────────────────────────────────

  test('GET /api/health returns ok', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
  });

  test('GET / serves the web UI', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.body).toContain('docx');
  });

  test('POST /api/convert returns markdown for a simple docx', async () => {
    const res = await postConvert(SIMPLE_DOCX);
    expect(res.status).toBe(200);
    expect(typeof res.body['sessionId']).toBe('string');
    expect(typeof res.body['markdown']).toBe('string');
    expect((res.body['markdown'] as string).length).toBeGreaterThan(0);
    expect(Array.isArray(res.body['warnings'])).toBe(true);
    expect(Array.isArray(res.body['images'])).toBe(true);
  });

  test('POST /api/convert extracts images from a picture docx', async () => {
    const res = await postConvert(IMAGE_DOCX);
    expect(res.status).toBe(200);
    const images = res.body['images'] as Array<{ name: string; url: string }>;
    expect(images.length).toBeGreaterThan(0);
    expect(images[0]).toHaveProperty('name');
    expect(images[0]).toHaveProperty('url');
  });

  test('GET /api/download/markdown/:sessionId serves .md file', async () => {
    const convert = await postConvert(SIMPLE_DOCX);
    const sessionId = convert.body['sessionId'] as string;
    const res = await get(`/api/download/markdown/${sessionId}`);
    expect(res.status).toBe(200);
    const disposition = res.headers['content-disposition'] as string;
    expect(disposition).toContain('converted.md');
  });

  test('GET /api/images/:sessionId/:filename serves an image', async () => {
    const convert = await postConvert(IMAGE_DOCX);
    const sessionId = convert.body['sessionId'] as string;
    const images = convert.body['images'] as Array<{ name: string; url: string }>;
    const img = images[0];
    const res = await get(`/api/images/${sessionId}/${img.name}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\//);
  });



  test('GET /api/images rejects traversal-like filenames', async () => {
    const convert = await postConvert(IMAGE_DOCX);
    const sessionId = convert.body['sessionId'] as string;
    const res = await get(`/api/images/${sessionId}/..%2F..%2Fetc%2Fpasswd`);
    expect(res.status).toBe(400);
  });

  test('GET /api/images returns 404 for sanitized-but-missing filename', async () => {
    const convert = await postConvert(IMAGE_DOCX);
    const sessionId = convert.body['sessionId'] as string;
    const res = await get(`/api/images/${sessionId}/missing image?.png`);
    expect(res.status).toBe(404);
  });

  test('GET /api/download/images/:sessionId returns a zip', async () => {
    const convert = await postConvert(IMAGE_DOCX);
    const sessionId = convert.body['sessionId'] as string;
    const res = await get(`/api/download/images/${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
  });

  test('GET /api/download/markdown with unknown sessionId returns 404', async () => {
    const res = await get('/api/download/markdown/nonexistent-session-id');
    expect(res.status).toBe(404);
  });

  test('POST /api/convert with no file returns 400', async () => {
    const res = await new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      const options: http.RequestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': 2 },
      };
      const req = http.request(new URL(`${baseUrl}/api/convert`), options, (response) => {
        let raw = '';
        response.on('data', (chunk) => (raw += chunk));
        response.on('end', () => {
          resolve({ status: response.statusCode ?? 0, body: JSON.parse(raw) });
        });
      });
      req.on('error', reject);
      req.write('{}');
      req.end();
    });
    expect(res.status).toBe(400);
    expect(typeof res.body['error']).toBe('string');
  });
});

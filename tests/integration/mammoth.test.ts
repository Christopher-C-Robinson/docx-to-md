import { MammothAdapter } from '../../src/core/engines/mammoth/adapter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Mammoth Integration', () => {
  let adapter: MammothAdapter;
  let tmpDir: string;

  beforeAll(() => {
    adapter = new MammothAdapter();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx2md-mammoth-'));
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('isAvailable returns true (mammoth is installed)', async () => {
    const available = await adapter.isAvailable();
    expect(available).toBe(true);
  });

  test('adapter name is mammoth', () => {
    expect(adapter.name).toBe('mammoth');
  });

  test('converts a DOCX corpus file if available', async () => {
    const corpusFile = path.join(__dirname, '../corpus/simple.docx');
    if (!fs.existsSync(corpusFile)) {
      console.warn('No corpus DOCX found, skipping conversion test');
      return;
    }

    const outputPath = path.join(tmpDir, 'output.md');
    const result = await adapter.convert(corpusFile, outputPath, { format: 'gfm' });

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(result.markdown.length).toBeGreaterThan(0);
  });
});

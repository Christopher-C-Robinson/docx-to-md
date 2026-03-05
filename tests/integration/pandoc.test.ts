import { PandocAdapter } from '../../src/core/engines/pandoc/adapter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Pandoc Integration', () => {
  let adapter: PandocAdapter;
  let pandocAvailable: boolean;
  let tmpDir: string;

  beforeAll(async () => {
    adapter = new PandocAdapter();
    pandocAvailable = await adapter.isAvailable();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx2md-test-'));
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('isAvailable returns a boolean', async () => {
    expect(typeof pandocAvailable).toBe('boolean');
  });

  test('adapter name is pandoc', () => {
    expect(adapter.name).toBe('pandoc');
  });

  (pandocAvailable ? test : test.skip)('converts a DOCX corpus file', async () => {
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

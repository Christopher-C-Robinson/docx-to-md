import { MammothAdapter } from '../../src/core/engines/mammoth/adapter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CORPUS_DIR = path.join(__dirname);

/**
 * Corpus regression tests – convert each *.docx fixture and compare the output
 * against the corresponding golden *.md file stored alongside it.
 *
 * To update a golden file after an intentional output change, delete the .md
 * file and re-run the tests with UPDATE_GOLDEN=1:
 *   UPDATE_GOLDEN=1 npx jest tests/corpus
 */
describe('Corpus regression', () => {
  let adapter: MammothAdapter;
  let tmpDir: string;

  beforeAll(() => {
    adapter = new MammothAdapter();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx2md-corpus-'));
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  const docxFiles = fs
    .readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith('.docx'));

  test('corpus directory contains at least one DOCX fixture', () => {
    expect(docxFiles.length).toBeGreaterThan(0);
  });

  describe.each(docxFiles)('%s', (docxFile) => {
    const inputPath = path.join(CORPUS_DIR, docxFile);
    const goldenPath = path.join(CORPUS_DIR, docxFile.replace(/\.docx$/, '.md'));

    test('converts without error', async () => {
      const outputPath = path.join(tmpDir, docxFile.replace(/\.docx$/, '.md'));
      const result = await adapter.convert(inputPath, outputPath, { format: 'gfm' });
      expect(result.markdown.length).toBeGreaterThan(0);
      expect(fs.existsSync(outputPath)).toBe(true);
    });

    if (fs.existsSync(goldenPath)) {
      test('output matches golden file', async () => {
        const outputPath = path.join(tmpDir, `golden-${docxFile.replace(/\.docx$/, '.md')}`);
        const result = await adapter.convert(inputPath, outputPath, { format: 'gfm' });
        const golden = fs.readFileSync(goldenPath, 'utf8');

        if (process.env['UPDATE_GOLDEN'] === '1') {
          fs.writeFileSync(goldenPath, result.markdown, 'utf8');
          return;
        }

        expect(result.markdown).toBe(golden);
      });
    }
  });
});

describe('example.docx feature coverage', () => {
  let adapter: MammothAdapter;
  let tmpDir: string;
  let markdown: string;

  beforeAll(async () => {
    adapter = new MammothAdapter();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx2md-example-'));
    const inputPath = path.join(CORPUS_DIR, 'example.docx');
    const outputPath = path.join(tmpDir, 'example.md');
    const result = await adapter.convert(inputPath, outputPath, { format: 'gfm' });
    markdown = result.markdown;
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('headings are converted (H1–H4)', () => {
    expect(markdown).toContain('# Document Title');
    expect(markdown).toContain('## Section One');
    expect(markdown).toContain('### Subsection 1.1');
    expect(markdown).toContain('#### Subsection 1.1.1');
  });

  test('unordered list items are present', () => {
    expect(markdown).toMatch(/^-\s+First item/m);
    expect(markdown).toMatch(/^-\s+Second item/m);
    expect(markdown).toMatch(/^-\s+Third item/m);
  });

  test('nested list items are present', () => {
    expect(markdown).toContain('Nested item A');
    expect(markdown).toContain('Nested item B');
  });

  test('ordered list items are present', () => {
    expect(markdown).toMatch(/\d+\.\s+Step one/);
    expect(markdown).toMatch(/\d+\.\s+Step two/);
    expect(markdown).toMatch(/\d+\.\s+Step three/);
  });

  test('table data is present', () => {
    expect(markdown).toContain('Name');
    expect(markdown).toContain('Language');
    expect(markdown).toContain('Alice');
    expect(markdown).toContain('TypeScript');
    expect(markdown).toContain('Bob');
    expect(markdown).toContain('Python');
  });

  test('image is embedded as data URI', () => {
    expect(markdown).toMatch(/!\[.*?\]\(data:image\/png;base64,/);
  });

  test('footnote references are converted', () => {
    // Turndown escapes square brackets, producing \[1\] in the markdown output
    expect(markdown).toMatch(/\\\[(\d+)\\\]/);
  });

  test('footnote content is present', () => {
    expect(markdown).toContain('This is footnote number one.');
  });

  test('tracked changes – inserted text is accepted', () => {
    expect(markdown).toContain('Inserted content.');
  });

  test('unicode characters are preserved', () => {
    expect(markdown).toContain('αβγδ');
    expect(markdown).toContain('مرحبا');
    expect(markdown).toContain('日本語');
    expect(markdown).toContain('🎉🚀');
    expect(markdown).toContain('café résumé naïve');
  });
});

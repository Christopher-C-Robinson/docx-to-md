import { extractMedia } from '../../src/core/assets/extractMedia';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Minimal in-memory ZIP builder (stored/uncompressed entries only).
// Used to create synthetic DOCX-like archives for testing without external
// dependencies.
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  data: Buffer;
}

function buildZip(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralDirs: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const dataLen = entry.data.length;

    // Local file header (30 bytes fixed + filename)
    const localHeader = Buffer.alloc(30 + nameBytes.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4);          // version needed
    localHeader.writeUInt16LE(0, 6);           // flags
    localHeader.writeUInt16LE(0, 8);           // compression: stored
    localHeader.writeUInt16LE(0, 10);          // mod time
    localHeader.writeUInt16LE(0, 12);          // mod date
    localHeader.writeUInt32LE(0, 14);          // CRC-32
    localHeader.writeUInt32LE(dataLen, 18);    // compressed size
    localHeader.writeUInt32LE(dataLen, 22);    // uncompressed size
    localHeader.writeUInt16LE(nameBytes.length, 26); // filename length
    localHeader.writeUInt16LE(0, 28);          // extra field length
    nameBytes.copy(localHeader, 30);

    // Central directory entry (46 bytes fixed + filename)
    const cdEntry = Buffer.alloc(46 + nameBytes.length);
    cdEntry.writeUInt32LE(0x02014b50, 0); // signature
    cdEntry.writeUInt16LE(20, 4);          // version made by
    cdEntry.writeUInt16LE(20, 6);          // version needed
    cdEntry.writeUInt16LE(0, 8);           // flags
    cdEntry.writeUInt16LE(0, 10);          // compression: stored
    cdEntry.writeUInt16LE(0, 12);          // mod time
    cdEntry.writeUInt16LE(0, 14);          // mod date
    cdEntry.writeUInt32LE(0, 16);          // CRC-32
    cdEntry.writeUInt32LE(dataLen, 20);    // compressed size
    cdEntry.writeUInt32LE(dataLen, 24);    // uncompressed size
    cdEntry.writeUInt16LE(nameBytes.length, 28); // filename length
    cdEntry.writeUInt16LE(0, 30);          // extra field length
    cdEntry.writeUInt16LE(0, 32);          // comment length
    cdEntry.writeUInt16LE(0, 34);          // disk start
    cdEntry.writeUInt16LE(0, 36);          // internal attrs
    cdEntry.writeUInt32LE(0, 38);          // external attrs
    cdEntry.writeUInt32LE(offset, 42);     // local header offset
    nameBytes.copy(cdEntry, 46);

    localHeaders.push(localHeader, entry.data);
    centralDirs.push(cdEntry);
    offset += localHeader.length + dataLen;
  }

  const centralDir = Buffer.concat(centralDirs);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);            // signature
  eocd.writeUInt16LE(0, 4);                      // disk number
  eocd.writeUInt16LE(0, 6);                      // disk with CD start
  eocd.writeUInt16LE(entries.length, 8);         // entries on this disk
  eocd.writeUInt16LE(entries.length, 10);        // total entries
  eocd.writeUInt32LE(centralDir.length, 12);     // CD size
  eocd.writeUInt32LE(offset, 16);                // CD offset
  eocd.writeUInt16LE(0, 20);                     // comment length

  return Buffer.concat([...localHeaders, centralDir, eocd]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractMedia', () => {
  let tmpDir: string;
  let fakeDOCX: string;
  let mediaDir: string;

  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
  const JPG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic bytes

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx2md-em-test-'));
    fakeDOCX = path.join(tmpDir, 'test.docx');
    mediaDir = path.join(tmpDir, 'media');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('extracts a single media file', () => {
    const zip = buildZip([
      { name: 'word/media/image1.png', data: PNG_MAGIC },
    ]);
    fs.writeFileSync(fakeDOCX, zip);

    const result = extractMedia(fakeDOCX, mediaDir);

    expect(result.warnings).toHaveLength(0);
    expect(result.assets).toHaveLength(1);
    expect(path.basename(result.assets[0])).toBe('image1.png');
    expect(fs.readFileSync(result.assets[0])).toEqual(PNG_MAGIC);
  });

  test('extracts multiple media files', () => {
    const zip = buildZip([
      { name: 'word/media/image1.png', data: PNG_MAGIC },
      { name: 'word/media/image2.jpg', data: JPG_MAGIC },
    ]);
    fs.writeFileSync(fakeDOCX, zip);

    const result = extractMedia(fakeDOCX, mediaDir);

    expect(result.warnings).toHaveLength(0);
    expect(result.assets).toHaveLength(2);
    const basenames = result.assets.map(p => path.basename(p)).sort();
    expect(basenames).toEqual(['image1.png', 'image2.jpg']);
  });

  test('ignores non-media ZIP entries', () => {
    const zip = buildZip([
      { name: 'word/document.xml', data: Buffer.from('<xml/>') },
      { name: '[Content_Types].xml', data: Buffer.from('<types/>') },
      { name: 'word/media/image1.png', data: PNG_MAGIC },
    ]);
    fs.writeFileSync(fakeDOCX, zip);

    const result = extractMedia(fakeDOCX, mediaDir);

    expect(result.assets).toHaveLength(1);
    expect(path.basename(result.assets[0])).toBe('image1.png');
  });

  test('ignores directory entries (trailing slash)', () => {
    const zip = buildZip([
      { name: 'word/media/', data: Buffer.alloc(0) },
      { name: 'word/media/image1.png', data: PNG_MAGIC },
    ]);
    fs.writeFileSync(fakeDOCX, zip);

    const result = extractMedia(fakeDOCX, mediaDir);

    expect(result.assets).toHaveLength(1);
    expect(path.basename(result.assets[0])).toBe('image1.png');
  });

  test('sanitizes filenames with special characters', () => {
    const zip = buildZip([
      { name: 'word/media/my file (1).png', data: PNG_MAGIC },
    ]);
    fs.writeFileSync(fakeDOCX, zip);

    const result = extractMedia(fakeDOCX, mediaDir);

    expect(result.warnings).toHaveLength(0);
    expect(result.assets).toHaveLength(1);
    // Special characters replaced by underscores
    expect(path.basename(result.assets[0])).toBe('my_file__1_.png');
  });

  test('strips path traversal sequences (zip-slip prevention)', () => {
    const zip = buildZip([
      { name: 'word/media/../../etc/passwd', data: Buffer.from('secret') },
    ]);
    fs.writeFileSync(fakeDOCX, zip);

    const result = extractMedia(fakeDOCX, mediaDir);

    // No warnings — the traversal is stripped and "passwd" lands inside mediaDir
    expect(result.warnings).toHaveLength(0);
    expect(result.assets).toHaveLength(1);

    // The resulting path must stay inside the media directory
    const relative = path.relative(mediaDir, result.assets[0]);
    expect(relative.startsWith('..')).toBe(false);
    expect(path.basename(result.assets[0])).toBe('passwd');
  });

  test('creates mediaDir if it does not exist', () => {
    const nestedMedia = path.join(tmpDir, 'a', 'b', 'media');
    const zip = buildZip([
      { name: 'word/media/image1.png', data: PNG_MAGIC },
    ]);
    fs.writeFileSync(fakeDOCX, zip);

    expect(fs.existsSync(nestedMedia)).toBe(false);
    extractMedia(fakeDOCX, nestedMedia);
    expect(fs.existsSync(nestedMedia)).toBe(true);
  });

  test('returns empty assets for DOCX with no media', () => {
    const zip = buildZip([
      { name: 'word/document.xml', data: Buffer.from('<xml/>') },
    ]);
    fs.writeFileSync(fakeDOCX, zip);

    const result = extractMedia(fakeDOCX, mediaDir);

    expect(result.assets).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('throws on a file that is not a valid ZIP', () => {
    fs.writeFileSync(fakeDOCX, Buffer.from('not a zip file'));

    expect(() => extractMedia(fakeDOCX, mediaDir)).toThrow(/Failed to read DOCX/);
  });

  test('all extracted assets reside inside mediaDir', () => {
    const zip = buildZip([
      { name: 'word/media/image1.png', data: PNG_MAGIC },
      { name: 'word/media/sub/image2.jpg', data: JPG_MAGIC },
      { name: 'word/media/../../evil.txt', data: Buffer.from('evil') },
    ]);
    fs.writeFileSync(fakeDOCX, zip);

    const result = extractMedia(fakeDOCX, mediaDir);
    const resolvedMediaDir = path.resolve(mediaDir);

    for (const asset of result.assets) {
      expect(asset.startsWith(resolvedMediaDir + path.sep)).toBe(true);
    }
  });
});

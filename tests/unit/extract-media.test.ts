import { extractMedia } from '../../src/core/assets/extractMedia';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';

// ---------------------------------------------------------------------------
// Minimal in-memory ZIP builder (stored/uncompressed entries only).
// Used to create synthetic DOCX-like archives for testing without external
// dependencies.
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  data: Buffer;
  compressionMethod?: 0 | 8;
  useDataDescriptor?: boolean;
}

function buildZip(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralDirs: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const compressionMethod = entry.compressionMethod ?? 0;
    const compressedData = compressionMethod === 8 ? zlib.deflateRawSync(entry.data) : entry.data;
    const compressedLen = compressedData.length;
    const uncompressedLen = entry.data.length;
    const useDataDescriptor = entry.useDataDescriptor ?? false;
    const flags = useDataDescriptor ? 0x0008 : 0;

    // Local file header (30 bytes fixed + filename)
    const localHeader = Buffer.alloc(30 + nameBytes.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4);          // version needed
    localHeader.writeUInt16LE(flags, 6);       // flags
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt16LE(0, 10);          // mod time
    localHeader.writeUInt16LE(0, 12);          // mod date
    localHeader.writeUInt32LE(0, 14);          // CRC-32
    localHeader.writeUInt32LE(useDataDescriptor ? 0 : compressedLen, 18);
    localHeader.writeUInt32LE(useDataDescriptor ? 0 : uncompressedLen, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26); // filename length
    localHeader.writeUInt16LE(0, 28);          // extra field length
    nameBytes.copy(localHeader, 30);

    const descriptor = useDataDescriptor
      ? (() => {
          const dd = Buffer.alloc(16);
          dd.writeUInt32LE(0x08074b50, 0);      // descriptor signature
          dd.writeUInt32LE(0, 4);               // CRC-32
          dd.writeUInt32LE(compressedLen, 8);
          dd.writeUInt32LE(uncompressedLen, 12);
          return dd;
        })()
      : undefined;

    // Central directory entry (46 bytes fixed + filename)
    const cdEntry = Buffer.alloc(46 + nameBytes.length);
    cdEntry.writeUInt32LE(0x02014b50, 0); // signature
    cdEntry.writeUInt16LE(20, 4);          // version made by
    cdEntry.writeUInt16LE(20, 6);          // version needed
    cdEntry.writeUInt16LE(flags, 8);       // flags
    cdEntry.writeUInt16LE(compressionMethod, 10);
    cdEntry.writeUInt16LE(0, 12);          // mod time
    cdEntry.writeUInt16LE(0, 14);          // mod date
    cdEntry.writeUInt32LE(0, 16);          // CRC-32
    cdEntry.writeUInt32LE(compressedLen, 20);
    cdEntry.writeUInt32LE(uncompressedLen, 24);
    cdEntry.writeUInt16LE(nameBytes.length, 28); // filename length
    cdEntry.writeUInt16LE(0, 30);          // extra field length
    cdEntry.writeUInt16LE(0, 32);          // comment length
    cdEntry.writeUInt16LE(0, 34);          // disk start
    cdEntry.writeUInt16LE(0, 36);          // internal attrs
    cdEntry.writeUInt32LE(0, 38);          // external attrs
    cdEntry.writeUInt32LE(offset, 42);     // local header offset
    nameBytes.copy(cdEntry, 46);

    localHeaders.push(localHeader, compressedData);
    if (descriptor) {
      localHeaders.push(descriptor);
    }
    centralDirs.push(cdEntry);
    offset += localHeader.length + compressedLen + (descriptor?.length ?? 0);
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

  test('accepts extensionless temp DOCX filenames', () => {
    const extensionlessDocx = path.join(tmpDir, 'uploadtmp');
    const zip = buildZip([
      { name: 'word/media/image1.png', data: PNG_MAGIC },
    ]);
    fs.writeFileSync(extensionlessDocx, zip);

    const result = extractMedia(extensionlessDocx, mediaDir);

    expect(result.warnings).toHaveLength(0);
    expect(result.assets).toHaveLength(1);
    expect(path.basename(result.assets[0])).toBe('image1.png');
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

  test('throws when central directory signature is malformed', () => {
    const zip = buildZip([{ name: 'word/media/image1.png', data: PNG_MAGIC }]);
    const corrupted = Buffer.from(zip);
    const centralDirOffset = corrupted.readUInt32LE(corrupted.length - 6);
    corrupted.writeUInt32LE(0x01020304, centralDirOffset);
    fs.writeFileSync(fakeDOCX, corrupted);

    expect(() => extractMedia(fakeDOCX, mediaDir)).toThrow(/Malformed ZIP central directory/);
  });

  test('adds warning when entry payload is truncated', () => {
    const zip = buildZip([{ name: 'word/media/image1.png', data: PNG_MAGIC }]);
    const corrupted = Buffer.from(zip);
    const centralDirOffset = corrupted.readUInt32LE(corrupted.length - 6);
    // Inflate compressed size beyond available data to force bounds failure.
    corrupted.writeUInt32LE(999999, centralDirOffset + 20);
    fs.writeFileSync(fakeDOCX, corrupted);

    const result = extractMedia(fakeDOCX, mediaDir);
    expect(result.assets).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('compressed data out of bounds'))).toBe(true);
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

  test('extracts DEFLATE-compressed media entries', () => {
    const zip = buildZip([
      { name: 'word/media/image1.png', data: Buffer.concat([PNG_MAGIC, Buffer.from('compressed')]), compressionMethod: 8 },
    ]);
    fs.writeFileSync(fakeDOCX, zip);

    const result = extractMedia(fakeDOCX, mediaDir);
    expect(result.warnings).toHaveLength(0);
    expect(result.assets).toHaveLength(1);
    expect(fs.readFileSync(result.assets[0])).toEqual(Buffer.concat([PNG_MAGIC, Buffer.from('compressed')]));
  });

  test('extracts entries when local header uses data descriptor sizes', () => {
    const payload = Buffer.concat([JPG_MAGIC, Buffer.from('descriptor')]);
    const zip = buildZip([
      { name: 'word/media/image2.jpg', data: payload, compressionMethod: 8, useDataDescriptor: true },
    ]);
    fs.writeFileSync(fakeDOCX, zip);

    const result = extractMedia(fakeDOCX, mediaDir);
    expect(result.warnings).toHaveLength(0);
    expect(result.assets).toHaveLength(1);
    expect(path.basename(result.assets[0])).toBe('image2.jpg');
    expect(fs.readFileSync(result.assets[0])).toEqual(payload);
  });

  test('disambiguates filename collisions after sanitization', () => {
    const zip = buildZip([
      { name: 'word/media/image1.png', data: PNG_MAGIC },
      { name: 'word/media/sub/image1.png', data: JPG_MAGIC },
    ]);
    fs.writeFileSync(fakeDOCX, zip);

    const result = extractMedia(fakeDOCX, mediaDir);

    expect(result.assets).toHaveLength(2);
    const basenames = result.assets.map(p => path.basename(p)).sort();
    expect(basenames).toEqual(['image1.png', 'image1_1.png']);
    expect(result.warnings.some(w => w.includes('Filename collision'))).toBe(true);
  });
});

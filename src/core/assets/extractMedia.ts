import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { sanitizeMediaPath } from './manager';

// ZIP format signatures
const LOCAL_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;

// Compression methods
const COMPRESSION_STORED = 0;
const COMPRESSION_DEFLATE = 8;

// DOCX media path prefix inside the ZIP archive
const WORD_MEDIA_PREFIX = 'word/media/';

interface CentralDirEntry {
  filename: string;
  localHeaderOffset: number;
  /** Size of compressed data (from central directory — always authoritative). */
  compressedSize: number;
  compressionMethod: number;
}

export interface MediaExtractionResult {
  /** Absolute paths of files written to disk. */
  assets: string[];
  /** Non-fatal issues encountered during extraction. */
  warnings: string[];
  /**
   * Maps base64-encoded file content to the absolute path of the extracted
   * file.  Populated during extraction so callers (e.g. the mammoth adapter)
   * can match image data without reading files back from disk.
   */
  contentMap: Map<string, string>;
}

/**
 * Locate the End of Central Directory record in a ZIP buffer.
 * Searches backward from the end to handle an optional ZIP comment
 * (max 65535 bytes).
 */
function findEndOfCentralDir(buf: Buffer): number {
  const minOffset = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === END_OF_CENTRAL_DIR_SIG) {
      return i;
    }
  }
  throw new Error('Not a valid ZIP/DOCX file: End of Central Directory signature not found');
}

/**
 * Parse the ZIP central directory and return only entries whose paths start
 * with "word/media/" (i.e., embedded media files in the DOCX).
 */
function parseMediaEntries(buf: Buffer): CentralDirEntry[] {
  const eocdOffset = findEndOfCentralDir(buf);
  const centralDirSize = buf.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries: CentralDirEntry[] = [];
  let pos = centralDirOffset;
  const end = centralDirOffset + centralDirSize;

  if (centralDirOffset < 0 || centralDirOffset > buf.length || end < centralDirOffset || end > buf.length) {
    throw new Error('Malformed ZIP central directory: out-of-bounds offset/size');
  }

  while (pos + 46 <= end) {
    const sig = buf.readUInt32LE(pos);
    if (sig !== CENTRAL_DIR_SIG) {
      throw new Error(
        `Malformed ZIP central directory: expected signature 0x${CENTRAL_DIR_SIG.toString(16)} at offset ${pos}, found 0x${sig.toString(16)}`,
      );
    }

    const compressionMethod = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const filenameLength = buf.readUInt16LE(pos + 28);
    const extraFieldLength = buf.readUInt16LE(pos + 30);
    const commentLength = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);

    const filename = buf.toString('utf8', pos + 46, pos + 46 + filenameLength);

    // Only collect media entries; skip directory markers (trailing slash)
    if (filename.startsWith(WORD_MEDIA_PREFIX) && !filename.endsWith('/')) {
      entries.push({ filename, localHeaderOffset, compressedSize, compressionMethod });
    }

    pos += 46 + filenameLength + extraFieldLength + commentLength;
  }

  return entries;
}

/**
 * Decompress a single ZIP entry's data using the sizes from the central
 * directory (which are always authoritative, even when a data descriptor is
 * present in the local header).
 */
function decompressEntry(buf: Buffer, entry: CentralDirEntry): Buffer {
  if (buf.readUInt32LE(entry.localHeaderOffset) !== LOCAL_HEADER_SIG) {
    throw new Error(`Invalid local file header signature for "${entry.filename}"`);
  }

  // Use the local header's own filename/extra lengths to locate the data start,
  // but rely on the central directory's compressedSize for the slice.
  const localFilenameLen = buf.readUInt16LE(entry.localHeaderOffset + 26);
  const localExtraLen = buf.readUInt16LE(entry.localHeaderOffset + 28);
  const dataOffset = entry.localHeaderOffset + 30 + localFilenameLen + localExtraLen;
  const endOffset = dataOffset + entry.compressedSize;

  if (
    dataOffset < 0 ||
    dataOffset > buf.length ||
    endOffset < dataOffset ||
    endOffset > buf.length
  ) {
    throw new Error(
      `Truncated or corrupt ZIP entry "${entry.filename}": compressed data out of bounds`,
    );
  }

  const compressedData = buf.subarray(dataOffset, endOffset);

  if (entry.compressionMethod === COMPRESSION_STORED) {
    return compressedData;
  }

  if (entry.compressionMethod === COMPRESSION_DEFLATE) {
    return zlib.inflateRawSync(compressedData);
  }

  throw new Error(
    `Unsupported compression method ${entry.compressionMethod} in "${entry.filename}"`,
  );
}

/**
 * Extract all media files from a DOCX archive into `mediaDir`.
 *
 * Each file's path is sanitised via {@link sanitizeMediaPath} to prevent
 * zip-slip attacks and illegal characters.  Only files stored under
 * `word/media/` in the archive are extracted.
 *
 * @param docxPath - Absolute (or resolvable) path to the source `.docx` file.
 * @param mediaDir - Directory where media files will be written.
 *                   Created automatically if it does not exist.
 * @returns An object with `assets` (absolute paths of extracted files) and
 *          `warnings` (non-fatal issues, e.g. skipped entries).
 */
export function extractMedia(docxPath: string, mediaDir: string): MediaExtractionResult {
  const resolvedMediaDir = path.resolve(mediaDir);
  const warnings: string[] = [];
  const assets: string[] = [];
  const contentMap = new Map<string, string>();
  const usedDestinations = new Set<string>();

  fs.mkdirSync(resolvedMediaDir, { recursive: true });

  const buf = fs.readFileSync(docxPath);

  let entries: CentralDirEntry[];
  try {
    entries = parseMediaEntries(buf);
  } catch (err) {
    throw new Error(`Failed to read DOCX archive at "${docxPath}": ${(err as Error).message}`);
  }

  for (const entry of entries) {
    // Sanitize path: strips traversal sequences and illegal characters.
    let destPath: string;
    try {
      const desiredPath = sanitizeMediaPath(entry.filename, resolvedMediaDir);
      destPath = desiredPath;

      let suffix = 1;
      while (usedDestinations.has(destPath)) {
        const parsed = path.parse(desiredPath);
        destPath = path.join(parsed.dir, `${parsed.name}_${suffix}${parsed.ext}`);
        suffix += 1;
      }

      if (destPath !== desiredPath) {
        warnings.push(
          `Filename collision for "${entry.filename}" after sanitization; wrote as "${path.basename(destPath)}"`,
        );
      }
    } catch {
      warnings.push(`Skipping unsafe path in archive: "${entry.filename}"`);
      continue;
    }

    try {
      const data = decompressEntry(buf, entry);
      fs.writeFileSync(destPath, data);
      usedDestinations.add(destPath);
      assets.push(destPath);
      // Build content map while data is already in memory — no extra disk read.
      const key = data.toString('base64');
      if (!contentMap.has(key)) {
        contentMap.set(key, destPath);
      }
    } catch (err) {
      warnings.push(`Failed to extract "${entry.filename}": ${(err as Error).message}`);
    }
  }

  return { assets, warnings, contentMap };
}

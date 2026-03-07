import mammoth from 'mammoth';
import * as fs from 'fs';
import * as path from 'path';
import { MammothAdapter } from '../../src/core/engines/mammoth/adapter';
import { extractMedia } from '../../src/core/assets/extractMedia';

jest.mock('mammoth');
jest.mock('../../src/core/assets/extractMedia');

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  renameSync: jest.fn(),
  existsSync: jest.fn(() => false),
}));

const mockMammoth = mammoth as jest.Mocked<typeof mammoth>;
const mockExtractMedia = extractMedia as jest.MockedFunction<typeof extractMedia>;

// The inner image-processing function captured from mammoth.images.imgElement().
type ImageElementFn = (image: { read: (enc: string) => Promise<string>; contentType: string }) => Promise<{ src: string }>;

// Helper to create a fake image element.
function fakeImage(base64: string, contentType = 'image/png') {
  return { read: (_enc: string) => Promise.resolve(base64), contentType };
}

/** Installs a mock for mammoth.images.imgElement that captures the inner handler. */
function setupImgElementMock(): { getCaptured: () => ImageElementFn | undefined } {
  let capturedFn: ImageElementFn | undefined;
  (mockMammoth.images.imgElement as jest.Mock).mockImplementation((fn: ImageElementFn) => {
    capturedFn = fn;
    return fn;
  });
  return { getCaptured: () => capturedFn };
}

/** Installs a mock for mammoth.convertToHtml that drives the image handler with the given sequence. */
function setupConvertToHtmlMock(
  images: Array<{ base64: string; contentType?: string }>,
  getCaptured: () => ImageElementFn | undefined,
) {
  mockMammoth.convertToHtml.mockImplementation((async (_input: unknown, opts: unknown) => {
    const optsAny = opts as Record<string, unknown> | undefined;
    const capturedFn = getCaptured();
    if (capturedFn && optsAny?.convertImage) {
      for (const img of images) {
        await (optsAny.convertImage as (img: ReturnType<typeof fakeImage>) => Promise<{ src: string }>)(
          fakeImage(img.base64, img.contentType ?? 'image/png'),
        );
      }
    }
    return { value: '<p>Hello</p>', messages: [] };
  }) as never);
}

describe('MammothAdapter – deterministic image ordering', () => {
  let adapter: MammothAdapter;
  const mediaDir = '/fake/media';
  const resolvedMediaDir = path.resolve(mediaDir);
  const outputPath = '/fake/output.md';

  beforeEach(() => {
    adapter = new MammothAdapter();
    jest.clearAllMocks();
    const { existsSync } = require('fs') as jest.Mocked<typeof import('fs')>;
    (existsSync as jest.Mock).mockImplementation(() => false);
  });

  function imageWriteCalls() {
    const { writeFileSync } = require('fs') as jest.Mocked<typeof import('fs')>;
    return (writeFileSync as jest.Mock).mock.calls.filter(
      ([target, data]) =>
        typeof target === 'string' &&
        target.startsWith(`${resolvedMediaDir}${path.sep}`) &&
        Buffer.isBuffer(data),
    );
  }

  /**
   * Sets up the mocks so that mammoth.images.imgElement captures the handler,
   * then mammoth.convertToHtml calls it for each supplied fakeImages (in order).
   * Returns the ConversionResult from adapter.convert().
   */
  async function runWithImages(
    origPaths: Record<string, string>,
    imageSequence: Array<{ base64: string; contentType?: string }>,
  ) {
    const contentMap = new Map(
      Object.entries(origPaths).map(([b64, p]) => [b64, p]),
    );

    mockExtractMedia.mockReturnValue({
      assets: Object.values(origPaths),
      warnings: [],
      contentMap,
    });

    const { getCaptured } = setupImgElementMock();
    setupConvertToHtmlMock(imageSequence, getCaptured);

    return adapter.convert('/fake/input.docx', outputPath, { format: 'gfm', mediaDir });
  }

  test('writes three images to sequential filenames in document flow order', async () => {
    const origPaths: Record<string, string> = {
      aaa: path.join(resolvedMediaDir, 'image5.png'),
      bbb: path.join(resolvedMediaDir, 'image1.png'),
      ccc: path.join(resolvedMediaDir, 'image9.png'),
    };

    await runWithImages(origPaths, [
      { base64: 'aaa' },
      { base64: 'bbb' },
      { base64: 'ccc' },
    ]);

    const calls = imageWriteCalls();
    expect(calls[0]).toEqual([path.join(resolvedMediaDir, 'image-01.png'), expect.any(Buffer)]);
    expect(calls[1]).toEqual([path.join(resolvedMediaDir, 'image-02.png'), expect.any(Buffer)]);
    expect(calls[2]).toEqual([path.join(resolvedMediaDir, 'image-03.png'), expect.any(Buffer)]);
  });

  test('assets list reflects renamed paths, not original archive names', async () => {
    const origPaths: Record<string, string> = {
      aaa: path.join(resolvedMediaDir, 'image5.png'),
      bbb: path.join(resolvedMediaDir, 'image1.png'),
    };

    const result = await runWithImages(origPaths, [
      { base64: 'aaa' },
      { base64: 'bbb' },
    ]);

    expect(result.assets).toContain(path.join(resolvedMediaDir, 'image-01.png'));
    expect(result.assets).toContain(path.join(resolvedMediaDir, 'image-02.png'));
    expect(result.assets).not.toContain(path.join(resolvedMediaDir, 'image5.png'));
    expect(result.assets).not.toContain(path.join(resolvedMediaDir, 'image1.png'));
  });

  test('duplicate image (same base64) reuses the first sequential name', async () => {
    const origPaths: Record<string, string> = {
      aaa: path.join(resolvedMediaDir, 'image5.png'),
      bbb: path.join(resolvedMediaDir, 'image1.png'),
    };

    await runWithImages(origPaths, [
      { base64: 'aaa' }, // first occurrence  → image-01.png
      { base64: 'bbb' }, // first occurrence  → image-02.png
      { base64: 'aaa' }, // duplicate         → should still be image-01.png (no new write)
    ]);

    // image writes should only happen once per unique image
    expect(imageWriteCalls()).toHaveLength(2);
  });

  test('preserves file extension from the extracted filename', async () => {
    const origPaths: Record<string, string> = {
      jpg1: path.join(resolvedMediaDir, 'photo.jpg'),
    };

    await runWithImages(origPaths, [{ base64: 'jpg1', contentType: 'image/jpeg' }]);

    expect(imageWriteCalls()).toContainEqual([
      path.join(resolvedMediaDir, 'image-01.jpg'),
      expect.any(Buffer),
    ]);
  });


  test('skips write when source path already matches sequential destination', async () => {
    const origPaths: Record<string, string> = {
      aaa: path.join(resolvedMediaDir, 'image-01.png'),
    };

    const { existsSync } = require('fs') as jest.Mocked<typeof import('fs')>;
    (existsSync as jest.Mock).mockImplementation((candidate: fs.PathLike) =>
      String(candidate) === path.join(resolvedMediaDir, 'image-01.png'),
    );

    const result = await runWithImages(origPaths, [{ base64: 'aaa' }]);

    expect(imageWriteCalls()).toHaveLength(0);
    expect(result.assets).toContain(path.join(resolvedMediaDir, 'image-01.png'));
  });

  test('uses next free sequential filename when target already exists', async () => {
    const origPaths: Record<string, string> = {
      aaa: path.join(resolvedMediaDir, 'image5.png'),
      bbb: path.join(resolvedMediaDir, 'image6.png'),
    };

    const { existsSync } = require('fs') as jest.Mocked<typeof import('fs')>;
    (existsSync as jest.Mock).mockImplementation((candidate: fs.PathLike) =>
      String(candidate) === path.join(resolvedMediaDir, 'image-01.png'),
    );

    await runWithImages(origPaths, [{ base64: 'aaa' }, { base64: 'bbb' }]);

    const calls = imageWriteCalls();
    expect(calls[0]).toEqual([path.join(resolvedMediaDir, 'image-02.png'), expect.any(Buffer)]);
    expect(calls[1]).toEqual([path.join(resolvedMediaDir, 'image-03.png'), expect.any(Buffer)]);
  });


  test('skips unsafe contentMap path and falls back to sequential write', async () => {
    const unsafeMap = new Map<string, string>([
      ['aaa', '../..'],
    ]);
    mockExtractMedia.mockReturnValue({ assets: ['../..'], warnings: [], contentMap: unsafeMap });

    const { getCaptured } = setupImgElementMock();
    setupConvertToHtmlMock([{ base64: 'aaa', contentType: 'image/png' }], getCaptured);

    const result = await adapter.convert('/fake/input.docx', outputPath, { format: 'gfm', mediaDir });

    const { renameSync, writeFileSync } = require('fs') as jest.Mocked<typeof import('fs')>;
    expect(renameSync).not.toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalledWith(
      path.join(resolvedMediaDir, 'image-01.png'),
      expect.any(Buffer),
    );
    expect(result.warnings).toContain('Skipped unsafe media path from content map: ../..');
  });

  test('fallback OLE image uses sequential name and writes the file', async () => {
    // No entries in contentMap → every image triggers the fallback path.
    mockExtractMedia.mockReturnValue({ assets: [], warnings: [], contentMap: new Map() });

    const { getCaptured } = setupImgElementMock();
    setupConvertToHtmlMock(
      [{ base64: 'ole1', contentType: 'image/png' }, { base64: 'ole2', contentType: 'image/jpeg' }],
      getCaptured,
    );

    const result = await adapter.convert('/fake/input.docx', outputPath, { format: 'gfm', mediaDir });

    const { writeFileSync } = require('fs') as jest.Mocked<typeof import('fs')>;
    expect(writeFileSync).toHaveBeenCalledWith(
      path.join(resolvedMediaDir, 'image-01.png'),
      expect.any(Buffer),
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      path.join(resolvedMediaDir, 'image-02.jpeg'),
      expect.any(Buffer),
    );
    expect(result.assets).toContain(path.join(resolvedMediaDir, 'image-01.png'));
    expect(result.assets).toContain(path.join(resolvedMediaDir, 'image-02.jpeg'));
  });
});

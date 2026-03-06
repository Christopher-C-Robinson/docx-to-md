import * as fs from 'fs';
import { convertDocx, ConvertDocxOptions } from '../../src/core/convert';
import { resolveEngine } from '../../src/core/engines/registry';
import { ConversionResult } from '../../src/core/types';

jest.mock('../../src/core/engines/registry');

const mockResult: ConversionResult = {
  markdown: '# Hello',
  assets: [],
  warnings: [],
  metadata: {},
};

const mockEngine = {
  name: 'mammoth' as const,
  isAvailable: jest.fn().mockResolvedValue(true),
  convert: jest.fn().mockResolvedValue(mockResult),
};

(resolveEngine as jest.Mock).mockResolvedValue(mockEngine);

describe('convertDocx', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveEngine as jest.Mock).mockResolvedValue(mockEngine);
    mockEngine.convert.mockResolvedValue(mockResult);
  });

  test('calls resolveEngine with the specified engine', async () => {
    const opts: ConvertDocxOptions = {
      inputPath: '/input/file.docx',
      outputPath: '/output/file.md',
      engine: 'mammoth',
      format: 'gfm',
    };

    await convertDocx(opts);

    expect(resolveEngine).toHaveBeenCalledWith('mammoth');
  });

  test('calls engine.convert with correct paths and options', async () => {
    const opts: ConvertDocxOptions = {
      inputPath: '/input/file.docx',
      outputPath: '/output/file.md',
      format: 'gfm',
      mediaDir: '/media',
      trackChanges: 'accept',
      timeout: 5000,
      styleMap: [{ docxStyle: 'Heading 1', markdownOutput: '# {text}' }],
    };

    await convertDocx(opts);

    expect(mockEngine.convert).toHaveBeenCalledWith(
      '/input/file.docx',
      '/output/file.md',
      expect.objectContaining({
        engine: 'mammoth',
        format: 'gfm',
        mediaDir: '/media',
        trackChanges: 'accept',
        timeout: 5000,
        styleMap: [{ docxStyle: 'Heading 1', markdownOutput: '# {text}' }],
      })
    );
  });

  test('passes resolved engine name into conversion options when fallback occurs', async () => {
    (resolveEngine as jest.Mock).mockResolvedValueOnce(mockEngine);

    const opts: ConvertDocxOptions = {
      inputPath: '/input/file.docx',
      outputPath: '/output/file.md',
      engine: 'pandoc',
    };

    await convertDocx(opts);

    expect(mockEngine.convert).toHaveBeenCalledWith(
      '/input/file.docx',
      '/output/file.md',
      expect.objectContaining({ engine: 'mammoth' })
    );
  });

  test('defaults format to gfm when not specified', async () => {
    const opts: ConvertDocxOptions = {
      inputPath: '/input/file.docx',
      outputPath: '/output/file.md',
    };

    await convertDocx(opts);

    expect(mockEngine.convert).toHaveBeenCalledWith(
      '/input/file.docx',
      '/output/file.md',
      expect.objectContaining({ format: 'gfm' })
    );
  });


  test('sets a default mediaDir when inlineImages is enabled', async () => {
    const opts: ConvertDocxOptions = {
      inputPath: '/input/file.docx',
      outputPath: '/tmp/convert-inline-default/file.md',
      inlineImages: true,
    };

    fs.mkdirSync('/tmp/convert-inline-default', { recursive: true });
    await convertDocx(opts);

    expect(mockEngine.convert).toHaveBeenCalledWith(
      '/input/file.docx',
      '/tmp/convert-inline-default/file.md',
      expect.objectContaining({ mediaDir: '/tmp/convert-inline-default/media' })
    );
  });

  test('respects explicit mediaDir when inlineImages is enabled', async () => {
    const opts: ConvertDocxOptions = {
      inputPath: '/input/file.docx',
      outputPath: '/tmp/convert-inline-explicit/file.md',
      mediaDir: '/custom/media',
      inlineImages: true,
    };

    fs.mkdirSync('/tmp/convert-inline-explicit', { recursive: true });
    await convertDocx(opts);

    expect(mockEngine.convert).toHaveBeenCalledWith(
      '/input/file.docx',
      '/tmp/convert-inline-explicit/file.md',
      expect.objectContaining({ mediaDir: '/custom/media' })
    );
  });

  test('returns ConversionResult fields and engineName', async () => {
    const opts: ConvertDocxOptions = {
      inputPath: '/input/file.docx',
      outputPath: '/output/file.md',
    };

    const result = await convertDocx(opts);

    expect(result.markdown).toBe(mockResult.markdown);
    expect(result.assets).toBe(mockResult.assets);
    expect(result.warnings).toBe(mockResult.warnings);
    expect(result.metadata).toBe(mockResult.metadata);
    expect(result.engineName).toBe('mammoth');
  });

  test('propagates errors thrown by the engine', async () => {
    mockEngine.convert.mockRejectedValueOnce(new Error('engine failure'));

    const opts: ConvertDocxOptions = {
      inputPath: '/input/file.docx',
      outputPath: '/output/file.md',
    };

    await expect(convertDocx(opts)).rejects.toThrow('engine failure');
  });
});

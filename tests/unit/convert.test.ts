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
    };

    await convertDocx(opts);

    expect(mockEngine.convert).toHaveBeenCalledWith(
      '/input/file.docx',
      '/output/file.md',
      expect.objectContaining({
        format: 'gfm',
        mediaDir: '/media',
        trackChanges: 'accept',
        timeout: 5000,
      })
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

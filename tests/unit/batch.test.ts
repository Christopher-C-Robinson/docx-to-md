import * as os from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Mocks must be declared before importing the module under test so that
// jest.mock() hoisting picks them up.
// ---------------------------------------------------------------------------

const mockExistsSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockReaddirSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockCpus = jest.fn();

jest.mock('os', () => ({
  cpus: (...args: unknown[]) => mockCpus(...args),
}));

jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}));

const mockConvert = jest.fn();
const mockResolveEngine = jest.fn();
jest.mock('../../src/core/engines/registry', () => ({
  resolveEngine: (...args: unknown[]) => mockResolveEngine(...args),
}));

// Now import the module under test (after mocks are registered).
import { batchCommand } from '../../src/cli/commands/batch';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake fs.Dirent-like object */
function dirent(name: string, isDir: boolean) {
  return { name, isDirectory: () => isDir, isFile: () => !isDir };
}

/** Minimal engine stub */
function makeEngine() {
  mockConvert.mockResolvedValue({ warnings: [], assets: [], metadata: {}, markdown: '' });
  return { name: 'mammoth', convert: mockConvert };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('batch command', () => {
  const inputDir = '/fake/input';

  beforeEach(() => {
    jest.clearAllMocks();
    mockCpus.mockReturnValue(Array.from({ length: 4 }, () => ({} as os.CpuInfo)));
    jest.spyOn(process, 'exit').mockImplementation((_code?: string | number | null) => {
      throw new Error(`process.exit(${_code})`);
    });
    // Silence console output during tests
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('exits with error when input directory does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    await expect(batchCommand(inputDir, {})).rejects.toThrow('process.exit(1)');
  });

  test('reports no DOCX files found and returns early', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);
    mockResolveEngine.mockResolvedValue(makeEngine());

    await batchCommand(inputDir, { jobs: '2' });

    expect(mockConvert).not.toHaveBeenCalled();
  });

  test('converts DOCX files found in directory', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([dirent('doc1.docx', false), dirent('doc2.docx', false)]);
    mockResolveEngine.mockResolvedValue(makeEngine());

    await batchCommand(inputDir, { jobs: '2' });

    expect(mockConvert).toHaveBeenCalledTimes(2);
  });

  test('default concurrency equals number of CPU cores', async () => {
    mockExistsSync.mockReturnValue(true);

    // Create enough files to exceed the default concurrency so we can verify
    // no more than os.cpus().length tasks run simultaneously.
    const cpuCount = os.cpus().length;
    const fileCount = cpuCount + 2;
    const fakeFiles = Array.from({ length: fileCount }, (_, i) =>
      dirent(`doc${i}.docx`, false)
    );
    mockReaddirSync.mockReturnValue(fakeFiles);

    let maxConcurrent = 0;
    let currentConcurrent = 0;

    mockConvert.mockImplementation(async () => {
      currentConcurrent++;
      if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent;
      // Simulate async work
      await new Promise<void>((resolve) => setImmediate(resolve));
      currentConcurrent--;
      return { warnings: [], assets: [], metadata: {}, markdown: '' };
    });

    mockResolveEngine.mockResolvedValue({ name: 'mammoth', convert: mockConvert });

    // No --jobs flag → should default to os.cpus().length
    await batchCommand(inputDir, {});

    expect(mockConvert).toHaveBeenCalledTimes(fileCount);
    expect(maxConcurrent).toBeLessThanOrEqual(cpuCount);
  });

  test('exits with error when --jobs is not a positive integer', async () => {
    mockExistsSync.mockReturnValue(true);

    await expect(batchCommand(inputDir, { jobs: 'foo' })).rejects.toThrow('process.exit(1)');
    expect(mockResolveEngine).not.toHaveBeenCalled();
  });

  test('exits with error when detected CPU count is invalid', async () => {
    mockExistsSync.mockReturnValue(true);
    mockCpus.mockReturnValue([]);

    await expect(batchCommand(inputDir, {})).rejects.toThrow('process.exit(1)');
    expect(mockResolveEngine).not.toHaveBeenCalled();
  });

  test('respects custom --jobs concurrency limit', async () => {
    mockExistsSync.mockReturnValue(true);

    const jobs = 2;
    const fileCount = 6;
    const fakeFiles = Array.from({ length: fileCount }, (_, i) =>
      dirent(`doc${i}.docx`, false)
    );
    mockReaddirSync.mockReturnValue(fakeFiles);

    let maxConcurrent = 0;
    let currentConcurrent = 0;

    mockConvert.mockImplementation(async () => {
      currentConcurrent++;
      if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent;
      await new Promise<void>((resolve) => setImmediate(resolve));
      currentConcurrent--;
      return { warnings: [], assets: [], metadata: {}, markdown: '' };
    });

    mockResolveEngine.mockResolvedValue({ name: 'mammoth', convert: mockConvert });

    await batchCommand(inputDir, { jobs: String(jobs) });

    expect(mockConvert).toHaveBeenCalledTimes(fileCount);
    expect(maxConcurrent).toBeLessThanOrEqual(jobs);
  });


  test('sets a default per-file mediaDir when inlineImages is enabled', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([dirent('doc1.docx', false)]);
    mockResolveEngine.mockResolvedValue(makeEngine());

    await batchCommand(inputDir, { inlineImages: true, jobs: '1' });

    expect(mockConvert).toHaveBeenCalledWith(
      path.join(path.resolve(inputDir), 'doc1.docx'),
      path.join(path.resolve(inputDir), 'doc1.md'),
      expect.objectContaining({ mediaDir: path.join(path.resolve(inputDir), 'media') })
    );
  });

  test('uses shared mediaDir when provided with inlineImages', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([dirent('doc1.docx', false)]);
    mockResolveEngine.mockResolvedValue(makeEngine());

    await batchCommand(inputDir, { inlineImages: true, mediaDir: '/custom/media', jobs: '1' });

    expect(mockConvert).toHaveBeenCalledWith(
      path.join(path.resolve(inputDir), 'doc1.docx'),
      path.join(path.resolve(inputDir), 'doc1.md'),
      expect.objectContaining({ mediaDir: path.normalize('/custom/media') })
    );
  });

  test('exits with code 1 when one or more files fail to convert', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([dirent('bad.docx', false)]);

    mockConvert.mockRejectedValue(new Error('conversion failed'));
    mockResolveEngine.mockResolvedValue({ name: 'mammoth', convert: mockConvert });

    await expect(batchCommand(inputDir, { jobs: '1' })).rejects.toThrow('process.exit(1)');
  });

  test('preserves directory hierarchy in output paths', async () => {
    mockExistsSync.mockReturnValue(true);
    // top-level + one subdirectory with a file
    mockReaddirSync.mockImplementation((dir: string) => {
      if (dir === path.resolve(inputDir)) {
        return [dirent('sub', true), dirent('top.docx', false)];
      }
      return [dirent('nested.docx', false)];
    });

    mockResolveEngine.mockResolvedValue(makeEngine());

    const outDir = '/fake/output';
    await batchCommand(inputDir, { jobs: '2', out: outDir });

    const outputPaths: string[] = mockConvert.mock.calls.map(
      (call: unknown[]) => call[1] as string
    );

    expect(outputPaths).toEqual(
      expect.arrayContaining([
        path.join(outDir, 'top.md'),
        path.join(outDir, 'sub', 'nested.md'),
      ])
    );
  });
});

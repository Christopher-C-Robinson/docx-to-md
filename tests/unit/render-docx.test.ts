import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PandocAdapter } from '../../src/core/engines/pandoc/adapter';
import { renderDocx, RenderDocxOptions } from '../../src/core/convert';

// Mock child_process.spawn used by PandocAdapter
jest.mock('child_process', () => {
  const EventEmitter = require('events');

  function makeMockProcess(
    closeCode: number | null,
    stderrData?: string
  ): Record<string, unknown> {
    const proc = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.kill = jest.fn();

    // Emit events asynchronously so listeners can be attached first
    setImmediate(() => {
      if (stderrData) proc.stderr.emit('data', Buffer.from(stderrData));
      proc.emit('close', closeCode);
    });

    return proc;
  }

  return {
    spawn: jest.fn(() => makeMockProcess(0)),
    _makeMockProcess: makeMockProcess,
  };
});

const { spawn } = require('child_process');

describe('PandocAdapter.convertMarkdownToDocx', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-to-docx-test-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('calls pandoc with -f gfm -t docx args', async () => {
    const inputPath = path.join(tmpDir, 'input.md');
    const outputPath = path.join(tmpDir, 'output.docx');
    fs.writeFileSync(inputPath, '# Hello\n');

    const adapter = new PandocAdapter(null);
    await adapter.convertMarkdownToDocx(inputPath, outputPath);

    expect(spawn).toHaveBeenCalled();
    const spawnArgs: string[] = (spawn as jest.Mock).mock.calls[0][1] as string[];
    expect(spawnArgs).toContain('-f');
    expect(spawnArgs).toContain('gfm');
    expect(spawnArgs).toContain('-t');
    expect(spawnArgs).toContain('docx');
    expect(spawnArgs).toContain('-o');
    expect(spawnArgs).toContain(outputPath);
    expect(spawnArgs).toContain(inputPath);
  });

  test('includes --reference-doc flag when referenceDoc is provided', async () => {
    const inputPath = path.join(tmpDir, 'input.md');
    const outputPath = path.join(tmpDir, 'output.docx');
    const refDoc = path.join(tmpDir, 'template.docx');
    fs.writeFileSync(inputPath, '# Hello\n');
    fs.writeFileSync(refDoc, '');

    const adapter = new PandocAdapter(null);
    await adapter.convertMarkdownToDocx(inputPath, outputPath, { referenceDoc: refDoc });

    const spawnArgs: string[] = (spawn as jest.Mock).mock.calls[0][1] as string[];
    expect(spawnArgs.some((a) => a.startsWith('--reference-doc='))).toBe(true);
  });

  test('includes --toc flag when toc is true', async () => {
    const inputPath = path.join(tmpDir, 'input.md');
    const outputPath = path.join(tmpDir, 'output.docx');
    fs.writeFileSync(inputPath, '# Hello\n');

    const adapter = new PandocAdapter(null);
    await adapter.convertMarkdownToDocx(inputPath, outputPath, { toc: true });

    const spawnArgs: string[] = (spawn as jest.Mock).mock.calls[0][1] as string[];
    expect(spawnArgs).toContain('--toc');
  });

  test('includes --resource-path flag when resourcePath is provided', async () => {
    const inputPath = path.join(tmpDir, 'input.md');
    const outputPath = path.join(tmpDir, 'output.docx');
    fs.writeFileSync(inputPath, '# Hello\n');

    const adapter = new PandocAdapter(null);
    await adapter.convertMarkdownToDocx(inputPath, outputPath, { resourcePath: ['/some/path', '/other/path'] });

    const spawnArgs: string[] = (spawn as jest.Mock).mock.calls[0][1] as string[];
    expect(spawnArgs.some((a) => a.startsWith('--resource-path='))).toBe(true);
  });

  test('rejects paths with null bytes', async () => {
    const adapter = new PandocAdapter(null);
    await expect(
      adapter.convertMarkdownToDocx('/tmp/evil\x00.md', '/tmp/output.docx')
    ).rejects.toThrow();
  });

  test('rejects oversized input files', async () => {
    const inputPath = path.join(tmpDir, 'big.md');
    fs.writeFileSync(inputPath, 'x');

    const adapter = new PandocAdapter(null);
    await expect(
      adapter.convertMarkdownToDocx(inputPath, path.join(tmpDir, 'output.docx'), {
        maxFileSizeBytes: 0,
      })
    ).rejects.toThrow('size limit');
  });

  test('throws when pandoc exits with non-zero code', async () => {
    const { _makeMockProcess } = require('child_process');
    (spawn as jest.Mock).mockImplementationOnce(() => _makeMockProcess(1, 'pandoc: error'));

    const inputPath = path.join(tmpDir, 'input.md');
    fs.writeFileSync(inputPath, '# Hello\n');

    const adapter = new PandocAdapter(null);
    await expect(
      adapter.convertMarkdownToDocx(inputPath, path.join(tmpDir, 'output.docx'))
    ).rejects.toThrow(/Pandoc exited/);
  });
});

describe('renderDocx', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-docx-test-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('calls PandocAdapter.convertMarkdownToDocx and creates output dir', async () => {
    const inputPath = path.join(tmpDir, 'input.md');
    fs.writeFileSync(inputPath, '# Hello\n');

    const outputPath = path.join(tmpDir, 'nested', 'output.docx');

    // Mock isAvailable to return true
    jest.spyOn(PandocAdapter.prototype, 'isAvailable').mockResolvedValueOnce(true);
    const mockConvert = jest
      .spyOn(PandocAdapter.prototype, 'convertMarkdownToDocx')
      .mockResolvedValueOnce(undefined);

    const opts: RenderDocxOptions = { inputPath, outputPath };
    await renderDocx(opts);

    expect(mockConvert).toHaveBeenCalledWith(inputPath, outputPath, {
      referenceDoc: undefined,
      resourcePath: undefined,
      toc: undefined,
      timeout: undefined,
    });
    // Output directory should have been created
    expect(fs.existsSync(path.dirname(outputPath))).toBe(true);
  });

  test('throws when Pandoc is not available', async () => {
    jest.spyOn(PandocAdapter.prototype, 'isAvailable').mockResolvedValueOnce(false);

    const opts: RenderDocxOptions = {
      inputPath: path.join(tmpDir, 'input.md'),
      outputPath: path.join(tmpDir, 'output.docx'),
    };

    await expect(renderDocx(opts)).rejects.toThrow(/Pandoc is required/);
  });

  test('passes optional fields to convertMarkdownToDocx', async () => {
    const inputPath = path.join(tmpDir, 'input.md');
    fs.writeFileSync(inputPath, '# Hello\n');

    jest.spyOn(PandocAdapter.prototype, 'isAvailable').mockResolvedValueOnce(true);
    const mockConvert = jest
      .spyOn(PandocAdapter.prototype, 'convertMarkdownToDocx')
      .mockResolvedValueOnce(undefined);

    await renderDocx({
      inputPath,
      outputPath: path.join(tmpDir, 'output.docx'),
      referenceDoc: '/path/to/template.docx',
      resourcePath: ['/imgs'],
      toc: true,
      timeout: 5000,
    });

    expect(mockConvert).toHaveBeenCalledWith(
      inputPath,
      path.join(tmpDir, 'output.docx'),
      {
        referenceDoc: '/path/to/template.docx',
        resourcePath: ['/imgs'],
        toc: true,
        timeout: 5000,
      }
    );
  });
});

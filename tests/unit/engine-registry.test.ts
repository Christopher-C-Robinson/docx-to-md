import { PandocAdapter } from '../../src/core/engines/pandoc/adapter';
import { MammothAdapter } from '../../src/core/engines/mammoth/adapter';
import { LibreOfficeAdapter } from '../../src/core/engines/libreoffice/adapter';
import { resolveEngine, getEngine } from '../../src/core/engines/registry';
import { EngineType } from '../../src/core/types';

describe('resolveEngine – automatic engine selection', () => {
  let pandocSpy: jest.SpyInstance;
  let mammothSpy: jest.SpyInstance;
  let libreOfficeSpy: jest.SpyInstance;

  beforeEach(() => {
    pandocSpy = jest.spyOn(PandocAdapter.prototype, 'isAvailable');
    mammothSpy = jest.spyOn(MammothAdapter.prototype, 'isAvailable');
    libreOfficeSpy = jest.spyOn(LibreOfficeAdapter.prototype, 'isAvailable');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('selects pandoc when it is available and no engine is preferred', async () => {
    pandocSpy.mockResolvedValue(true);
    mammothSpy.mockResolvedValue(true);
    libreOfficeSpy.mockResolvedValue(true);

    const engine = await resolveEngine();
    expect(engine.name).toBe('pandoc');
  });

  test('falls back to mammoth when pandoc is unavailable', async () => {
    pandocSpy.mockResolvedValue(false);
    mammothSpy.mockResolvedValue(true);
    libreOfficeSpy.mockResolvedValue(false);

    const engine = await resolveEngine();
    expect(engine.name).toBe('mammoth');
  });

  test('falls back to libreoffice when pandoc and mammoth are unavailable', async () => {
    pandocSpy.mockResolvedValue(false);
    mammothSpy.mockResolvedValue(false);
    libreOfficeSpy.mockResolvedValue(true);

    const engine = await resolveEngine();
    expect(engine.name).toBe('libreoffice');
  });

  test('throws when no engine is available', async () => {
    pandocSpy.mockResolvedValue(false);
    mammothSpy.mockResolvedValue(false);
    libreOfficeSpy.mockResolvedValue(false);

    await expect(resolveEngine()).rejects.toThrow('No conversion engine available');
  });

  test('uses preferred engine when it is available', async () => {
    pandocSpy.mockResolvedValue(true);
    mammothSpy.mockResolvedValue(true);
    libreOfficeSpy.mockResolvedValue(true);

    const engine = await resolveEngine('mammoth');
    expect(engine.name).toBe('mammoth');
  });

  test('falls back from preferred engine when it is unavailable', async () => {
    pandocSpy.mockResolvedValue(true);
    mammothSpy.mockResolvedValue(false);
    libreOfficeSpy.mockResolvedValue(false);

    const engine = await resolveEngine('mammoth');
    expect(engine.name).toBe('pandoc');
  });

  test('does not check preferred engine twice when preferred is pandoc', async () => {
    pandocSpy.mockResolvedValue(true);

    await resolveEngine('pandoc');
    expect(pandocSpy).toHaveBeenCalledTimes(1);
  });
});

describe('getEngine', () => {
  test('returns the named engine adapter', () => {
    const adapter = getEngine('mammoth');
    expect(adapter.name).toBe('mammoth');
  });

  test('throws for an unknown engine name', () => {
    expect(() => getEngine('unknown' as EngineType)).toThrow('Unknown engine: unknown');
  });
});

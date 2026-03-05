import { PandocAdapter } from '../../src/core/engines/pandoc/adapter';
import { EngineAdapter } from '../../src/core/engines/interface';
import { ConversionOptions, ConversionResult, EngineType } from '../../src/core/types';

function makeFakeAdapter(result: Partial<ConversionResult> = {}): EngineAdapter & { called: boolean } {
  let called = false;
  const adapter: EngineAdapter & { called: boolean } = {
    get called() { return called; },
    name: 'mammoth' as EngineType,
    isAvailable: async () => true,
    async convert(_inputPath: string, _outputPath: string, _options: ConversionOptions): Promise<ConversionResult> {
      called = true;
      return {
        markdown: '# Fallback result\n',
        assets: [],
        warnings: [],
        metadata: {},
        ...result,
      };
    },
  };
  return adapter;
}

describe('PandocAdapter – failure fallback', () => {
  test('adapter name is pandoc', () => {
    const adapter = new PandocAdapter(null);
    expect(adapter.name).toBe('pandoc');
  });

  test('uses injected fallback adapter when pandoc fails', async () => {
    // Use a non-existent file to make pandoc fail; the important thing is that the pandoc
    // failure path reaches the fallback branch. We verify this by injecting a fake adapter
    // and asserting its result is returned.
    const fakeAdapter = makeFakeAdapter({ markdown: '# Fallback\n' });
    const adapter = new PandocAdapter(fakeAdapter);
    const result = await adapter.convert(
      '/tmp/nonexistent-file.docx',
      '/tmp/nonexistent-output.md',
      { format: 'gfm' }
    );
    expect(result.markdown).toBe('# Fallback\n');
  });

  test('invokes fallback adapter when pandoc process fails', async () => {
    const fakeAdapter = makeFakeAdapter({ markdown: '# From fallback\n' });

    // PandocAdapter with a non-existent input path will cause pandoc to fail
    const adapter = new PandocAdapter(fakeAdapter);
    const options: ConversionOptions = { format: 'gfm' };

    const result = await adapter.convert(
      '/tmp/nonexistent-file.docx',
      '/tmp/nonexistent-output.md',
      options
    );

    expect(fakeAdapter.called).toBe(true);
    expect(result.markdown).toBe('# From fallback\n');
    // Fallback warning should be included
    expect(result.warnings.some(w => w.includes('Pandoc failed') && w.includes('falling back'))).toBe(true);
  });

  test('fallback result warnings are merged with pandoc failure warning', async () => {
    const fakeAdapter = makeFakeAdapter({
      markdown: '# ok\n',
      warnings: ['[mammoth] some issue'],
    });

    const adapter = new PandocAdapter(fakeAdapter);
    const result = await adapter.convert(
      '/tmp/nonexistent-file.docx',
      '/tmp/nonexistent-output.md',
      { format: 'gfm' }
    );

    // Should have the pandoc failure warning AND the mammoth warning
    const pandocWarn = result.warnings.find(w => w.includes('Pandoc failed'));
    const mammothWarn = result.warnings.find(w => w.includes('[mammoth]'));
    expect(pandocWarn).toBeDefined();
    expect(mammothWarn).toBeDefined();
  });

  test('throws when pandoc fails and no fallback is configured', async () => {
    const adapter = new PandocAdapter(null);
    await expect(
      adapter.convert('/tmp/nonexistent-file.docx', '/tmp/nonexistent-output.md', { format: 'gfm' })
    ).rejects.toThrow();
  });

  test('throws combined error when pandoc and fallback both fail', async () => {
    const failingFallback: EngineAdapter = {
      name: 'mammoth',
      isAvailable: async () => true,
      async convert(): Promise<ConversionResult> {
        throw new Error('fallback exploded');
      },
    };

    const adapter = new PandocAdapter(failingFallback);
    await expect(
      adapter.convert('/tmp/nonexistent-file.docx', '/tmp/nonexistent-output.md', { format: 'gfm' })
    ).rejects.toThrow('Pandoc conversion failed and fallback adapter "mammoth" also failed');

    await expect(
      adapter.convert('/tmp/nonexistent-file.docx', '/tmp/nonexistent-output.md', { format: 'gfm' })
    ).rejects.toMatchObject({ errors: expect.any(Array) });
  });
});

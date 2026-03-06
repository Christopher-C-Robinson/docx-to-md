import mammoth from 'mammoth';
import { MammothAdapter } from '../../src/core/engines/mammoth/adapter';
import { ConversionOptions } from '../../src/core/types';

jest.mock('mammoth');

const mockMammoth = mammoth as jest.Mocked<typeof mammoth>;

// Minimal stub for mammoth.convertToHtml
const htmlResult = { value: '<p>Hello</p>', messages: [] };

// fs.writeFileSync is called by the adapter; stub it out so no real disk I/O happens
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
}));

describe('MammothAdapter – buildStyleMap', () => {
  let adapter: MammothAdapter;

  beforeEach(() => {
    adapter = new MammothAdapter();
    jest.clearAllMocks();
    mockMammoth.convertToHtml.mockResolvedValue(htmlResult as never);
  });

  async function captureStyleMap(options: ConversionOptions = {}): Promise<string[]> {
    await adapter.convert('/fake/input.docx', '/fake/output.md', options);
    const callArgs = mockMammoth.convertToHtml.mock.calls[0];
    const mammothOptions = callArgs[1] as { styleMap?: string | string[] };
    const raw = mammothOptions?.styleMap ?? [];
    return Array.isArray(raw) ? raw : [raw];
  }

  test('default style map always includes First Paragraph mapping', async () => {
    const map = await captureStyleMap();
    expect(map).toContain("p[style-name='First Paragraph'] => p:fresh");
  });

  test('default style map always includes Body Text mapping', async () => {
    const map = await captureStyleMap();
    expect(map).toContain("p[style-name='Body Text'] => p:fresh");
  });

  test('default style map always includes Compact mapping', async () => {
    const map = await captureStyleMap();
    expect(map).toContain("p[style-name='Compact'] => p:fresh");
  });

  test('default style map always includes Source Code mapping', async () => {
    const map = await captureStyleMap();
    expect(map).toContain("p[style-name='Source Code'] => pre[class='language-text']:fresh");
  });

  test('default style map always includes Verbatim Char run style mapping', async () => {
    const map = await captureStyleMap();
    expect(map).toContain("r[style-name='Verbatim Char'] => code");
  });

  test('default style map always includes Title mapping', async () => {
    const map = await captureStyleMap();
    expect(map).toContain("p[style-name='Title'] => h1:fresh");
  });

  test('default style map always includes Subtitle mapping', async () => {
    const map = await captureStyleMap();
    expect(map).toContain("p[style-name='Subtitle'] => p:fresh");
  });

  test('default style map always includes No Spacing mapping', async () => {
    const map = await captureStyleMap();
    expect(map).toContain("p[style-name='No Spacing'] => p:fresh");
  });

  test('default style map always includes Subtle Reference run style mapping', async () => {
    const map = await captureStyleMap();
    expect(map).toContain("r[style-name='Subtle Reference'] => em");
  });

  test('user-provided paragraph style uses p prefix', async () => {
    const map = await captureStyleMap({
      styleMap: [{ docxStyle: 'My Custom Style', markdownOutput: 'p:fresh' }],
    });
    expect(map).toContain("p[style-name='My Custom Style'] => p:fresh");
  });

  test('user-provided run style uses r prefix when type is run', async () => {
    const map = await captureStyleMap({
      styleMap: [{ docxStyle: 'My Char Style', markdownOutput: 'em', type: 'run' }],
    });
    expect(map).toContain("r[style-name='My Char Style'] => em");
  });

  test('user-provided mappings appear before built-in defaults', async () => {
    const map = await captureStyleMap({
      styleMap: [{ docxStyle: 'Body Text', markdownOutput: 'h2', type: 'paragraph' }],
    });
    const userIdx = map.indexOf("p[style-name='Body Text'] => h2");
    const defaultIdx = map.indexOf("p[style-name='Body Text'] => p:fresh");
    expect(userIdx).toBeGreaterThanOrEqual(0);
    expect(defaultIdx).toBeGreaterThan(userIdx);
  });
});

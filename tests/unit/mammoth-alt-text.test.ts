import mammoth from 'mammoth';
import { MammothAdapter } from '../../src/core/engines/mammoth/adapter';

jest.mock('mammoth');
const mockMammoth = mammoth as jest.Mocked<typeof mammoth>;

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
}));

// ---------------------------------------------------------------------------
// cleanAltText – unit tests for the static helper
// ---------------------------------------------------------------------------

describe('MammothAdapter.cleanAltText', () => {
  test('returns empty string for empty input', () => {
    expect(MammothAdapter.cleanAltText('')).toBe('');
  });

  test('strips Word auto-generated "screenshot of a computer" text', () => {
    expect(MammothAdapter.cleanAltText('A screenshot of a computer')).toBe('');
  });

  test('strips text that contains "AI-generated content may be incorrect"', () => {
    expect(
      MammothAdapter.cleanAltText('AI-generated content may be incorrect.')
    ).toBe('');
  });

  test('strips combined Word auto-generated multi-line alt text', () => {
    expect(
      MammothAdapter.cleanAltText(
        'A screenshot of a computer\nAI-generated content may be incorrect.'
      )
    ).toBe('');
  });

  test('strips Word auto-generated "screenshot of a computer" text (case-insensitive)', () => {
    expect(MammothAdapter.cleanAltText('A Screenshot of a Computer')).toBe('');
  });

  test('strips text that contains "AI-generated content may be incorrect" (case-insensitive)', () => {
    expect(
      MammothAdapter.cleanAltText('AI-Generated Content May Be Incorrect.')
    ).toBe('');
  });

  test('preserves user-authored alt text', () => {
    expect(MammothAdapter.cleanAltText('Architecture diagram')).toBe(
      'Architecture diagram'
    );
  });

  test('trims surrounding whitespace from user-authored alt text', () => {
    expect(MammothAdapter.cleanAltText('  Architecture diagram  ')).toBe(
      'Architecture diagram'
    );
  });
});

// ---------------------------------------------------------------------------
// cleanImageAltText integration – verify alt text is cleaned before Turndown
// ---------------------------------------------------------------------------

describe('MammothAdapter – alt text cleaning during convert()', () => {
  let adapter: MammothAdapter;

  beforeEach(() => {
    adapter = new MammothAdapter();
    jest.clearAllMocks();
  });

  async function convertWithHtml(html: string): Promise<string> {
    mockMammoth.convertToHtml.mockResolvedValue({
      value: html,
      messages: [],
    } as never);
    const result = await adapter.convert(
      '/fake/input.docx',
      '/fake/output.md',
      { format: 'gfm' }
    );
    return result.markdown;
  }

  test('removes Word auto-generated alt text from img tags', async () => {
    const md = await convertWithHtml(
      '<img src="image1.png" alt="A screenshot of a computer">'
    );
    expect(md).not.toContain('A screenshot of a computer');
  });

  test('removes "AI-generated content may be incorrect" alt text', async () => {
    const md = await convertWithHtml(
      '<img src="image1.png" alt="AI-generated content may be incorrect.">'
    );
    expect(md).not.toContain('AI-generated content may be incorrect');
  });

  test('preserves legitimate user-authored alt text', async () => {
    const md = await convertWithHtml(
      '<img src="image1.png" alt="Architecture diagram">'
    );
    expect(md).toContain('Architecture diagram');
  });

  test('handles img tags with no alt attribute', async () => {
    const md = await convertWithHtml('<p>Hello</p><img src="image1.png">');
    expect(md).toContain('Hello');
  });
});

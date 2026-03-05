import { MarkdownFormatter } from '../../src/core/markdown/formatter';
import {
  RootNode, HeadingNode, ParagraphNode, TextNode,
  TableNode, TableRowNode, TableCellNode,
} from '../../src/core/ast/types';

const formatter = new MarkdownFormatter('gfm');

function text(value: string): TextNode {
  return { type: 'text', value };
}

function paragraph(content: string): ParagraphNode {
  return { type: 'paragraph', children: [text(content)] };
}

function heading(depth: 1 | 2 | 3 | 4 | 5 | 6, content: string): HeadingNode {
  return { type: 'heading', depth, children: [text(content)] };
}

function makeRoot(...children: RootNode['children']): RootNode {
  return { type: 'root', children };
}

describe('Formatter – normalize()', () => {
  test('document ends with exactly one newline', () => {
    const root = makeRoot(paragraph('Hello'));
    const md = formatter.serialize(root);
    expect(md.endsWith('\n')).toBe(true);
    expect(md.endsWith('\n\n')).toBe(false);
  });

  test('multiple consecutive blank lines are collapsed to one', () => {
    // Build a root with two headings; the raw serialisation would emit \n\n
    // after each. normalize() must ensure no run of 3+ newlines survives.
    const root = makeRoot(heading(1, 'First'), heading(2, 'Second'));
    const md = formatter.serialize(root);
    expect(md).not.toMatch(/\n{3,}/);
  });

  test('trailing whitespace is stripped from every line', () => {
    const root = makeRoot(paragraph('Line with content'));
    const md = formatter.serialize(root);
    // No line should end with a space or tab
    for (const line of md.split('\n')) {
      expect(line).not.toMatch(/[^\S\n]+$/);
    }
  });

  test('heading spacing is consistent – exactly one blank line between heading and following block', () => {
    const root = makeRoot(heading(1, 'Title'), paragraph('Body text'));
    const md = formatter.serialize(root);
    expect(md).toContain('# Title\n\nBody text');
  });
});

describe('Formatter – padded table columns', () => {
  function makeTable(rows: string[][], align?: TableNode['align']): RootNode {
    const tableRows: TableRowNode[] = rows.map(cells => ({
      type: 'tableRow',
      children: cells.map(t => ({
        type: 'tableCell',
        children: [text(t)],
      } as TableCellNode)),
    }));
    const table: TableNode = { type: 'table', children: tableRows, align };
    return makeRoot(table);
  }

  test('all rows use the same column widths (max across every row)', () => {
    // col-0 widths: 'ID'=2, 'alice'=5, 'bob'=3  -> max 5, but min 3 -> 5
    // col-1 widths: 'Name'=4, 'Alice'=5, 'Bob'=3 -> max 5
    const root = makeTable([['ID', 'Name'], ['alice', 'Alice'], ['bob', 'Bob']]);
    const md = formatter.serialize(root);
    const lines = md.split('\n').filter(l => l.startsWith('|'));
    // Every data/header row should have the same length
    const lengths = lines.map(l => l.length);
    expect(new Set(lengths).size).toBe(1);
  });

  test('separator row width matches header row width', () => {
    const root = makeTable([['Header A', 'B'], ['value', 'x']]);
    const md = formatter.serialize(root);
    const pipeLines = md.split('\n').filter(l => l.startsWith('|'));
    expect(pipeLines.length).toBeGreaterThanOrEqual(3);
    const [header, sep, ...data] = pipeLines;
    expect(sep.length).toBe(header.length);
    data.forEach(row => expect(row.length).toBe(header.length));
  });

  test('left-aligned column separator starts with colon', () => {
    const root = makeTable([['Key', 'Value'], ['a', 'b']], ['left', null]);
    const md = formatter.serialize(root);
    const sep = md.split('\n').find(l => l.startsWith('|') && l.includes(':-'));
    expect(sep).toBeDefined();
    expect(sep).toMatch(/\|[ ]*:-+[ ]*\|/);
  });

  test('right-aligned column separator ends with colon', () => {
    const root = makeTable([['Key', 'Value'], ['a', 'b']], [null, 'right']);
    const md = formatter.serialize(root);
    const sep = md.split('\n').find(l => l.includes('---:'));
    expect(sep).toBeDefined();
    expect(sep).toMatch(/\|[ ]*-+:[ ]*\|/);
  });

  test('center-aligned column separator has colons on both sides', () => {
    const root = makeTable([['Key', 'Value'], ['a', 'b']], [null, 'center']);
    const md = formatter.serialize(root);
    const sep = md.split('\n').find(l => l.includes(':---:') || l.includes(':--:'));
    expect(sep).toBeDefined();
    expect(sep).toMatch(/\|[ ]*:-+:[ ]*\|/);
  });

  test('minimum column width of 3 dashes is respected for short cell content', () => {
    const MIN_SEPARATOR_DASHES = 3;
    const root = makeTable([['A', 'B'], ['1', '2']]);
    const md = formatter.serialize(root);
    const sep = md.split('\n')[1];
    // Each cell in separator should have at least MIN_SEPARATOR_DASHES dashes
    const cellSeps = sep.split('|').slice(1, -1).map(s => s.trim());
    for (const cell of cellSeps) {
      expect(cell.replace(/:/g, '')).toMatch(new RegExp(`^-{${MIN_SEPARATOR_DASHES},}$`));
    }
  });
});

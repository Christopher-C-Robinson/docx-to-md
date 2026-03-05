import { MarkdownFormatter } from '../../src/core/markdown/formatter';
import { RootNode, TableNode, TableRowNode, TableCellNode, TextNode } from '../../src/core/ast/types';

describe('Table Fallback Policy', () => {
  const formatter = new MarkdownFormatter('gfm');

  function makeTable(rows: string[][], hasMergedCells = false): RootNode {
    const tableRows: TableRowNode[] = rows.map(cells => ({
      type: 'tableRow',
      children: cells.map(text => ({
        type: 'tableCell',
        children: [{ type: 'text', value: text } as TextNode],
      } as TableCellNode)),
    }));

    const table: TableNode = {
      type: 'table',
      children: tableRows,
      hasMergedCells,
    };

    return { type: 'root', children: [table] };
  }

  test('simple table produces GFM pipe table', () => {
    const root = makeTable([['Name', 'Age'], ['Alice', '30'], ['Bob', '25']]);
    const md = formatter.serialize(root);
    // Columns are padded to the widest value in each column:
    // col-0 max = len('Alice') = 5, col-1 max = len('Age') = 3
    expect(md).toContain('| Name  | Age |');
    expect(md).toContain('| ----- | --- |');
    expect(md).toContain('| Alice | 30  |');
    expect(md).toContain('| Bob   | 25  |');
  });


  test('rows with extra cells are safely truncated to header width', () => {
    const root = makeTable([['Header'], ['Cell A', 'Cell B']]);
    expect(() => formatter.serialize(root)).not.toThrow();
    const md = formatter.serialize(root);
    expect(md).toContain('| Header |');
    expect(md).toContain('| Cell A |');
    expect(md).not.toContain('Cell B');
  });

  test('table with merged cells falls back to HTML', () => {
    const root = makeTable([['Header'], ['Cell A', 'Cell B']], true);
    const md = formatter.serialize(root);
    expect(md).toContain('<table>');
    expect(md).toContain('<tr>');
    expect(md).toContain('<td>');
  });

  test('pipe characters in cells are escaped', () => {
    const root = makeTable([['A|B', 'C'], ['x', 'y']]);
    const md = formatter.serialize(root);
    expect(md).toContain('A\\|B');
  });
});

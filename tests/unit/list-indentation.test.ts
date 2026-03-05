import { MarkdownFormatter } from '../../src/core/markdown/formatter';
import { RootNode, ListNode, ListItemNode, TextNode } from '../../src/core/ast/types';

describe('List Indentation', () => {
  const formatter = new MarkdownFormatter('gfm');

  function makeUnorderedList(items: string[]): RootNode {
    const listItems: ListItemNode[] = items.map(text => ({
      type: 'listItem',
      spread: false,
      children: [{ type: 'paragraph', children: [{ type: 'text', value: text } as TextNode] }],
    }));
    const list: ListNode = { type: 'list', ordered: false, spread: false, children: listItems };
    return { type: 'root', children: [list] };
  }

  function makeOrderedList(items: string[], start = 1): RootNode {
    const listItems: ListItemNode[] = items.map(text => ({
      type: 'listItem',
      spread: false,
      children: [{ type: 'paragraph', children: [{ type: 'text', value: text } as TextNode] }],
    }));
    const list: ListNode = { type: 'list', ordered: true, start, spread: false, children: listItems };
    return { type: 'root', children: [list] };
  }

  test('unordered list uses dash markers', () => {
    const root = makeUnorderedList(['Item A', 'Item B']);
    const md = formatter.serialize(root);
    expect(md).toContain('- Item A');
    expect(md).toContain('- Item B');
  });

  test('ordered list uses numeric markers starting at 1', () => {
    const root = makeOrderedList(['First', 'Second', 'Third']);
    const md = formatter.serialize(root);
    expect(md).toContain('1. First');
    expect(md).toContain('2. Second');
    expect(md).toContain('3. Third');
  });

  test('ordered list respects custom start index', () => {
    const root = makeOrderedList(['Alpha', 'Beta'], 5);
    const md = formatter.serialize(root);
    expect(md).toContain('5. Alpha');
    expect(md).toContain('6. Beta');
  });
});

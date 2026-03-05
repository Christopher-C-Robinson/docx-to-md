import { MarkdownFormatter } from '../../src/core/markdown/formatter';
import { RootNode, HeadingNode, TextNode } from '../../src/core/ast/types';

describe('Style Mapping – Heading Levels', () => {
  const formatter = new MarkdownFormatter('gfm');

  function makeHeading(depth: 1 | 2 | 3 | 4 | 5 | 6, text: string): RootNode {
    const textNode: TextNode = { type: 'text', value: text };
    const heading: HeadingNode = { type: 'heading', depth, children: [textNode] };
    return { type: 'root', children: [heading] };
  }

  test.each([1, 2, 3, 4, 5, 6] as const)('Heading %i maps to %i # characters', (depth) => {
    const root = makeHeading(depth, 'Test Heading');
    const md = formatter.serialize(root);
    const expected = '#'.repeat(depth) + ' Test Heading\n\n';
    expect(md).toContain(expected.trimEnd());
  });

  test('heading text is preserved', () => {
    const root = makeHeading(1, 'My Document Title');
    expect(formatter.serialize(root)).toContain('My Document Title');
  });
});

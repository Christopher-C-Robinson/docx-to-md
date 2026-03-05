import { AstNode, RootNode, HeadingNode, ListNode, ListItemNode, TableNode, TableRowNode, LinkNode, ImageNode, FootnoteNode, CodeNode, Parent } from '../ast/types';
import { MarkdownFormat } from '../types';

export class MarkdownFormatter {
  private format: MarkdownFormat;

  constructor(format: MarkdownFormat = 'gfm') {
    this.format = format;
  }

  serialize(root: RootNode): string {
    return this.serializeChildren(root).trim() + '\n';
  }

  private serializeChildren(node: Parent, indent = ''): string {
    return node.children.map(child => this.serializeNode(child, indent)).join('');
  }

  private serializeNode(node: AstNode, indent = ''): string {
    switch (node.type) {
      case 'heading': return this.heading(node as HeadingNode, indent);
      case 'paragraph': return this.serializeChildren(node as Parent, indent).trim() + '\n\n';
      case 'text': return (node as { value: string }).value;
      case 'strong': return `**${this.serializeChildren(node as Parent, indent)}**`;
      case 'emphasis': return `*${this.serializeChildren(node as Parent, indent)}*`;
      case 'code': {
        const c = node as CodeNode;
        return `\`\`\`${c.lang ?? ''}\n${c.value}\n\`\`\`\n\n`;
      }
      case 'blockquote': return this.serializeChildren(node as Parent, indent).split('\n').map(l => l.length > 0 ? `> ${l}` : '>').join('\n') + '\n\n';
      case 'list': return this.list(node as ListNode, indent);
      case 'listItem': return this.listItem(node as ListItemNode, indent);
      case 'table': return this.table(node as TableNode, indent);
      case 'link': {
        const l = node as LinkNode;
        const txt = this.serializeChildren(l, indent);
        return `[${txt}](${l.url}${l.title ? ` "${l.title}"` : ''})`;
      }
      case 'image': {
        const img = node as ImageNode;
        return `![${img.alt ?? ''}](${img.url}${img.title ? ` "${img.title}"` : ''})`;
      }
      case 'thematicBreak': return '---\n\n';
      case 'html': return (node as { value: string }).value + '\n\n';
      case 'footnote': return this.footnote(node as FootnoteNode, indent);
      default: return '';
    }
  }

  private heading(node: HeadingNode, indent: string): string {
    const text = this.serializeChildren(node, indent);
    return `${'#'.repeat(node.depth)} ${text}\n\n`;
  }

  private list(node: ListNode, indent: string): string {
    let idx = node.start ?? 1;
    return node.children.map(child => {
      const prefix = node.ordered ? `${idx++}. ` : '- ';
      const childContent = this.listItem(child as ListItemNode, indent + '  ', prefix);
      return childContent;
    }).join('') + '\n';
  }

  private listItem(node: ListItemNode, indent: string, prefix = '- '): string {
    const lines = this.serializeChildren(node, indent).trim().split('\n');
    const continuation = lines.slice(1).map(l => `${indent}  ${l}`).join('\n');
    return `${indent}${prefix}${lines[0]}\n${continuation ? continuation + '\n' : ''}`;
  }

  private table(node: TableNode, indent: string): string {
    if (node.hasMergedCells) {
      return this.tableAsHtml(node, indent);
    }

    const rows = node.children.map(row =>
      '| ' + (row as TableRowNode).children.map(cell =>
        this.serializeChildren(cell as Parent, indent).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').trim()
      ).join(' | ') + ' |'
    );

    if (rows.length === 0) return '';

    const headerSep = '| ' + (node.children[0] as TableRowNode).children.map((cell) => {
      const align = (node as TableNode).align?.[(node.children[0] as TableRowNode).children.indexOf(cell)];
      if (align === 'left') return ':---';
      if (align === 'right') return '---:';
      if (align === 'center') return ':---:';
      return '---';
    }).join(' | ') + ' |';

    return rows[0] + '\n' + headerSep + '\n' + rows.slice(1).join('\n') + '\n\n';
  }

  private tableAsHtml(node: TableNode, _indent: string): string {
    const rows = node.children.map(row => {
      const cells = (row as TableRowNode).children.map(cell => {
        const c = cell as { type: string; colspan?: number; rowspan?: number; children: AstNode[] };
        const attrs = [
          c.colspan && c.colspan > 1 ? `colspan="${c.colspan}"` : '',
          c.rowspan && c.rowspan > 1 ? `rowspan="${c.rowspan}"` : '',
        ].filter(Boolean).join(' ');
        const content = c.children.map(ch => this.serializeNode(ch)).join('');
        return `<td${attrs ? ' ' + attrs : ''}>${content}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('\n');
    return `<table>\n${rows}\n</table>\n\n`;
  }

  private footnote(node: FootnoteNode, indent: string): string {
    const content = this.serializeChildren(node, indent).trim();
    if (this.format === 'gfm') {
      return `[^${node.identifier}]: ${content}\n\n`;
    }
    return `<fn id="${node.identifier}">${content}</fn>\n\n`;
  }
}

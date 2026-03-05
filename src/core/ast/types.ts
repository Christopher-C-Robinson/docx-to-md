export type NodeType =
  | 'root' | 'heading' | 'paragraph' | 'text' | 'strong' | 'emphasis'
  | 'code' | 'blockquote' | 'list' | 'listItem' | 'table' | 'tableRow'
  | 'tableCell' | 'link' | 'image' | 'thematicBreak' | 'html' | 'footnote';

export interface BaseNode {
  type: NodeType;
}

export interface Parent extends BaseNode {
  children: AstNode[];
}

export interface Literal extends BaseNode {
  value: string;
}

export interface RootNode extends Parent { type: 'root'; }

export interface HeadingNode extends Parent {
  type: 'heading';
  depth: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface ParagraphNode extends Parent { type: 'paragraph'; }
export interface TextNode extends Literal { type: 'text'; }
export interface StrongNode extends Parent { type: 'strong'; }
export interface EmphasisNode extends Parent { type: 'emphasis'; }

export interface CodeNode extends Literal {
  type: 'code';
  lang?: string;
  meta?: string;
}

export interface BlockquoteNode extends Parent { type: 'blockquote'; }

export interface ListNode extends Parent {
  type: 'list';
  ordered: boolean;
  start?: number;
  spread: boolean;
}

export interface ListItemNode extends Parent {
  type: 'listItem';
  spread: boolean;
  checked?: boolean | null;
}

export interface TableNode extends Parent {
  type: 'table';
  align?: Array<'left' | 'right' | 'center' | null>;
  hasMergedCells?: boolean;
}

export interface TableRowNode extends Parent { type: 'tableRow'; }

export interface TableCellNode extends Parent {
  type: 'tableCell';
  colspan?: number;
  rowspan?: number;
}

export interface LinkNode extends Parent {
  type: 'link';
  url: string;
  title?: string;
}

export interface ImageNode extends BaseNode {
  type: 'image';
  url: string;
  alt?: string;
  title?: string;
}

export interface ThematicBreakNode extends BaseNode { type: 'thematicBreak'; }
export interface HtmlNode extends Literal { type: 'html'; }

export interface FootnoteNode extends Parent {
  type: 'footnote';
  identifier: string;
  label: string;
}

export type AstNode =
  | RootNode | HeadingNode | ParagraphNode | TextNode | StrongNode | EmphasisNode
  | CodeNode | BlockquoteNode | ListNode | ListItemNode | TableNode | TableRowNode
  | TableCellNode | LinkNode | ImageNode | ThematicBreakNode | HtmlNode | FootnoteNode;

export type MarkdownFormat = 'gfm' | 'commonmark';
export type TrackChangesPolicy = 'accept' | 'reject' | 'all';
export type EngineType = 'pandoc' | 'mammoth' | 'libreoffice';

export interface StyleMapping {
  docxStyle: string;
  markdownOutput: string;
  /** Whether this mapping targets a paragraph style ('paragraph') or a run/character style ('run'). Defaults to 'paragraph'. */
  type?: 'paragraph' | 'run';
}

export interface ConversionOptions {
  engine?: EngineType;
  format?: MarkdownFormat;
  mediaDir?: string;
  trackChanges?: TrackChangesPolicy;
  luaFilters?: string[];
  timeout?: number;
  styleMap?: StyleMapping[];
  /** Maximum accepted input file size in bytes. Defaults to 50 MB. */
  maxFileSizeBytes?: number;
}

export interface ConversionResult {
  markdown: string;
  assets: string[];
  warnings: string[];
  metadata: Record<string, unknown>;
}

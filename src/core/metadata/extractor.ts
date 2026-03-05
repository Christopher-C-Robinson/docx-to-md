export interface DocumentMetadata {
  title?: string;
  author?: string;
  subject?: string;
  description?: string;
  keywords?: string[];
  created?: string;
  modified?: string;
  revision?: number;
  language?: string;
}

/**
 * Extract metadata from Pandoc's JSON AST meta block, or from raw properties.
 */
export function extractMetadata(raw: Record<string, unknown>): DocumentMetadata {
  const meta: DocumentMetadata = {};

  const getStr = (key: string): string | undefined => {
    const v = raw[key];
    if (typeof v === 'string') return v;
    return undefined;
  };

  meta.title = getStr('title');
  meta.author = getStr('author');
  meta.subject = getStr('subject');
  meta.description = getStr('description');
  meta.language = getStr('language');

  const kw = raw['keywords'];
  if (Array.isArray(kw)) {
    meta.keywords = kw.filter(k => typeof k === 'string') as string[];
  } else if (typeof kw === 'string') {
    meta.keywords = kw.split(',').map(k => k.trim());
  }

  const created = getStr('created') ?? getStr('dcterms:created');
  if (created) meta.created = created;

  const modified = getStr('modified') ?? getStr('dcterms:modified');
  if (modified) meta.modified = modified;

  return meta;
}

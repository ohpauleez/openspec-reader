const MARKDOWN_PATH = /\.(?:md|markdown|mdown|mkdn|mkd|mdwn|mdtxt|mdtext)$/i;
export type DocumentKind = 'markdown' | 'alloy' | 'java';

/** Recognize supported document paths on file/http(s); malformed and privileged URLs fail closed. */
export function documentKind(value: string): DocumentKind | null {
  try {
    const url = new URL(value);
    if (!['file:', 'http:', 'https:'].includes(url.protocol)) return null;
    const path = decodeURIComponent(url.pathname);
    if (/\.als$/i.test(path)) return 'alloy';
    if (/\.(?:java|jml)$/i.test(path)) return 'java';
    return MARKDOWN_PATH.test(path) ? 'markdown' : null;
  } catch {
    return null;
  }
}

/** Retain Markdown-specific detection for callers that require that format. */
export function isMarkdownUrl(value: string): boolean {
  return documentKind(value) === 'markdown';
}

/** All supported local documents use the same permission and content-script foundation. */
export function isReaderUrl(value: string): boolean {
  return documentKind(value) !== null;
}

/** Require a text document before replacing the browser's presentation. */
export function isTextDocument(contentType: string): boolean {
  return /^text\/(?:plain|(?:x-)?markdown|(?:x-)?alloy|(?:x-)?java(?:-source)?|(?:x-)?jml)(?:;|$)/i.test(contentType);
}

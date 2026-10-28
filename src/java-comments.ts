import type { Tree } from '@lezer/common';

export interface JavaBlock {
  readonly kind: 'javadoc' | 'jml';
  readonly from: number;
  readonly to: number;
  readonly line: number;
  readonly body: string;
  readonly raw: string;
  readonly fullLine: boolean;
  readonly conditional: boolean;
  readonly markdown: boolean;
}
const JML_LINE = /^\/\/(?:[+-][\w,+-]*)?@/;
const JML_BLOCK = /^\/\*(?:[+-][\w,+-]*)?@/;

/** Remove only annotation/comment delimiters and line prefixes; retain expression text and indentation. */
export function commentBody(raw: string, kind: JavaBlock['kind']): string {
  if (raw.startsWith('//')) return raw.split('\n').map((line) => line.replace(kind === 'jml' ? /^\s*\/\/(?:[+-][\w,+-]*)?@ ?/ : /^\s*\/\/\/ ?/, '')).join('\n').trim();
  return raw.replace(kind === 'jml' ? JML_BLOCK : /^\/\*\*/, '')
    .replace(kind === 'jml' ? /@?\*\/$/ : /\*\/$/, '')
    .split('\n').map((line) => line.replace(kind === 'jml' ? /^\s*@ ?/ : /^\s*\* ?/, '')).join('\n').trim();
}

/** Use Java's syntax tree so annotation-like strings and ordinary comments cannot become contracts. */
export function javaBlocks(source: string, tree: Tree): JavaBlock[] {
  const comments: { from: number; to: number; kind: JavaBlock['kind']; markdown: boolean; marker: string }[] = [];
  tree.iterate({ enter(node) {
    if (node.name !== 'BlockComment' && node.name !== 'LineComment') return;
    const raw = source.slice(node.from, node.to);
    const kind = JML_LINE.test(raw) || JML_BLOCK.test(raw) ? 'jml' : raw.startsWith('/**') || raw.startsWith('///') ? 'javadoc' : null;
    if (kind) comments.push({ from: node.from, to: node.to, kind, markdown: raw.startsWith('///'), marker: JML_LINE.exec(raw)?.[0] ?? (raw.startsWith('///') ? '///' : '') });
  } });
  const blocks: JavaBlock[] = [];
  let scanned = 0;
  let line = 1;
  for (let i = 0; i < comments.length; i++) {
    const first = comments[i];
    let to = first.to;
    if (source.startsWith('//', first.from)) {
      for (; i + 1 < comments.length; i++) {
        const next = comments[i + 1];
        if (next.kind !== first.kind || next.marker !== first.marker || !source.startsWith('//', next.from)) break;
        if (!/^[ \t]*\n[ \t]*$/.test(source.slice(to, next.from))) break;
        to = next.to;
      }
    }
    line += source.slice(scanned, first.from).split('\n').length - 1;
    scanned = first.from;
    const lineStart = source.lastIndexOf('\n', first.from - 1) + 1;
    const nextNewline = source.indexOf('\n', to);
    const lineEnd = nextNewline < 0 ? source.length : nextNewline;
    const raw = source.slice(first.from, to);
    blocks.push({ kind: first.kind, from: first.from, to, line, raw, body: commentBody(raw, first.kind), markdown: first.markdown,
      fullLine: !source.slice(lineStart, first.from).trim() && !source.slice(to, lineEnd).trim(),
      conditional: /^\/[/\*][+-]/.test(raw),
    });
  }
  return blocks;
}

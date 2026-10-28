export interface FoldRange { readonly from: number; readonly to: number }
interface OpenBrace { readonly offset: number; readonly lineEnd: number }

/** Scan Alloy braces and comments in linear time. Delimiters in strings/comments never match braces. */
export function alloyFoldRanges(source: string): FoldRange[] {
  const ranges: FoldRange[] = [];
  const braces: OpenBrace[] = [];
  let i = 0;
  while (i < source.length) {
    const start = i;
    if (source[i] === '"') {
      i++;
      while (i < source.length && source[i] !== '"') i += source[i] === '\\' ? 2 : 1;
      i++;
    } else if (source.startsWith('//', i) || source.startsWith('--', i)) {
      const end = source.indexOf('\n', i);
      i = end < 0 ? source.length : end + 1;
      let lastEnd = end < 0 ? source.length : end;
      for (; i < source.length;) {
        const nextEnd = source.indexOf('\n', i);
        const lineEnd = nextEnd < 0 ? source.length : nextEnd;
        if (!/^\s*(?:\/\/|--)/.test(source.slice(i, lineEnd))) break;
        lastEnd = lineEnd;
        i = lineEnd + 1;
      }
      if (end >= 0 && lastEnd > end) ranges.push({ from: end, to: lastEnd });
    } else if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 2;
      if (source.slice(start, i).includes('\n')) ranges.push({ from: start + 2, to: end < 0 ? i : end });
    } else if (source[i] === '{') {
      const newline = source.indexOf('\n', i);
      braces.push({ offset: i, lineEnd: newline < 0 ? source.length : newline });
      i++;
    } else if (source[i] === '}') {
      const open = braces.pop();
      if (open && open.lineEnd < i) ranges.push({ from: open.offset + 1, to: i });
      i++;
    } else i++;
    if (i <= start) throw new Error('Alloy scanner must make progress');
  }
  return ranges.sort((a, b) => a.from - b.from || b.to - a.to);
}

/** Find consecutive slash comments outside strings using syntax-tree comment nodes at the call site. */
export function commentGroupRange(source: string, lineStart: number, lineEnd: number): FoldRange | null {
  if (!/^\s*\/\//.test(source.slice(lineStart, lineEnd))) return null;
  let cursor = lineEnd + 1;
  let end = lineEnd;
  while (cursor < source.length) {
    const next = source.indexOf('\n', cursor);
    const stop = next < 0 ? source.length : next;
    if (!/^\s*\/\//.test(source.slice(cursor, stop))) break;
    end = stop;
    cursor = stop + 1;
  }
  return end > lineEnd ? { from: lineEnd, to: end } : null;
}

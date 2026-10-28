import { StreamLanguage } from '@codemirror/language';
import type { StringStream } from '@codemirror/language';

interface AlloyState { blockComment: boolean }
const KEYWORDS = /^(?:abstract|after|all|always|and|as|assert|before|but|check|disj|else|enum|eventually|exactly|expect|extends|fact|for|fun|historically|iden|iff|implies|in|Int|let|lone|module|no|none|not|once|one|open|or|pred|private|releases|run|seq|set|sig|since|some|steps|sum|this|triggered|univ|until|var)\b/;

/** Tokenize Alloy 6 without executing source. String/comment state is local to each code fence. */
function token(stream: StringStream, state: AlloyState): string | null {
  if (state.blockComment) {
    if (stream.skipTo('*/')) { stream.match('*/'); state.blockComment = false; }
    else stream.skipToEnd();
    return 'comment';
  }
  if (stream.eatSpace()) return null;
  if (stream.match('//') || stream.match('--')) { stream.skipToEnd(); return 'comment'; }
  if (stream.match('/*')) { state.blockComment = true; return 'comment'; }
  if (stream.match(/"(?:[^"\\]|\\.)*"?/)) return 'string';
  if (stream.match(KEYWORDS)) return 'keyword';
  if (stream.match(/^\d+\b/)) return 'number';
  if (stream.match(/^[A-Za-z_$][\w$]*/)) return 'variableName';
  if (stream.match(/^[!<>=+*~^&|.\-:#]+/)) return 'operator';
  stream.next();
  return 'punctuation';
}

export const alloyLanguage = StreamLanguage.define<AlloyState>({
  startState: () => ({ blockComment: false }), token,
  languageData: { commentTokens: { line: '//', block: { open: '/*', close: '*/' } } },
});

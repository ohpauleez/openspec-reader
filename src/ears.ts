import Token from 'markdown-it/lib/token.mjs';

interface TextPart {
  readonly token: Token;
  readonly from: number;
  readonly to: number;
}
interface Subject { readonly clauseFrom: number; readonly from: number; readonly to: number }
const CLAUSES = /\b(WHEN|WHILE|WHERE|IF|THEN|GIVEN|AND|BUT|THE)\b/g;
const MODALS = /\b(?:SHALL|MUST|SHOULD|MAY)\b/g;

/** Index only visible inline content; code contributes to system names but never supplies keywords. */
function indexText(tokens: readonly Token[]): { text: string; parts: TextPart[] } {
  let text = '';
  const parts: TextPart[] = [];
  for (const token of tokens) {
    const from = text.length;
    if (token.type === 'text' || token.type === 'code_inline') text += token.content;
    else if (token.type === 'softbreak' || token.type === 'hardbreak') text += '\n';
    else if (token.type === 'image') text += '\uFFFC';
    parts.push({ token, from, to: text.length });
  }
  return { text, parts };
}

/** Find subject phrases ending before their modal; punctuation/another clause ends the candidate. */
function findSubjects(text: string, parts: readonly TextPart[], keywords: readonly RegExpExecArray[]): Subject[] {
  const subjects: Subject[] = [];
  const modals = Array.from(text.matchAll(MODALS)).filter((match) => inText(parts, match.index));
  for (const keyword of keywords) {
    if (keyword[0] !== 'THE') continue;
    const modal = modals.find((match) => match.index > keyword.index);
    if (!modal) continue;
    const name = text.slice(keyword.index + 3, modal.index).trim();
    if (!name || name.length > 200 || /[,;!?\n\uFFFC]/.test(name)) continue;
    if (keywords.some((other) => other.index > keyword.index && other.index < modal.index)) continue;
    const nameStart = keyword.index + 3 + (text.slice(keyword.index + 3, modal.index).match(/^\s+/)?.[0].length ?? 0);
    subjects.push({ clauseFrom: keyword.index, from: nameStart, to: modal.index - (text.slice(0, modal.index).match(/\s+$/)?.[0].length ?? 0) });
  }
  return subjects;
}

/** Keywords must originate in prose text, excluding inline code and image alt text. */
function inText(parts: readonly TextPart[], offset: number): boolean {
  return parts.some((part) => part.token.type === 'text' && part.from <= offset && offset < part.to);
}

/** Reader-generated inline markup has fixed attributes; document text remains in text/code tokens. */
function markup(content: string): Token {
  const token = new Token('html_inline', '', 0);
  token.content = content;
  return token;
}

/** Split text at clause/subject boundaries without crossing emphasis, link, or code token nesting. */
function formatPart(part: TextPart, breaks: ReadonlySet<number>, subjects: readonly Subject[]): Token[] {
  const { token, from, to } = part;
  if (token.type !== 'text' && token.type !== 'code_inline') return [token];
  const boundaries = new Set([from, to]);
  for (const offset of breaks) if (offset >= from && offset < to) boundaries.add(offset);
  for (const subject of subjects) for (const offset of [subject.from, subject.to]) {
    if (offset > from && offset < to) boundaries.add(offset);
  }
  const offsets = Array.from(boundaries).sort((a, b) => a - b);
  const result: Token[] = [];
  for (let i = 0; i < offsets.length - 1; i++) {
    const start = offsets[i];
    const end = offsets[i + 1];
    if (breaks.has(start)) result.push(markup('<br class="osr-ears-break">'));
    const underlined = subjects.some((subject) => subject.from <= start && end <= subject.to);
    if (underlined) result.push(markup('<span class="osr-ears-subject">'));
    const piece = new Token(token.type, token.tag, token.nesting);
    Object.assign(piece, token, { content: token.content.slice(start - from, end - from) });
    result.push(piece);
    if (underlined) result.push(markup('</span>'));
  }
  return result;
}

/** Format canonical uppercase EARS/Gherkin prose; preserve Markdown source, headings, HTML, and code. */
export function formatEarsClauses(tokens: readonly Token[]): void {
  for (let i = 0; i < tokens.length; i++) {
    const inline = tokens[i];
    if (inline.type !== 'inline' || !inline.children || tokens[i - 1]?.type === 'heading_open') continue;
    if (inline.children.some((token) => token.type === 'html_inline')) continue;
    const { text, parts } = indexText(inline.children);
    if (!/^(?:WHEN|WHILE|WHERE|IF|THEN|GIVEN|AND|BUT|THE)\b/.test(text.trimStart())) continue;
    const keywords = Array.from(text.matchAll(CLAUSES)).filter((match) => inText(parts, match.index));
    if (!keywords.length || keywords[0].index !== text.search(/\S/)) continue;
    const subjects = findSubjects(text, parts, keywords);
    const breaks = new Set<number>();
    for (const keyword of keywords) {
      if (keyword.index === text.search(/\S/)) continue;
      if (keyword[0] === 'THE' && !subjects.some((subject) => subject.clauseFrom === keyword.index)) continue;
      const previousHardBreak = parts.find((part) => part.token.type === 'hardbreak' && /^\s*$/.test(text.slice(part.to, keyword.index)) && part.to <= keyword.index);
      if (!previousHardBreak) breaks.add(keyword.index);
    }
    inline.children = parts.flatMap((part) => formatPart(part, breaks, subjects));
  }
}

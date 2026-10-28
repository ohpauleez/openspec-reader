export type DefinitionKind = 'module' | 'open' | 'sig' | 'enum' | 'fact' | 'pred' | 'fun' | 'assert' | 'run' | 'check';
export interface AlloyDefinition {
  readonly id: string;
  readonly kind: DefinitionKind;
  readonly name: string | null;
  readonly title: string;
  readonly depth: number;
  readonly line: number;
  readonly from: number;
}
export interface AlloyDocument {
  readonly kind: 'alloy';
  readonly source: string;
  readonly codeSource: string;
  readonly title: string;
  readonly artifact: 'Alloy model';
  readonly definitions: readonly AlloyDefinition[];
}
interface Lexeme {
  readonly text: string;
  readonly from: number;
  readonly line: number;
  readonly identifier: boolean;
}
const DEFINITION_KINDS = new Set<string>(['module', 'open', 'sig', 'enum', 'fact', 'pred', 'fun', 'assert', 'run', 'check']);
const IDENTIFIER = /[\p{L}_$][\p{L}\p{N}_$']*/uy;

/** Tokenize without interpreting expressions; comments and strings never contribute outline entries. */
function lex(source: string): Lexeme[] {
  const tokens: Lexeme[] = [];
  let cursor = 0;
  let line = 1;
  while (cursor < source.length) {
    const from = cursor;
    if (/\s/.test(source[cursor])) {
      if (source[cursor] === '\n') line++;
      cursor++;
    } else if (source.startsWith('//', cursor) || source.startsWith('--', cursor)) {
      const end = source.indexOf('\n', cursor);
      cursor = end < 0 ? source.length : end;
    } else if (source.startsWith('/*', cursor)) {
      const end = source.indexOf('*/', cursor + 2);
      cursor = end < 0 ? source.length : end + 2;
      line += source.slice(from, cursor).split('\n').length - 1;
    } else if (source[cursor] === '"') {
      cursor++;
      while (cursor < source.length) {
        if (source[cursor] === '\n') line++;
        if (source[cursor] === '"') { cursor++; break; }
        if (source[cursor] === '\\' && source[cursor + 1] === '\n') line++;
        cursor += source[cursor] === '\\' ? 2 : 1;
      }
    } else {
      IDENTIFIER.lastIndex = cursor;
      const word = IDENTIFIER.exec(source);
      tokens.push({ text: word?.[0] ?? source[cursor], from: cursor, line, identifier: !!word });
      cursor += word?.[0].length ?? 1;
    }
    if (cursor <= from) throw new Error('Alloy outline lexer must make progress');
  }
  return tokens;
}

/** Module paths use slashes; receiver predicates/functions additionally use dots. */
function qualifiedName(tokens: readonly Lexeme[], index: number, receiver: boolean): { name: string; end: number } | null {
  const first = tokens[index];
  if (!first?.identifier) return null;
  let name = first.text;
  let end = index + 1;
  for (; end + 1 < tokens.length; end += 2) {
    if (tokens[end].text !== '/' && !(receiver && tokens[end].text === '.')) break;
    if (!tokens[end + 1].identifier) break;
    name += tokens[end].text + tokens[end + 1].text;
  }
  return { name, end };
}

/** Read import aliases after optional module arguments without treating them as definitions. */
function openAlias(tokens: readonly Lexeme[], index: number): string {
  let cursor = index;
  let depth = 0;
  for (; cursor < tokens.length; cursor++) {
    if (tokens[cursor].text === '[') depth++;
    else if (tokens[cursor].text === ']') depth--;
    else if (depth === 0) break;
  }
  return tokens[cursor]?.text === 'as' && tokens[cursor + 1]?.identifier ? ` as ${tokens[cursor + 1].text}` : '';
}

/** Index only top-level declarations. Multiple signatures and anonymous/labeled commands retain provenance. */
function definitionsFrom(tokens: readonly Lexeme[]): AlloyDefinition[] {
  const definitions: AlloyDefinition[] = [];
  const ids = new Map<string, number>();
  const usedIds = new Set<string>();
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  const append = (kind: DefinitionKind, token: Lexeme, name: string | null, suffix = ''): void => {
    const slug = `${kind}-${name ?? 'anonymous'}`.toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '-');
    const occurrence = (ids.get(slug) ?? 0) + 1;
    ids.set(slug, occurrence);
    let id = `${slug}${occurrence > 1 ? `-${occurrence}` : ''}`;
    for (let suffix = 2; usedIds.has(id); suffix++) id = `${slug}-${occurrence}-${suffix}`;
    usedIds.add(id);
    definitions.push({ id, kind, name, title: `${kind} ${name ?? `(anonymous, line ${token.line})`}${suffix}`, depth: 1, line: token.line, from: token.from });
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (braceDepth === 0 && bracketDepth === 0 && parenDepth === 0 && DEFINITION_KINDS.has(token.text)) {
      const kind = token.text as DefinitionKind;
      const named = qualifiedName(tokens, i + 1, kind === 'pred' || kind === 'fun');
      let name = named?.name ?? null;
      let location = named ? tokens[i + 1] : token;
      let suffix = kind === 'open' && named ? openAlias(tokens, named.end) : '';
      if (kind === 'run' || kind === 'check') {
        if (name === 'for' || name === 'expect') { name = null; location = token; }
        if (tokens[i - 1]?.text === ':' && tokens[i - 2]?.identifier) {
          suffix = name ? `: ${name}` : '';
          name = tokens[i - 2].text;
          location = tokens[i - 2];
        }
      }
      append(kind, location, name, suffix);
      if (kind === 'sig' && named) {
        for (let cursor = named.end; tokens[cursor]?.text === ',' && tokens[cursor + 1]?.identifier; cursor += 2) {
          append(kind, tokens[cursor + 1], tokens[cursor + 1].text);
        }
      }
    }
    if (token.text === '{') braceDepth++;
    else if (token.text === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (token.text === '[') bracketDepth++;
    else if (token.text === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (token.text === '(') parenDepth++;
    else if (token.text === ')') parenDepth = Math.max(0, parenDepth - 1);
  }
  return definitions;
}

/** Keep raw source intact while normalizing displayed editor offsets to CodeMirror's line endings. */
export function parseAlloyDocument(source: string, url: string): AlloyDocument {
  const codeSource = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const definitions = definitionsFrom(lex(codeSource));
  let filename = 'Alloy model';
  try { filename = decodeURIComponent(new URL(url).pathname).split('/').pop() || filename; } catch { /* detached fixture */ }
  return { kind: 'alloy', source, codeSource, title: definitions.find((definition) => definition.kind === 'module')?.name ?? filename, artifact: 'Alloy model', definitions };
}

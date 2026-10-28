export interface JmlClause { readonly keyword: string; readonly expression: string }
export interface JmlToken { readonly text: string; readonly style: 'keyword' | 'special' | 'operator' | 'number' | 'string' | 'plain' }
export const JML_KEYWORDS = new Set(`requires ensures assignable assigns modifies writes signals signals_only diverges when accessible callable captures measured_by duration working_space invariant constraint initially represents axiom in maps hence_by assert assume unreachable set loop_invariant maintaining loop_writes loop_assignable loop_assigns loop_modifies decreases decreasing loop_decreases also behavior normal_behavior exceptional_behavior feasible_behavior normal_example exceptional_example example model ghost pure spec_pure strictly_pure helper nullable non_null nullable_by_default non_null_by_default spec_public spec_protected instance monitored readable_if writable_if secret query old forall public protected private static final abstract normal_behavior exceptional_behavior code_safe_math spec_safe_math code_java_math spec_java_math code_bigint_math spec_bigint_math nowarn signals_only skipesc`.split(/\s+/));
const CASE_PREFIX = /^(also|(?:(?:public|protected|private|static)\s+)*(?:normal_behavior|exceptional_behavior|behavior|normal_example|exceptional_example|example))\b\s*/;

/** Split top-level clauses, preserving quantifier semicolons, strings, model bodies, and unknown syntax. */
export function jmlClauses(body: string): JmlClause[] {
  const clauses: JmlClause[] = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  let lineComment = false;
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (lineComment) { if (char === '\n') lineComment = false; else continue; }
    if (quote) { if (char === '\\') i++; else if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '/' && body[i + 1] === '/') { lineComment = true; continue; }
    if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth = Math.max(0, depth - 1);
    if (char === ';' && depth === 0) { appendClauses(body.slice(start, i + 1), clauses); start = i + 1; }
  }
  appendClauses(body.slice(start), clauses);
  return clauses;
}

/** Behavior headers and also markers are separate from the following semicolon-terminated clause. */
function appendClauses(source: string, clauses: JmlClause[]): void {
  let rest = source.trim();
  for (let i = 0; i < source.length; i++) {
    const prefix = CASE_PREFIX.exec(rest);
    if (!prefix) break;
    clauses.push({ keyword: prefix[1], expression: '' });
    rest = rest.slice(prefix[0].length).trimStart();
  }
  if (!rest) return;
  const match = /^(?:(?:public|protected|private|static)\s+)*([a-z_]+)\b\s*/.exec(rest);
  if (match && JML_KEYWORDS.has(match[1])) clauses.push({ keyword: rest.slice(0, match[0].length).trim(), expression: rest.slice(match[0].length) });
  else clauses.push({ keyword: '', expression: rest });
}

/** Tokenize specification text as data. Backslash expressions and implication operators are distinct. */
export function jmlTokens(source: string): JmlToken[] {
  const tokens: JmlToken[] = [];
  const pattern = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\\[A-Za-z_][\w]*|<==>|<=!=>|==>|<==|->|<-|\.\.|&&|\|\||[=!<>]=?|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][\w]*\b/g;
  let from = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > from) tokens.push({ text: source.slice(from, match.index), style: 'plain' });
    const text = match[0];
    const style = text.startsWith('\\') ? 'special' : text.startsWith('"') || text.startsWith("'") ? 'string' : /^\d/.test(text) ? 'number' : JML_KEYWORDS.has(text) ? 'keyword' : /^[<>=!&|.\-]/.test(text) ? 'operator' : 'plain';
    tokens.push({ text, style });
    from = match.index + text.length;
  }
  if (from < source.length) tokens.push({ text: source.slice(from), style: 'plain' });
  return tokens;
}

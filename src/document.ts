import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import type Token from 'markdown-it/lib/token.mjs';
import { formatEarsClauses } from './ears';

export type SectionKind = 'section' | 'requirement' | 'scenario' | 'evidence' | 'model' | 'delta';
export interface Section {
  readonly id: string;
  readonly title: string;
  readonly identity: string | null;
  readonly kind: SectionKind;
  readonly depth: number;
  readonly line: number;
  readonly tokenIndex: number;
  readonly parentId: string | null;
  endLine: number;
  endToken: number;
}
export interface Fence {
  readonly id: string;
  readonly language: string;
  readonly source: string;
  readonly line: number;
}
export interface Diagnostic {
  readonly severity: 'warning' | 'info';
  readonly message: string;
  readonly line: number;
  readonly sectionId: string;
}
export interface DocumentModel {
  readonly kind: 'markdown';
  readonly source: string;
  readonly tokens: Token[];
  readonly parser: MarkdownIt;
  readonly sections: Section[];
  readonly fences: Fence[];
  readonly diagnostics: Diagnostic[];
  readonly isOpenSpec: boolean;
  readonly artifact: string;
  readonly title: string;
  readonly tasks: { readonly done: number; readonly total: number };
}

const KEYWORDS = /\b(SHALL NOT|MUST NOT|SHOULD NOT|NOT RECOMMENDED|SHALL|MUST|SHOULD|MAY|REQUIRED|RECOMMENDED|OPTIONAL|WHEN|WHILE|WHERE|IF|THEN|GIVEN|AND|BUT|THE)\b/g;

/** Hash identity, not security: offsets are restored only with the same content fingerprint. */
export function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return `${value.length}-${(hash >>> 0).toString(36)}`;
}

/** Recognize OpenSpec conventions by path, with structured-spec fallback for detached documents. */
export function artifactKind(url: string): string {
  let path = '';
  try { path = decodeURIComponent(new URL(url).pathname); } catch { /* detached fixture */ }
  const name = path.split('/').pop()?.toLowerCase();
  if (name === 'spec.md') return /\/changes\//.test(path) ? 'Delta spec' : 'Capability spec';
  if (/\/openspec\//i.test(path) && ['proposal.md', 'design.md', 'tasks.md'].includes(name ?? '')) {
    return name === 'proposal.md' ? 'Proposal' : name === 'tasks.md' ? 'Tasks' : 'Design';
  }
  return 'Markdown';
}

/** Preserve line numbers when removing YAML front matter; metadata is never interpreted as HTML. */
function prepareSource(source: string): { text: string; title: string | null } {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const match = /^---\n([\s\S]*?)\n(?:---|\.\.\.)(?:\n|$)/.exec(normalized);
  if (!match) return { text: normalized, title: null };
  const title = /^title:\s*["']?(.+?)["']?\s*$/m.exec(match[1])?.[1] ?? null;
  return { text: match[0].replace(/[^\n]/g, '') + normalized.slice(match[0].length), title };
}

/** Assign semantic section roles only in OpenSpec mode. */
function sectionKind(title: string, spec: boolean): SectionKind {
  if (!spec) return 'section';
  if (/^Requirement:/i.test(title)) return 'requirement';
  if (/^Scenario:/i.test(title)) return 'scenario';
  if (/^Evidence\b/i.test(title)) return 'evidence';
  if (/\bmodel\b/i.test(title)) return 'model';
  if (/^(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements$/i.test(title)) return 'delta';
  return 'section';
}

/** Build a bounded heading stack; every child is strictly deeper than its parent. */
function collectSections(tokens: Token[], spec: boolean, lineCount: number): Section[] {
  const sections: Section[] = [];
  const stack: Section[] = [];
  const ids = new Map<string, number>();
  const usedIds = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== 'heading_open' || token.level !== 0) continue;
    const title = tokens[i + 1]?.content ?? '';
    const depth = Number(token.tag.slice(1));
    const line = (token.map?.[0] ?? 0) + 1;
    while (stack.length && stack[stack.length - 1].depth >= depth) {
      const closed = stack.pop()!;
      closed.endLine = line;
      closed.endToken = i;
    }
    const slug = title.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
    const count = (ids.get(slug) ?? 0) + 1;
    ids.set(slug, count);
    // Disambiguate collisions such as duplicate Foo and an actual Foo-2 heading.
    let id = slug + (count > 1 ? `-${count}` : '');
    for (let n = 2; usedIds.has(id); n++) id = `${slug}-${count}-${n}`;
    usedIds.add(id);
    const section: Section = {
      id, title, depth, line, tokenIndex: i, endLine: lineCount + 1, endToken: tokens.length,
      identity: /\[([A-Za-z0-9][A-Za-z0-9_.:-]*)\]\s*$/.exec(title)?.[1] ?? null,
      kind: sectionKind(title, spec), parentId: stack.at(-1)?.id ?? null,
    };
    sections.push(section);
    stack.push(section);
  }
  return sections;
}

/** Produce explainable structural findings, never infer verification or test success. */
function diagnose(sections: Section[], tokens: Token[]): Diagnostic[] {
  const findings: Diagnostic[] = [];
  const identities = new Map<string, Section>();
  const byId = new Map(sections.map((section) => [section.id, section]));
  for (const section of sections) {
    if (!['requirement', 'scenario'].includes(section.kind)) continue;
    const emit = (message: string): void => { findings.push({ severity: 'warning', message, line: section.line, sectionId: section.id }); };
    if (section.identity) {
      const previous = identities.get(section.identity);
      if (previous) emit(`Duplicate identifier ${section.identity}; first used on line ${previous.line}.`);
      else identities.set(section.identity, section);
    }
    const bodyEnd = sections.find((candidate) => candidate.tokenIndex > section.tokenIndex)?.tokenIndex ?? section.endToken;
    const prose = tokens.slice(section.tokenIndex + 3, bodyEnd)
      .filter((token) => token.type === 'inline' && token.level > 0).map((token) => token.content).join('\n');
    if (section.kind === 'requirement' && !prose.trim()) emit('Requirement has no prose body.');
    if (section.kind === 'scenario') {
      let parent = section.parentId ? byId.get(section.parentId) : undefined;
      for (let n = 0; parent && parent.kind !== 'requirement' && n < 6; n++) parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      if (!parent || parent.kind !== 'requirement') emit('Scenario is not nested under a requirement.');
      if (!/\bWHEN\b/.test(prose)) emit('Scenario has no WHEN step.');
      if (!/\bTHEN\b/.test(prose)) emit('Scenario has no THEN step.');
    }
  }
  return findings;
}

/** Create a renderer whose keyword transform touches prose text tokens, never code tokens. */
function createParser(keywords: boolean): MarkdownIt {
  const parser = new MarkdownIt({ html: true, linkify: true, typographer: false }).use(taskLists);
  // Fence placeholders are renderer-owned; raw HTML cannot impersonate them.
  for (const kind of ['html_inline', 'html_block']) {
    parser.renderer.rules[kind] = (tokens, index) => tokens[index].content.replace(/data-osr-fence/gi, 'data-document-fence');
  }
  if (keywords) parser.renderer.rules.text = (tokens, index) => {
    const escaped = parser.utils.escapeHtml(tokens[index].content);
    return escaped.replace(KEYWORDS, (word) => `<span class="osr-keyword osr-kw-${word.split(' ')[0].toLowerCase()}">${word}</span>`);
  };
  return parser;
}

/** Parse source once; source maps remain original-file line numbers, including front matter. */
export function parseDocument(source: string, url: string, specMode: 'auto' | 'always' | 'never' = 'auto', keywords = true): DocumentModel {
  const prepared = prepareSource(source);
  let artifact = artifactKind(url);
  const parser = createParser(false);
  const tokens = parser.parse(prepared.text, {});
  if (artifact === 'Markdown' && tokens.some((token, index) => token.type === 'heading_open' && token.level === 0 && /^Requirement:/i.test(tokens[index + 1]?.content ?? ''))) artifact = 'Capability spec';
  const isOpenSpec = specMode === 'always' || (specMode === 'auto' && artifact !== 'Markdown');
  if (isOpenSpec && keywords) {
    parser.renderer.rules.text = createParser(true).renderer.rules.text;
    formatEarsClauses(tokens);
  }
  const sections = collectSections(tokens, isOpenSpec, prepared.text.split('\n').length);
  const fences: Fence[] = [];
  const lines = prepared.text.split('\n');
  const tasks = { done: 0, total: 0 };
  for (const token of tokens) {
    if (token.type === 'fence' || token.type === 'code_block') {
      const fence: Fence = { id: `code-${fences.length}`, language: token.info.trim().split(/\s+/)[0].toLowerCase(), source: token.content, line: (token.map?.[0] ?? 0) + 1 };
      fences.push(fence);
      token.meta = fence;
    }
    if (token.type === 'list_item_open' && token.map) {
      const task = /^\s*(?:[-+*]|\d+[.)])\s+\[([ xX])\]/.exec(lines[token.map[0]] ?? '');
      if (task) { tasks.total++; if (task[1].toLowerCase() === 'x') tasks.done++; }
    }
  }
  parser.renderer.rules.fence = parser.renderer.rules.code_block = (items, index) => {
    const fence = items[index].meta as Fence;
    return `<div data-osr-fence="${fence.id}"></div>`;
  };
  return {
    kind: 'markdown', source, parser, tokens, sections, fences, isOpenSpec, artifact, tasks,
    diagnostics: isOpenSpec ? diagnose(sections, tokens) : [],
    title: prepared.title ?? sections.find((section) => section.depth === 1)?.title ?? sections[0]?.title ?? 'Markdown document',
  };
}

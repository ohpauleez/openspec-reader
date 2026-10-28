import MarkdownIt from 'markdown-it';
import type { JavaDefinition } from './java-document';
import type { JavaBlock } from './java-comments';
import { element, markdownFragment } from './dom';
import { promoteJavadocSummary } from './javadoc-summary';

export interface JavadocTag { readonly tag: string; readonly name: string; readonly description: string }
export interface JavadocParts { readonly description: string; readonly tags: readonly JavadocTag[] }
const markdown = new MarkdownIt({ html: true, linkify: true });

/** Annotations inside code examples are example text, never Javadoc block tags. */
function trackExamples(line: string, context: { inline: number; pre: number }): void {
  for (let i = 0; i < line.length; i++) {
    if (context.inline) {
      if (line[i] === '{') context.inline++;
      else if (line[i] === '}') context.inline--;
    } else if (line.startsWith('{@', i)) { context.inline = 1; i++; }
    else if (line[i] === '<') {
      const pre = /^<(\/?)(?:pre)\b[^>]*>/i.exec(line.slice(i));
      if (pre) { context.pre = Math.max(0, context.pre + (pre[1] ? -1 : 1)); i += pre[0].length - 1; }
    }
  }
}

/** Read block tags without interpreting their text as Java or discarding unknown tags. */
export function javadocParts(body: string): JavadocParts {
  const description: string[] = [];
  const tags: { tag: string; name: string; description: string }[] = [];
  const context = { inline: 0, pre: 0 };
  for (const line of body.split('\n')) {
    const match = context.inline || context.pre ? null : /^\s*@([A-Za-z][\w]*)\b\s*(.*)$/.exec(line);
    if (match) {
      const named = /^(?:param|throws|exception|serialField)$/.test(match[1]) ? /^(\S+)\s*(.*)$/.exec(match[2]) : null;
      tags.push({ tag: match[1], name: named?.[1] ?? '', description: named?.[2] ?? match[2] });
    } else if (tags.length) tags[tags.length - 1].description += `\n${line}`;
    else description.push(line);
    trackExamples(line, context);
  }
  return { description: description.join('\n').trim(), tags };
}

/** Resolve only unambiguous in-file references; unknown/external symbols remain literal text. */
function referenceId(reference: string, definitions: readonly JavaDefinition[]): string | null {
  const member = reference.includes('#') ? reference.slice(reference.indexOf('#') + 1) : reference;
  const normalized = member.replace(/\s+/g, '');
  const exact = definitions.filter((definition) => definition.signature.replace(/\s+/g, '') === normalized);
  if (exact.length === 1) return exact[0].id;
  const name = member.replace(/\(.*$/, '').split('.').pop();
  const candidates = definitions.filter((definition) => definition.name === name);
  return candidates.length === 1 ? candidates[0].id : null;
}

/** Split a reference from its label without splitting spaces within a parameter list. */
function referenceAndLabel(value: string): { reference: string; label: string } {
  let depth = 0;
  let end = value.length;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    else if (value[i] === ')') depth--;
    else if (/\s/.test(value[i]) && depth === 0) { end = i; break; }
  }
  return { reference: value.slice(0, end), label: value.slice(end).trim() || value.slice(0, end) };
}

/** Expand fixed Javadoc inline tags with escaped text; sanitized prose handles permitted HTML. */
export function inlineJavadoc(source: string, definitions: readonly JavaDefinition[]): string {
  let result = '';
  let cursor = 0;
  for (; cursor < source.length;) {
    const start = source.indexOf('{@', cursor);
    if (start < 0) { result += source.slice(cursor); break; }
    result += source.slice(cursor, start);
    let depth = 1;
    let end = start + 2;
    for (; end < source.length && depth; end++) { if (source[end] === '{') depth++; else if (source[end] === '}') depth--; }
    if (depth) { result += markdown.utils.escapeHtml(source.slice(start)); break; }
    const match = /^(\w+)\s*([\s\S]*)$/.exec(source.slice(start + 2, end - 1));
    const tag = match?.[1] ?? '';
    const value = match?.[2] ?? '';
    const escaped = markdown.utils.escapeHtml(value);
    if (tag === 'code' || tag === 'value') result += `<code>${escaped}</code>`;
    else if (tag === 'literal') result += escaped;
    else if (tag === 'link' || tag === 'linkplain') {
      const { reference, label } = referenceAndLabel(value);
      const id = referenceId(reference, definitions);
      const text = markdown.utils.escapeHtml(label);
      result += id ? `<a href="#${id}">${tag === 'link' ? `<code>${text}</code>` : text}</a>` : `<code>${text}</code>`;
    } else if (tag === 'inheritDoc') result += '<em>Inherited documentation</em>';
    else result += `<code>${markdown.utils.escapeHtml(source.slice(start, end))}</code>`;
    cursor = end;
  }
  return result;
}

/** Render documentation paragraphs/lists/HTML and structured tags, retaining original source separately. */
export function renderJavadoc(block: JavaBlock, definitions: readonly JavaDefinition[], options: { readonly summary?: boolean } = {}): HTMLElement {
  const root = element('div', 'osr-javadoc-body');
  const parts = javadocParts(block.body);
  const description = element('div', 'osr-javadoc-description');
  description.append(markdownFragment(markdown.render(inlineJavadoc(parts.description, definitions))));
  if (options.summary !== false) promoteJavadocSummary(description);
  root.append(description);
  if (parts.tags.length) {
    const tags = element('dl', 'osr-javadoc-tags');
    for (const tag of parts.tags) {
      const title = element('dt', '', `@${tag.tag}`);
      if (tag.name) title.append(document.createTextNode(' '), element('code', '', tag.name));
      const description = element('dd');
      const text = tag.tag === 'see' && !tag.description.trimStart().startsWith('<') ? `{@link ${tag.description}}` : tag.description;
      description.append(markdownFragment(markdown.render(inlineJavadoc(text, definitions))));
      tags.append(title, description);
    }
    root.append(tags);
  }
  return root;
}

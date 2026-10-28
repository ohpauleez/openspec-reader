import { element } from './dom';

export interface SummaryText { readonly text: string; readonly literal: boolean }
const sentences = new Intl.Segmenter('en', { granularity: 'sentence' });

/** Locate a prose sentence without treating punctuation inside inline code as sentence endings. */
export function summaryLength(parts: readonly SummaryText[]): number {
  const text = parts.map((part) => part.literal ? part.text.replace(/[.!?]/g, 'x') : part.text).join('');
  for (const sentence of sentences.segment(text)) {
    const end = sentence.index + sentence.segment.trimEnd().length;
    if (/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|e\.g|i\.e)\.$/i.test(text.slice(0, end)) && end < text.trimEnd().length) continue;
    return end;
  }
  return text.trimEnd().length;
}

/** Promote the first sentence to a block while preserving sanitized inline markup and the remaining prose. */
export function promoteJavadocSummary(description: HTMLElement): void {
  const first = Array.from(description.childNodes).find((node) => node.textContent?.trim());
  if (!first) return;
  const container = first instanceof HTMLElement ? first.querySelector('p') ?? first : description;
  if (container.matches('pre, ul, ol, table, dl')) return;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  const length = summaryLength(nodes.map((node) => ({ text: node.data, literal: !!node.parentElement?.closest('code, kbd, samp') })));
  if (!length) return;
  let remaining = length;
  const range = document.createRange();
  range.setStart(container, 0);
  for (const node of nodes) {
    if (remaining <= node.length) { range.setEnd(node, remaining); break; }
    remaining -= node.length;
  }
  const summary = element('div', 'osr-javadoc-summary');
  summary.append(range.extractContents());
  if (container === description) description.prepend(summary);
  else {
    container.before(summary);
    if (!container.textContent?.trim() && !container.querySelector('img, pre, table')) container.remove();
  }
}

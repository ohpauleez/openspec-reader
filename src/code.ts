import { EditorState, Compartment } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { defaultHighlightStyle, syntaxHighlighting, foldGutter, foldKeymap, foldAll, unfoldAll, foldService, foldedRanges, foldEffect, unfoldEffect, ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { java } from '@codemirror/lang-java';
import { rust } from '@codemirror/lang-rust';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { sql } from '@codemirror/lang-sql';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { alloyLanguage } from './alloy';
import { alloyFoldRanges, commentGroupRange } from './folding';
import type { FoldRange } from './folding';
import type { Fence } from './document';
import { fingerprint } from './document';
import { element, button } from './dom';
import type { JavaDocument } from './java-document';
import { javaPresentation } from './java-presentation';
import type { JavaPresentation } from './java-presentation';
import { codeViewport } from './code-viewport';

export interface CodeHandle {
  readonly element: HTMLDetailsElement;
  readonly stateKey: string;
  mount(): void;
  ranges(): readonly FoldRange[];
  foldAll(): void;
  unfoldAll(): void;
  revealOffset(offset: number): void;
  setDark(dark: boolean): void;
  destroy(): void;
}
const MAX_EDITOR_CHARS = 250_000;

/** Choose structural language support; aliases preserve common Markdown fence conventions. */
export function languageExtension(name: string): Extension {
  switch (name) {
    case 'alloy': case 'als': return alloyLanguage;
    case 'ts': case 'typescript': case 'mts': case 'cts': return javascript({ typescript: true });
    case 'tsx': return javascript({ typescript: true, jsx: true });
    case 'js': case 'javascript': case 'mjs': case 'cjs': return javascript();
    case 'jsx': return javascript({ jsx: true });
    case 'java': case 'jml': return java();
    case 'rust': case 'rs': return rust();
    case 'python': case 'py': return python();
    case 'json': case 'jsonc': return json();
    case 'css': return css();
    case 'html': return html();
    case 'xml': case 'svg': return xml();
    case 'yaml': case 'yml': return yaml();
    case 'sql': return sql();
    case 'markdown': case 'md': return markdown();
    default: return [];
  }
}

/** Alloy has a lexical fold index; native parsers own other structures and validate line comments. */
export function structuralFolding(language: string, source: string): Extension {
  if (language === 'alloy' || language === 'als') {
    const ranges = alloyFoldRanges(source);
    return foldService.of((_state, from, to) => ranges.find((range) => range.from >= from && range.from <= to) ?? null);
  }
  return foldService.of((state, from, to) => {
    const first = /\S/.exec(source.slice(from, to));
    if (!first) return null;
    const node = syntaxTree(state).resolveInner(from + first.index + 1, 1);
    if (!/comment/i.test(node.name)) return null;
    return commentGroupRange(source, from, to);
  });
}

/** Read persisted folds only for this exact fence and report no more than 2,000 ranges. */
function readRanges(view: EditorView): FoldRange[] {
  const ranges: FoldRange[] = [];
  foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
    if (ranges.length < 2000) ranges.push({ from, to });
  });
  return ranges;
}

/** Create a read-only, lazily mounted code fence. Its text fallback is always available. */
export function createCodeView(fence: Fence, dark: boolean, saved: readonly FoldRange[], changed: () => void, presentation: 'fence' | 'document' = 'fence', javaModel?: JavaDocument): CodeHandle {
  const container = element('details', `osr-code${presentation === 'document' ? ' osr-code-document' : ''}`);
  container.open = true;
  container.dataset.codeId = fence.id;
  const summary = element('summary');
  summary.append(element('span', 'osr-code-language', fence.language || 'text'), element('span', 'osr-muted', `${fence.source.split('\n').length - (fence.source.endsWith('\n') ? 1 : 0)} lines · L${fence.line}`));
  const tools = element('div', 'osr-code-tools');
  const host = element('div', 'osr-editor');
  const fallback = element('pre', '', fence.source);
  host.append(fallback);
  container.append(summary, tools, host);
  const theme = new Compartment();
  let view: EditorView | null = null;
  const viewport = codeViewport(host, () => view?.requestMeasure());
  let isDark = dark;
  const annotations = javaModel ? javaPresentation(javaModel) : null;
  const mount = (): void => {
    if (view || fence.source.length > MAX_EDITOR_CHARS) return;
    const state = EditorState.create({ doc: fence.source, extensions: [
      languageExtension(fence.language), structuralFolding(fence.language, fence.source),
      lineNumbers(), highlightActiveLineGutter(), foldGutter(), syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorState.readOnly.of(true), EditorView.editable.of(false), EditorView.contentAttributes.of({ 'aria-label': `${fence.language || 'Text'} code, line ${fence.line}`, 'aria-readonly': 'true', tabindex: '0' }),
      keymap.of([...foldKeymap, ...searchKeymap, ...defaultKeymap]), highlightSelectionMatches(),
      theme.of(isDark ? oneDark : []), EditorView.updateListener.of((update) => { viewport.refresh(); if (update.transactions.some((transaction) => transaction.effects.length > 0)) changed(); }),
      annotations?.extension ?? [],
    ] });
    fallback.remove();
    view = new EditorView({ state, parent: host });
    viewport.refresh();
    const effects = saved.filter((range) => range.to <= fence.source.length).map((range) => foldEffect.of(range));
    if (effects.length) view.dispatch({ effects });
  };
  const fold = (): void => { mount(); if (view) { ensureSyntaxTree(view.state, view.state.doc.length, 200); foldAll(view); } };
  const unfold = (): void => { mount(); if (view) unfoldAll(view); };
  tools.append(button('Fold code', fold), button('Expand code', unfold),
    button('Copy', () => { void copySource(fence.source, tools); }));
  if (annotations) tools.append(presentationControl(annotations, () => { mount(); return view; }));
  if (fence.source.length > MAX_EDITOR_CHARS) tools.append(element('span', 'osr-muted', 'Large fence: plain text view'));
  let wasOpen = container.open;
  container.addEventListener('toggle', () => {
    if (container.open && !wasOpen) mount();
    if (container.open !== wasOpen) changed();
    wasOpen = container.open;
  });
  return {
    element: container, stateKey: `${fence.id}:${fingerprint(fence.source)}`, mount,
    ranges: () => view ? readRanges(view) : saved,
    foldAll: fold, unfoldAll: unfold,
    revealOffset: (offset) => {
      mount();
      if (!view) { revealPlainText(fallback, offset); return; }
      const position = Math.max(0, Math.min(offset, view.state.doc.length));
      const lineEnd = view.state.doc.lineAt(position).to;
      const effects = readRanges(view).filter((range) => range.from <= lineEnd && range.to >= position).map((range) => unfoldEffect.of(range));
      view.dispatch({ effects: [...effects, EditorView.scrollIntoView(position, { y: 'center' })], selection: { anchor: position } });
      view.requestMeasure();
      annotations?.reveal(view, position);
    },
    setDark: (next) => { isDark = next; view?.dispatch({ effects: theme.reconfigure(next ? oneDark : []) }); },
    destroy: () => { viewport.destroy(); view?.destroy(); },
  };
}

/** Expose the Java presentation mode without coupling the control to editor initialization. */
function presentationControl(presentation: JavaPresentation, editor: () => EditorView | null): HTMLButtonElement {
  const control = button('Docs & contracts: rendered', () => {
    const view = editor();
    if (!view) return;
    const rendered = presentation.toggle(view);
    control.textContent = `Docs & contracts: ${rendered ? 'rendered' : 'source'}`;
    control.setAttribute('aria-pressed', String(rendered));
  }, 'Toggle rendered Javadoc and OpenJML blocks');
  control.setAttribute('aria-pressed', 'true');
  return control;
}

/** Large-file fallbacks still navigate to source offsets using a DOM text range. */
function revealPlainText(pre: HTMLElement, offset: number): void {
  const text = pre.firstChild;
  if (!text || text.nodeType !== Node.TEXT_NODE) return;
  const position = Math.max(0, Math.min(offset, text.textContent?.length ?? 0));
  const range = document.createRange();
  range.setStart(text, position);
  range.setEnd(text, Math.min(position + 1, text.textContent?.length ?? 0));
  window.scrollBy({ top: range.getBoundingClientRect().top - window.innerHeight / 2, behavior: 'instant' });
}

/** Clipboard denial is reported inline without removing source or interrupting the reader. */
async function copySource(source: string, tools: HTMLElement): Promise<void> {
  const status = element('span', 'osr-muted');
  status.setAttribute('role', 'status');
  tools.querySelector('[role="status"]')?.remove();
  tools.append(status);
  try { await navigator.clipboard.writeText(source); status.textContent = 'Copied'; }
  catch { status.textContent = 'Copy unavailable; select the code to copy.'; }
}

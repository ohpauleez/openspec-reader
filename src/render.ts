import type { DocumentModel, Section } from './document';
import { fingerprint } from './document';
import type { Settings } from './settings';
import type { ReadingState } from './state';
import { element, button, markdownFragment, reveal } from './dom';
import { createCodeView } from './code';
import type { CodeHandle } from './code';
import { createDiagram } from './mermaid';
import type { DiagramHandle } from './mermaid';
import { attachSearch } from './search';
import { renderSource } from './source-render';
import type { SourceDocument } from './source-render';
import { codeViewport } from './code-viewport';
import { openExplorer, markdownLaunch } from './alloy-viz/launch';

type ReaderModel = DocumentModel | SourceDocument;

export interface Reader {
  readonly root: HTMLElement;
  snapshot(): ReadingState;
  destroy(): void;
}
interface SectionElements { readonly details: HTMLDetailsElement; readonly body: HTMLElement }
export interface SearchBlock { readonly element: HTMLElement; readonly text: string; readonly line: number; readonly revealOffset?: (offset: number) => void }

/** Construct the reader off-DOM. Markdown and SVG pass through separate sanitization boundaries. */
export function renderReader(model: ReaderModel, settings: Settings, saved: ReadingState | null, changed: () => void): Reader {
  const root = element('div', 'osr-root');
  root.dataset.width = settings.width;
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  const sections = new Map<string, SectionElements>();
  const targets = new Map<string, () => void>();
  const blocks: SearchBlock[] = [];
  const codes: CodeHandle[] = [];
  const diagrams: DiagramHandle[] = [];
  const article = element('article', `osr-document${model.kind === 'markdown' && model.isOpenSpec ? ' osr-spec' : ''}`);
  const raw = element('pre', 'osr-raw', model.source);
  raw.hidden = true;
  const rawViewport = codeViewport(raw, () => undefined);
  const sidebar = createSidebar(model, targets);
  const sameSource = saved?.fingerprint === fingerprint(model.source);
  if (model.kind !== 'markdown') codes.push(renderSource(model, article, targets, blocks, dark, sameSource ? saved : null, changed));
  else {
    renderDocument(model, article, sections, blocks);
    hydrateFences(model, article, blocks, codes, diagrams, dark, sameSource ? saved : null, changed);
    for (const [id, section] of sections) targets.set(id, () => reveal(section.details));
  }
  const sectionList = Array.from(sections.values()).map((section) => section.details);
  const foldables = [...sectionList, ...codes.map((code) => code.element)];
  for (const [id, section] of sections) {
    section.details.open = !saved?.closed.includes(id);
    section.details.addEventListener('toggle', changed);
  }
  for (const code of codes) code.element.open = !saved?.closed.includes(code.stateKey);
  const toolbar = createToolbar(model, settings, article, raw, sidebar, foldables, root, codes, diagrams);
  const main = element('main', 'osr-main');
  main.append(toolbar, article, raw);
  root.append(sidebar, main);
  const showRendered = (): void => {
    article.hidden = false;
    raw.hidden = true;
    const toggle = toolbar.querySelector('[data-view-toggle]')!;
    toggle.textContent = 'Source';
    toggle.setAttribute('aria-pressed', 'false');
  };
  const search = attachSearch(sidebar, blocks, showRendered);
  const navigate = (): void => navigateHash(targets, showRendered);
  root.addEventListener('click', (event) => handleAnchor(event, targets, showRendered));
  window.addEventListener('hashchange', navigate);
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) {
      codes.find((code) => code.element === entry.target)?.mount();
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '600px' });
  for (const code of codes) observer.observe(code.element);
  requestAnimationFrame(() => {
    if (location.hash) navigate();
    else if (sameSource && saved) window.scrollTo(0, saved.scrollY);
    for (const diagram of diagrams) void diagram.render(dark);
  });
  return {
    root,
    snapshot: () => ({ version: 1, fingerprint: fingerprint(model.source), scrollY: window.scrollY,
      closed: [...Array.from(sections).filter(([, value]) => !value.details.open).map(([id]) => id), ...codes.filter((code) => !code.element.open).map((code) => code.stateKey)].slice(0, 2000),
      code: Object.fromEntries(codes.map((code) => [code.stateKey, code.ranges()])),
    }),
    destroy: () => { observer.disconnect(); rawViewport.destroy(); search(); window.removeEventListener('hashchange', navigate); for (const code of codes) code.destroy(); for (const diagram of diagrams) diagram.destroy(); },
  };
}

/** Render top-level headings as nested details; blockquote/list headings retain ordinary Markdown semantics. */
function renderDocument(model: DocumentModel, article: HTMLElement, sections: Map<string, SectionElements>, blocks: SearchBlock[]): void {
  let cursor = 0;
  let parent = article;
  const flush = (end: number): void => {
    if (end <= cursor) return;
    const tokens = model.tokens.slice(cursor, end);
    const chunk = element('div', 'osr-chunk');
    chunk.append(markdownFragment(model.parser.renderer.render(tokens, model.parser.options, {})));
    parent.append(chunk);
    // Index prose blocks separately so search reveals only the needed section.
    const candidates = chunk.querySelectorAll<HTMLElement>('p, li, th, td, pre');
    for (const candidate of candidates) {
      if (candidate.querySelector('p, li, pre')) continue;
      blocks.push({ element: candidate, text: candidate.textContent ?? '', line: (tokens.find((token) => token.map)?.map?.[0] ?? 0) + 1 });
    }
  };
  for (const section of model.sections) {
    flush(section.tokenIndex);
    const elements = createSection(model, section);
    sections.set(section.id, elements);
    parent = section.parentId ? sections.get(section.parentId)!.body : article;
    parent.append(elements.details);
    parent = elements.body;
    blocks.push({ element: elements.details.querySelector('summary')!, text: section.title, line: section.line });
    cursor = section.tokenIndex + 3;
  }
  flush(model.tokens.length);
}

/** A section owns an immutable heading identity and a foldable body. */
function createSection(model: DocumentModel, section: Section): SectionElements {
  const details = element('details', `osr-section osr-${section.kind}`);
  details.id = section.id;
  details.dataset.sourceLine = String(section.line);
  details.open = true;
  if (section.kind === 'delta') details.dataset.delta = section.title.split(' ')[0].toLowerCase();
  const summary = element('summary');
  const heading = document.createElement(`h${section.depth}`);
  const children = model.tokens[section.tokenIndex + 1]?.children ?? [];
  heading.append(markdownFragment(model.parser.renderer.renderInline(children, model.parser.options, {})));
  if (section.identity) heading.append(element('span', 'osr-id-label', section.kind));
  const permalink = element('a', 'osr-permalink', '#');
  permalink.href = `#${section.id}`;
  permalink.title = `Link to ${section.title}`;
  permalink.setAttribute('aria-label', permalink.title);
  summary.append(heading, permalink);
  const body = element('div', 'osr-section-body');
  details.append(summary, body);
  return { details, body };
}

/** Replace trusted fence placeholders; all user code is passed as text to its renderer. */
function hydrateFences(model: DocumentModel, article: HTMLElement, blocks: SearchBlock[], codes: CodeHandle[], diagrams: DiagramHandle[], dark: boolean, saved: ReadingState | null, changed: () => void): void {
  for (const fence of model.fences) {
    const placeholder = article.querySelector(`[data-osr-fence="${fence.id}"]`);
    if (!placeholder) continue;
    if (fence.language === 'mermaid' || fence.language === 'mmd') {
      const diagram = createDiagram(fence);
      diagrams.push(diagram);
      placeholder.replaceWith(diagram.element);
      blocks.push({ element: diagram.element, text: fence.source, line: fence.line });
    } else {
      const key = `${fence.id}:${fingerprint(fence.source)}`;
      const code = createCodeView(fence, dark, saved?.code[key] ?? [], changed);
      codes.push(code);
      placeholder.replaceWith(code.element);
      if (fence.language === 'alloy' || fence.language === 'als') code.element.querySelector('.osr-code-tools')!.append(button('Explore model', () => { void openExplorer(markdownLaunch(model, fence.id)); }));
      blocks.push({ element: code.element, text: fence.source, line: fence.line, revealOffset: code.revealOffset });
    }
  }
}

/** Provide artifact-aware navigation and optional local-only structural diagnostics. */
function createSidebar(model: ReaderModel, targets: Map<string, () => void>): HTMLElement {
  const sidebar = element('aside', 'osr-sidebar');
  const brand = element('div', 'osr-brand', '◈ OpenSpec Reader');
  const meta = element('div', 'osr-artifact', model.kind !== 'markdown' || model.isOpenSpec ? model.artifact : 'Markdown');
  const title = element('div', 'osr-sidebar-title', model.title);
  const navigation = element('nav', 'osr-outline');
  navigation.setAttribute('aria-label', model.kind === 'alloy' ? 'Alloy definitions' : model.kind === 'java' ? 'Java definitions' : 'Document outline');
  for (const section of model.kind !== 'markdown' ? model.definitions : model.sections) {
    const link = element('a', `osr-outline-${section.kind}`, section.title);
    link.href = `#${section.id}`;
    link.style.paddingInlineStart = `${12 + (section.depth - 1) * 12}px`;
    link.title = `${section.title} · line ${section.line}`;
    navigation.append(link);
  }
  sidebar.append(brand, meta, title);
  if (model.kind === 'markdown' && model.tasks.total) {
    const progress = element('progress');
    progress.max = model.tasks.total;
    progress.value = model.tasks.done;
    progress.setAttribute('aria-label', 'Task completion');
    sidebar.append(element('p', 'osr-task-progress', `${model.tasks.done} / ${model.tasks.total} tasks complete`), progress);
  }
  sidebar.append(element('div', 'osr-search-slot'), element('h2', 'osr-nav-label', model.kind !== 'markdown' ? 'DEFINITIONS' : 'CONTENTS'), navigation);
  if (model.kind !== 'markdown') {
    if (!model.definitions.length) navigation.append(element('p', 'osr-muted', 'No definitions found.'));
    return sidebar;
  }
  const checks = element('details', 'osr-checks');
  checks.dataset.diagnostics = '';
  checks.append(element('summary', '', `Structural checks · ${model.diagnostics.length}`));
  if (!model.diagnostics.length) checks.append(element('p', 'osr-muted', 'No structural findings. This is not a verification result.'));
  for (const diagnostic of model.diagnostics) {
    const finding = button(`L${diagnostic.line} · ${diagnostic.message}`, () => {
      targets.get(diagnostic.sectionId)?.();
    });
    finding.className = 'osr-finding';
    checks.append(finding);
  }
  sidebar.append(checks);
  return sidebar;
}

/** Toolbar actions only change presentation; they never modify source documents. */
function createToolbar(model: ReaderModel, settings: Settings, article: HTMLElement, raw: HTMLElement, sidebar: HTMLElement, foldables: HTMLDetailsElement[], root: HTMLElement, codes: CodeHandle[], diagrams: DiagramHandle[]): HTMLElement {
  const toolbar = element('header', 'osr-toolbar');
  const toggle = button('Source', () => {
    const showRaw = raw.hidden;
    raw.hidden = !showRaw;
    article.hidden = showRaw;
    toggle.setAttribute('aria-pressed', String(showRaw));
    toggle.textContent = showRaw ? 'Rendered' : 'Source';
  });
  toggle.dataset.viewToggle = '';
  toggle.setAttribute('aria-pressed', 'false');
  const theme = button('◐ Theme', () => {
    const dark = root.dataset.theme !== 'dark';
    root.dataset.theme = dark ? 'dark' : 'light';
    for (const code of codes) code.setDark(dark);
    for (const diagram of diagrams) void diagram.render(dark);
  });
  const checks = sidebar.querySelector<HTMLElement>('[data-diagnostics]');
  if (checks) checks.hidden = !settings.diagnostics || model.kind !== 'markdown' || !model.isOpenSpec;
  const fold = (closed: boolean): void => {
    if (model.kind !== 'markdown') for (const code of codes) { code.element.open = true; if (closed) code.foldAll(); else code.unfoldAll(); }
    else for (const item of foldables) item.open = !closed;
  };
  toolbar.append(button('☰ Outline', () => { const hidden = sidebar.classList.toggle('osr-sidebar-hidden'); toolbar.querySelector('[data-outline-toggle]')?.setAttribute('aria-expanded', String(!hidden)); }),
    element('span', 'osr-toolbar-artifact', model.kind !== 'markdown' || model.isOpenSpec ? model.artifact : 'Markdown'),
    button(model.kind !== 'markdown' ? 'Collapse definitions' : 'Collapse sections', () => fold(true)),
    button(model.kind !== 'markdown' ? 'Expand definitions' : 'Expand sections', () => fold(false)), toggle, theme);
  toolbar.querySelector('button')!.dataset.outlineToggle = '';
  toolbar.querySelector('button')!.setAttribute('aria-expanded', 'true');
  return toolbar;
}

/** Only same-document fragments are intercepted; relative files retain browser navigation semantics. */
function handleAnchor(event: MouseEvent, targets: Map<string, () => void>, showRendered: () => void): void {
  const target = event.target instanceof Element ? event.target.closest('a') : null;
  if (!target || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const url = new URL(target.href, location.href);
  if (url.href.split('#')[0] !== location.href.split('#')[0] || !url.hash) return;
  let id: string;
  try { id = decodeURIComponent(url.hash.slice(1)); } catch { return; }
  const navigate = targets.get(id);
  if (!navigate) return;
  event.preventDefault();
  event.stopPropagation();
  showRendered();
  history.pushState(null, '', url.hash);
  navigate();
}

/** Decode fragments defensively; unknown fragments leave the current reading position intact. */
function navigateHash(targets: Map<string, () => void>, showRendered: () => void): void {
  try {
    const navigate = targets.get(decodeURIComponent(location.hash.slice(1)));
    if (navigate) { showRendered(); navigate(); }
  } catch { /* malformed URL fragment */ }
}

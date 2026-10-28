import browser from 'webextension-polyfill';
import { documentKind, isTextDocument } from './detection';
import { parseDocument } from './document';
import { loadSettings } from './settings';
import { loadReadingState, saveReadingState } from './state';
import { renderReader } from './render';
import type { Reader } from './render';
import { parseAlloyDocument } from './alloy-document';
import { parseJavaDocument } from './java-document';

const MAX_SOURCE_CHARS = 8 * 1024 * 1024;

/** Capture Firefox's text document before rendering. Duplicate injections and non-text pages are no-ops. */
async function start(): Promise<void> {
  const kind = documentKind(location.href);
  if (!kind || !isTextDocument(document.contentType) || document.documentElement.dataset.osrReader) return;
  const pre = document.body.querySelector('pre');
  if (!pre) return;
  const source = pre.textContent ?? '';
  if (source.length > MAX_SOURCE_CHARS) return;
  document.documentElement.dataset.osrReader = 'loading';
  try {
    const [settings, saved] = await Promise.all([loadSettings(), loadReadingState()]);
    const model = kind === 'alloy' ? parseAlloyDocument(source, location.href) : kind === 'java' ? parseJavaDocument(source, location.href) : parseDocument(source, location.href, settings.specMode, settings.keywords);
    let reader: Reader | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = (): void => { if (settings.remember && reader) void saveReadingState(reader.snapshot()); };
    const changed = (): void => { clearTimeout(timer); if (reader) timer = setTimeout(save, 350); };
    reader = renderReader(model, settings, settings.remember ? saved : null, changed);
    document.body.replaceChildren(reader.root);
    document.body.className = 'osr-page';
    document.title = model.title;
    document.documentElement.dataset.osrReader = 'ready';
    window.addEventListener('scroll', changed, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('pagehide', (event) => {
      clearTimeout(timer);
      save();
      // BFCache restores the same DOM and editor objects when following local links back.
      if (!event.persisted) reader?.destroy();
    });
    browser.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.settings) { save(); location.reload(); } });
  } catch (error) {
    delete document.documentElement.dataset.osrReader;
    console.error('OpenSpec Reader could not render this document:', error);
  }
}

void start();

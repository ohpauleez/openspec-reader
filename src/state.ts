import browser from 'webextension-polyfill';
import type { FoldRange } from './folding';

export interface ReadingState {
  readonly version: 1;
  readonly fingerprint: string;
  readonly scrollY: number;
  readonly closed: readonly string[];
  readonly code: Readonly<Record<string, readonly FoldRange[]>>;
}
const MAX_DOCUMENTS = 40;
const MAX_ENTRIES = 2000;

/** Treat stored data as untrusted; cap collection sizes before allocating editor state. */
export function validateReadingState(value: unknown): ReadingState | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || typeof v.fingerprint !== 'string' || typeof v.scrollY !== 'number' || !Number.isFinite(v.scrollY)) return null;
  const closed = Array.isArray(v.closed) ? v.closed.filter((id): id is string => typeof id === 'string').slice(0, MAX_ENTRIES) : [];
  const code: Record<string, FoldRange[]> = {};
  if (v.code && typeof v.code === 'object') {
    let remaining = MAX_ENTRIES;
    for (const [id, ranges] of Object.entries(v.code).slice(0, MAX_ENTRIES)) {
      if (!Array.isArray(ranges) || remaining <= 0) continue;
      code[id] = ranges.slice(0, remaining).filter((range): range is FoldRange =>
        !!range && Number.isSafeInteger(range.from) && Number.isSafeInteger(range.to) && range.from >= 0 && range.to > range.from);
      remaining -= code[id].length;
    }
  }
  return { version: 1, fingerprint: v.fingerprint, scrollY: Math.max(0, v.scrollY), closed, code };
}

/** Exclude fragments so heading navigation shares one document's state. */
function stateKey(): string {
  return `reading:${location.href.split('#')[0]}`;
}

/** Failure to load state is recoverable; no source content is stored. */
export async function loadReadingState(): Promise<ReadingState | null> {
  try { return validateReadingState((await browser.storage.local.get(stateKey()))[stateKey()]); }
  catch { return null; }
}

/** One storage entry per document avoids cross-tab lost updates; prune the oldest entries. */
export async function saveReadingState(state: ReadingState): Promise<void> {
  try {
    const key = stateKey();
    const bounded = validateReadingState(state);
    if (!bounded) return;
    await browser.storage.local.set({ [key]: { ...bounded, updatedAt: Date.now() } });
    const all = await browser.storage.local.get(null);
    const keys = Object.keys(all).filter((name) => name.startsWith('reading:'));
    keys.sort((a, b) => updatedAt(all[b]) - updatedAt(all[a]));
    if (keys.length > MAX_DOCUMENTS) await browser.storage.local.remove(keys.slice(MAX_DOCUMENTS));
  } catch (error) { console.debug('Reading state could not be saved:', error); }
}

/** Invalid timestamps sort as oldest, allowing corrupt cache entries to be pruned. */
function updatedAt(value: unknown): number {
  if (!value || typeof value !== 'object' || !('updatedAt' in value)) return 0;
  return typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : 0;
}

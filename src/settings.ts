import browser from 'webextension-polyfill';

export interface Settings {
  readonly theme: 'auto' | 'light' | 'dark';
  readonly specMode: 'auto' | 'always' | 'never';
  readonly diagnostics: boolean;
  readonly keywords: boolean;
  readonly remember: boolean;
  readonly width: 'comfortable' | 'wide';
}
export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto', specMode: 'auto', diagnostics: true, keywords: true,
  remember: true, width: 'comfortable',
};

/** Validate persisted preferences; older or corrupt keys fall back individually. */
export function validateSettings(value: unknown): Settings {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    theme: v.theme === 'light' || v.theme === 'dark' ? v.theme : 'auto',
    specMode: v.specMode === 'always' || v.specMode === 'never' ? v.specMode : 'auto',
    diagnostics: typeof v.diagnostics === 'boolean' ? v.diagnostics : true,
    keywords: typeof v.keywords === 'boolean' ? v.keywords : true,
    remember: typeof v.remember === 'boolean' ? v.remember : true,
    width: v.width === 'wide' ? 'wide' : 'comfortable',
  };
}

/** Storage failure leaves the reader usable with defaults. */
export async function loadSettings(): Promise<Settings> {
  try { return validateSettings((await browser.storage.local.get('settings')).settings); }
  catch { return DEFAULT_SETTINGS; }
}

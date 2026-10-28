import browser from 'webextension-polyfill';
import { loadSettings, validateSettings } from './settings';
import { attachLocalPermission } from './permissions';

/** Load validated preferences into controls; only recognized keys are persisted. */
async function setup(): Promise<void> {
  attachLocalPermission();
  const form = document.querySelector<HTMLFormElement>('#settings')!;
  const status = document.querySelector<HTMLElement>('#status')!;
  const settings = await loadSettings();
  for (const [key, value] of Object.entries(settings)) {
    const control = form.elements.namedItem(key);
    if (control instanceof HTMLInputElement) control.checked = value === true;
    if (control instanceof HTMLSelectElement) control.value = String(value);
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values: Record<string, unknown> = Object.fromEntries(new FormData(form));
    for (const name of ['diagnostics', 'keywords', 'remember']) values[name] = (form.elements.namedItem(name) as HTMLInputElement).checked;
    void browser.storage.local.set({ settings: validateSettings(values) }).then(() => { status.textContent = 'Saved. Open reader tabs will refresh.'; }, () => { status.textContent = 'Settings could not be saved.'; });
  });
  document.querySelector('#clear-state')!.addEventListener('click', () => {
    void browser.storage.local.get(null).then(async (all) => {
      await browser.storage.local.remove(Object.keys(all).filter((key) => key.startsWith('reading:')));
      status.textContent = 'Reading state cleared.';
    }).catch(() => { status.textContent = 'Reading state could not be cleared.'; });
  });
}
void setup();

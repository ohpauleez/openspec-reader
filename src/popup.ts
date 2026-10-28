import browser from 'webextension-polyfill';
import { attachLocalPermission } from './permissions';

/** Origin access is explicit and optional; local file access is the default foundation. */
async function setup(): Promise<void> {
  attachLocalPermission();
  document.querySelector('#settings')!.addEventListener('click', () => { void browser.runtime.openOptionsPage(); });
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/.test(tab.url)) return;
  const origin = `${new URL(tab.url).origin}/*`;
  const grant = document.querySelector<HTMLButtonElement>('#grant')!;
  grant.hidden = false;
  grant.addEventListener('click', () => {
    void browser.permissions.request({ origins: [origin] }).then(async (allowed) => {
      document.querySelector('#status')!.textContent = allowed ? 'Access granted.' : 'Access was not granted.';
      if (allowed && tab.id) await browser.tabs.reload(tab.id);
    }).catch(() => { document.querySelector('#status')!.textContent = 'Website access could not be granted.'; });
  });
}
void setup();

import browser from 'webextension-polyfill';
import { isReaderUrl } from './detection';

/** Injection is idempotent in the content entry point; missing host access is an expected no-op. */
async function inject(tabId: number, url: string): Promise<void> {
  if (!isReaderUrl(url)) return;
  try {
    await browser.scripting.insertCSS({ target: { tabId }, files: ['reader.css'] });
    await browser.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch (error) {
    console.debug('OpenSpec Reader could not access this tab:', error);
  }
}

browser.tabs.onUpdated.addListener((tabId, change, tab) => {
  // Static content scripts cover local files; website injection follows optional origin access.
  if (change.status === 'complete' && tab.url && !tab.url.startsWith('file:')) void inject(tabId, tab.url);
});
browser.runtime.onInstalled.addListener(() => {
  void browser.tabs.query({}).then((tabs) => {
    for (const tab of tabs) if (tab.id && tab.url) void inject(tab.id, tab.url);
  });
});

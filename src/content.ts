import browser from 'webextension-polyfill';
import { isReaderUrl, isTextDocument } from './detection';

// Packaged ESM chunks keep Mermaid and language engines below Firefox's per-file limit.
if (isReaderUrl(location.href) && isTextDocument(document.contentType)) {
  const readerUrl = browser.runtime.getURL('reader.js');
  void import(readerUrl).catch((error: unknown) => console.error('OpenSpec Reader could not load:', error));
}

import { element, button, reveal } from './dom';
import type { SearchBlock } from './render';

/** Search indexes prose and original fence text, including folded content; results are bounded. */
export function attachSearch(sidebar: HTMLElement, blocks: readonly SearchBlock[], showRendered: () => void): () => void {
  const slot = sidebar.querySelector('.osr-search-slot')!;
  const input = element('input', 'osr-search');
  input.type = 'search';
  input.placeholder = 'Search this document…';
  input.setAttribute('aria-label', 'Search this document');
  const status = element('div', 'osr-search-status');
  status.setAttribute('role', 'status');
  const results = element('div', 'osr-search-results');
  slot.append(input, status, results);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const search = (): void => {
    results.replaceChildren();
    const query = input.value.trim().toLocaleLowerCase();
    if (!query) { status.textContent = ''; return; }
    let count = 0;
    for (const block of blocks) {
      const index = block.text.toLocaleLowerCase().indexOf(query);
      if (index < 0) continue;
      count++;
      if (count > 100) continue;
      const excerpt = block.text.slice(Math.max(0, index - 30), index + query.length + 70).replace(/\s+/g, ' ');
      const result = button(excerpt, () => { showRendered(); reveal(block.element); block.revealOffset?.(index); });
      result.title = `Near source line ${block.line}`;
      results.append(result);
    }
    status.textContent = `${count} matching blocks${count > 100 ? ' · showing first 100' : ''}`;
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    // Clearing must not move outline links after the user has already started clicking one.
    if (!input.value.trim()) search();
    else timer = setTimeout(search, 120);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { clearTimeout(timer); search(); results.querySelector('button')?.click(); }
    if (event.key === 'Escape') { clearTimeout(timer); input.value = ''; search(); input.blur(); }
  });
  const shortcut = (event: KeyboardEvent): void => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault(); sidebar.classList.remove('osr-sidebar-hidden'); input.focus(); input.select();
    }
  };
  window.addEventListener('keydown', shortcut);
  return () => { clearTimeout(timer); window.removeEventListener('keydown', shortcut); };
}

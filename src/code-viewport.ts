import { element } from './dom';

export interface CodeViewport { refresh(): void; destroy(): void }

/** Keep prose cards at readable viewport width and offer a floating, synchronized horizontal scrollbar. */
export function codeViewport(host: HTMLElement, measured: () => void): CodeViewport {
  const control = element('input', 'osr-floating-code-scroll');
  control.type = 'range';
  control.min = '0';
  control.step = '1';
  control.hidden = true;
  control.title = 'Scroll code horizontally';
  control.setAttribute('aria-label', control.title);
  host.append(control);
  let scroller: HTMLElement | null = null;
  let content: HTMLElement | null = null;
  let frame = 0;
  let disposed = false;
  const update = (): void => {
    frame = 0;
    if (disposed) return;
    const next = host.matches('pre') ? host : host.querySelector<HTMLElement>('.cm-scroller') ?? host.querySelector('pre');
    if (next !== scroller) {
      scroller?.removeEventListener('scroll', schedule);
      if (scroller) observer.unobserve(scroller);
      if (content) observer.unobserve(content);
      scroller = next;
      content = host.querySelector<HTMLElement>('.cm-content');
      scroller?.addEventListener('scroll', schedule, { passive: true });
      if (scroller) observer.observe(scroller);
      if (content) observer.observe(content);
    }
    if (!scroller || !scroller.getClientRects().length) { control.hidden = true; return; }
    const gutter = host.querySelector('.cm-gutters')?.getBoundingClientRect().width ?? 0;
    const width = Math.max(0, scroller.clientWidth - gutter - 24);
    const readable = `${Math.floor(width)}px`;
    if (width > 0 && host.style.getPropertyValue('--osr-code-readable-width') !== readable) {
      host.style.setProperty('--osr-code-readable-width', readable);
      host.style.setProperty('--osr-code-gutter-width', `${gutter}px`);
      measured();
    }
    const rect = scroller.getBoundingClientRect();
    const maximum = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const toolbarBottom = host.closest('.osr-main')?.querySelector('.osr-toolbar')?.getBoundingClientRect().bottom ?? 0;
    // When the native scrollbar is already visible there is no need to duplicate it.
    control.hidden = maximum <= 1 || rect.top >= innerHeight - 28 || rect.bottom <= innerHeight - 8 || rect.bottom <= toolbarBottom + 28;
    if (control.hidden) return;
    const left = Math.max(8, rect.left + gutter + 4);
    const visibleWidth = Math.max(0, Math.min(innerWidth - 8, rect.right) - left - 4);
    if (visibleWidth < 40) { control.hidden = true; return; }
    control.style.left = `${left}px`;
    control.style.width = `${visibleWidth}px`;
    control.style.setProperty('--osr-scroll-thumb-width', `${Math.max(24, Math.min(visibleWidth - 12, visibleWidth * scroller.clientWidth / scroller.scrollWidth))}px`);
    control.max = String(maximum);
    control.value = String(scroller.scrollLeft);
    control.setAttribute('aria-valuetext', `${Math.round(scroller.scrollLeft)} of ${maximum} pixels`);
  };
  const schedule = (): void => { if (!frame && !disposed) frame = requestAnimationFrame(update); };
  const observer = new ResizeObserver(schedule);
  observer.observe(host);
  control.addEventListener('input', () => { if (scroller) { scroller.scrollLeft = Number(control.value); schedule(); } });
  window.addEventListener('scroll', schedule, { passive: true, capture: true });
  window.addEventListener('resize', schedule);
  schedule();
  return { refresh: schedule, destroy: () => {
    disposed = true; cancelAnimationFrame(frame); observer.disconnect();
    scroller?.removeEventListener('scroll', schedule);
    window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); control.remove();
  } };
}

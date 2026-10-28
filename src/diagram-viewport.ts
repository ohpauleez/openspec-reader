export interface DiagramViewport {
  attach(svg: SVGSVGElement): void;
  zoomBy(factor: number): void;
  reset(): void;
  destroy(): void;
}
interface Point { readonly x: number; readonly y: number }
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

/** Size SVGs explicitly: CSS zoom on a percentage-width SVG otherwise cancels out in Firefox. */
export function createDiagramViewport(viewport: HTMLElement, canvas: HTMLElement, output: HTMLOutputElement): DiagramViewport {
  let svg: SVGSVGElement | null = null;
  let naturalWidth = 1;
  let naturalHeight = 1;
  let fittedWidth = 1;
  let zoom = 1;
  const resize = (): void => {
    if (!svg || viewport.clientWidth === 0) return;
    const style = getComputedStyle(viewport);
    const available = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    fittedWidth = Math.min(naturalWidth, Math.max(1, available));
    const width = fittedWidth * zoom;
    const height = width * naturalHeight / naturalWidth;
    canvas.style.width = svg.style.width = `${width}px`;
    canvas.style.height = svg.style.height = `${height}px`;
  };
  const setZoom = (value: number, anchor: Point): void => {
    if (!svg || !Number.isFinite(value)) return;
    const previousWidth = fittedWidth * zoom;
    const x = (viewport.scrollLeft + anchor.x - canvas.offsetLeft) / previousWidth;
    const y = (viewport.scrollTop + anchor.y - canvas.offsetTop) / previousWidth;
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
    resize();
    viewport.scrollLeft = canvas.offsetLeft + x * fittedWidth * zoom - anchor.x;
    viewport.scrollTop = canvas.offsetTop + y * fittedWidth * zoom - anchor.y;
    output.value = `${Math.round(zoom * 100)}%`;
  };
  const center = (): Point => ({ x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 });
  const wheel = (event: WheelEvent): void => {
    if (!svg || !event.shiftKey || event.ctrlKey || event.metaKey) return;
    const delta = event.deltaY || event.deltaX;
    if (!delta) return;
    event.preventDefault();
    const pixels = delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
    const rect = viewport.getBoundingClientRect();
    setZoom(zoom * Math.exp(-Math.max(-200, Math.min(200, pixels)) * 0.002), { x: event.clientX - rect.left - viewport.clientLeft, y: event.clientY - rect.top - viewport.clientTop });
  };
  viewport.addEventListener('wheel', wheel, { passive: false });
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  return {
    attach: (next) => {
      svg = next;
      const box = next.viewBox.baseVal;
      naturalWidth = box.width > 0 ? box.width : Math.max(1, next.getBoundingClientRect().width);
      naturalHeight = box.height > 0 ? box.height : Math.max(1, next.getBoundingClientRect().height);
      resize();
    },
    zoomBy: (factor) => { if (factor > 0) setZoom(zoom * factor, center()); },
    reset: () => { setZoom(1, center()); viewport.scrollTo(0, 0); },
    destroy: () => { observer.disconnect(); viewport.removeEventListener('wheel', wheel); },
  };
}

import DOMPurify from 'dompurify';
import { element, button } from './dom';
import type { Fence } from './document';
import { createDiagramViewport } from './diagram-viewport';

export interface DiagramHandle {
  readonly element: HTMLElement;
  render(dark: boolean): Promise<void>;
  destroy(): void;
}
// Mermaid has process-global configuration; serialize all initialization/render pairs.
let renderQueue: Promise<void> = Promise.resolve();
let diagramId = 0;

/** Render diagrams independently; errors preserve their source and do not break other fences. */
export function createDiagram(fence: Fence): DiagramHandle {
  const root = element('section', 'osr-diagram');
  const tools = element('div', 'osr-code-tools');
  const viewport = element('div', 'osr-diagram-viewport');
  const canvas = element('div', 'osr-diagram-canvas');
  viewport.append(canvas);
  const source = element('details', 'osr-code osr-diagram-source');
  source.append(element('summary', '', 'Mermaid source'), element('pre', '', fence.source));
  const status = element('p', 'osr-muted', 'Diagram loading…');
  status.setAttribute('role', 'status');
  const scale = element('output', 'osr-diagram-scale');
  scale.value = '100%';
  scale.setAttribute('aria-label', 'Diagram zoom');
  const controller = createDiagramViewport(viewport, canvas, scale);
  tools.append(element('strong', '', 'Mermaid'), button('−', () => controller.zoomBy(1 / 1.2), 'Zoom out'), button('+', () => controller.zoomBy(1.2), 'Zoom in'), button('Reset', controller.reset), scale, element('span', 'osr-muted', 'Shift + wheel to zoom · drag to pan'));
  root.append(tools, status, viewport, source);
  installPan(viewport);
  return { element: root, destroy: controller.destroy, render: (dark) => {
    const task = renderQueue.then(async () => {
      if (fence.source.length > 100_000) { status.textContent = 'Diagram exceeds the 100,000 character limit. Source is available below.'; source.open = true; return; }
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default',
          layout: 'dagre', maxTextSize: 100_000, suppressErrorRendering: true,
          secure: ['securityLevel', 'startOnLoad', 'maxTextSize', 'layout', 'themeCSS', 'htmlLabels'],
          htmlLabels: false, flowchart: { htmlLabels: false },
        });
        const result = await renderIsolated(mermaid, fence.source);
        const fragment = DOMPurify.sanitize(result.svg, { RETURN_DOM_FRAGMENT: true, USE_PROFILES: { svg: true, svgFilters: true, html: true }, FORBID_TAGS: ['script', 'iframe', 'form', 'input'] });
        canvas.replaceChildren(fragment);
        const svg = canvas.querySelector('svg');
        if (svg) controller.attach(svg);
        status.textContent = '';
      } catch (error) {
        status.title = error instanceof Error ? error.stack ?? '' : '';
        status.textContent = `Diagram could not be rendered: ${error instanceof Error ? error.message : 'Invalid Mermaid source'}`;
        source.open = true;
      }
    });
    renderQueue = task.catch(() => undefined);
    return task;
  } };
}

/** Use an explicit staging container so Mermaid serializes a complete, namespaced SVG. */
async function renderIsolated(mermaid: typeof import('mermaid')['default'], source: string): Promise<{ svg: string }> {
  const staging = element('div', 'osr-mermaid-staging');
  staging.setAttribute('aria-hidden', 'true');
  document.body.append(staging);
  try { return await mermaid.render(`osr-mermaid-${diagramId++}`, source, staging); }
  finally { staging.remove(); }
}

/** Pointer capture bounds drag state to this viewport; cancellation always releases it. */
function installPan(viewport: HTMLElement): void {
  let drag: { x: number; y: number; left: number; top: number } | null = null;
  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!drag) return;
    viewport.scrollLeft = drag.left - (event.clientX - drag.x);
    viewport.scrollTop = drag.top - (event.clientY - drag.y);
  });
  viewport.addEventListener('pointerup', () => { drag = null; });
  viewport.addEventListener('pointercancel', () => { drag = null; });
  viewport.addEventListener('lostpointercapture', () => { drag = null; });
}

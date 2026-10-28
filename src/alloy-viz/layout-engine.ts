import ELK from 'elkjs/lib/elk-api';
import type { ElkNode } from 'elkjs/lib/elk-api';

/** Run bounded layout work off the UI thread; abort/timeout destroys the worker and rejects its pending result. */
export async function layoutInWorker(graph: ElkNode, url: string, signal: AbortSignal): Promise<ElkNode> {
  const elk = new ELK({ workerUrl: url, algorithms: ['layered', 'force'] });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => undefined as void;
  try {
    return await new Promise<ElkNode>((resolve, reject) => {
      abort = () => reject(new DOMException('Layout replaced', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      timer = setTimeout(() => reject(new Error('Graph layout timed out. Hide some relations or use Layout current state.')), 15_000);
      void elk.layout(graph).then(resolve, reject);
    });
  } finally { if (timer) clearTimeout(timer); signal.removeEventListener('abort', abort); elk.terminateWorker(); }
}

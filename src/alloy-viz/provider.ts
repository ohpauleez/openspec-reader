import browser from 'webextension-polyfill';
import type { EngineResult } from './types';
import { validateEngineResult } from './types';

export class ProviderError extends Error {
  constructor(message: string, readonly code: string, readonly location?: { filename: string; line: number; root?: boolean }) { super(message); }
}
export interface AnalysisProvider {
  connect(): Promise<EngineResult>;
  request(action: string, payload?: Record<string, unknown>): Promise<EngineResult>;
  close(): void;
}

/** Optional native provider; importing and replaying results never constructs a native connection. */
export class NativeProvider implements AnalysisProvider {
  private port: browser.Runtime.Port | null = null;
  private serial = 0;
  private pending = new Map<string, { resolve(value: EngineResult): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  /** Request the optional permission within a user gesture, then connect to the installed host. */
  async connect(): Promise<EngineResult> {
    if (!await browser.permissions.request({ permissions: ['nativeMessaging'] })) throw new Error('Native messaging permission was not granted');
    this.close();
    this.port = browser.runtime.connectNative('com.local.openspec_alloy');
    const port = this.port;
    this.port.onMessage.addListener((message) => {
      if (!message || typeof message !== 'object') return;
      const response = message as Record<string, unknown>;
      const request = this.pending.get(String(response.id));
      if (!request) return;
      this.pending.delete(String(response.id)); clearTimeout(request.timer);
      if (response.ok && response.data && typeof response.data === 'object') {
        try { request.resolve(validateEngineResult(response.data)); } catch (error) { request.reject(error instanceof Error ? error : new Error('Invalid engine response')); }
      }
      else {
        const location = response.location && typeof response.location === 'object' ? response.location as Record<string, unknown> : null;
        request.reject(new ProviderError(String(response.error ?? 'Invalid bridge response'), String(response.code ?? 'error'), location && typeof location.filename === 'string' && typeof location.line === 'number' ? { filename: location.filename, line: location.line, root: typeof location.root === 'boolean' ? location.root : undefined } : undefined));
      }
    });
    this.port.onDisconnect.addListener(() => {
      if (this.port !== port) return;
      const error = new Error(port.error?.message ?? 'Local Alloy bridge disconnected. Install the optional companion to enable live analysis.');
      this.port = null;
      for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
      this.pending.clear();
    });
    const hello = await this.request('hello');
    if (hello.protocolVersion !== 1) { this.close(); throw new Error('Unsupported local bridge protocol'); }
    return hello;
  }
  /** Correlation IDs and deadlines prevent stale native responses from replacing unrelated operations. */
  request(action: string, payload: Record<string, unknown> = {}): Promise<EngineResult> {
    if (!this.port) return Promise.reject(new Error('Connect the optional local engine first'));
    const id = String(++this.serial);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Local bridge did not respond')); }, Number(payload.timeoutMs ?? 30_000) + 35_000);
      this.pending.set(id, { resolve, reject, timer });
      this.port!.postMessage({ id, action, payload });
    });
  }
  /** Closing the port terminates the companion's per-workspace solver process. */
  close(): void {
    this.port?.disconnect(); this.port = null;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('Disconnected')); }
    this.pending.clear();
  }
}

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { LocalEngine } from './engine';
import type { EngineConfig } from './engine';
import { NativeFrames, nativeFrame } from './protocol';

const index = process.argv.indexOf('--config');
const configPath = index >= 0 ? resolve(process.argv[index + 1]) : resolve('native/config.json');
let configuration: Partial<EngineConfig> = {};
try { configuration = JSON.parse(await readFile(configPath, 'utf8')) as Partial<EngineConfig>; } catch { /* empty defaults allow connection/setup */ }
const config: EngineConfig = { ...configuration, bridgeSource: configuration.bridgeSource ?? resolve(dirname(configPath), '../AlloyBridge.java'), cacheDir: configuration.cacheDir ?? resolve(dirname(configPath), 'cache') };
const engine = new LocalEngine(config);
const frames = new NativeFrames();
let busy = false;

/** stdout contains only Firefox frames; diagnostics go to stderr. */
function send(value: unknown, id: string): void {
  try { process.stdout.write(nativeFrame(value)); }
  catch (error) { process.stdout.write(nativeFrame({ id, ok: false, error: String(error), code: 'limit' })); }
}

/** Each connected native host is a separate workspace; cancel remains available during a solve. */
async function handle(value: unknown): Promise<void> {
  if (!value || typeof value !== 'object') return;
  const request = value as Record<string, unknown>;
  if (typeof request.id !== 'string' || typeof request.action !== 'string') return;
  const id = request.id;
  if (request.action === 'cancel') { await engine.cancel(); send({ id, ok: true, data: { cancelled: true } }, id); return; }
  if (request.action === 'hello') { send({ id, ok: true, data: { protocolVersion: 1, jarPath: config.jarPath ?? '', projectRoot: config.projectRoot ?? '', capabilities: ['load', 'run', 'next', 'fork', 'evaluate', 'cancel'] } }, id); return; }
  if (busy) { send({ id, ok: false, error: 'Analysis is busy', code: 'busy' }, id); return; }
  busy = true;
  try {
    const payload = request.payload && typeof request.payload === 'object' ? request.payload as Record<string, unknown> : {};
    const data = request.action === 'load' ? await engine.load(payload) : await engine.action(request.action, payload);
    send({ id, ok: true, data }, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = /timed out/i.test(message) ? 'timeout' : /cancel/i.test(message) ? 'cancelled' : 'error';
    if (request.action === 'load') await engine.cancel(message);
    send({ id, ok: false, error: message, code, location: error && typeof error === 'object' && 'location' in error ? error.location : undefined }, id);
  } finally { busy = false; }
}

process.stdin.on('data', (chunk: Buffer) => {
  try { for (const message of frames.push(chunk)) void handle(message); }
  catch (error) { console.error(error); void engine.cancel('Invalid native frame').finally(() => process.exit(1)); }
});
process.stdin.on('end', () => { void engine.cancel('Disconnected').finally(() => process.exit(0)); });
process.on('SIGTERM', () => { void engine.cancel('Disconnected').finally(() => process.exit(0)); });

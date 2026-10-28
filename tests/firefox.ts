import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { firefox } from 'playwright';
import type { BrowserContext } from 'playwright';
import { mkdtemp, writeFile, rm, cp, readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Use Firefox's real temporary-addon protocol, not a mocked browser API or injected test bundle. */
export async function launchExtension(options: { nativeJar?: string } = {}): Promise<{ context: BrowserContext; debug: FirefoxDebug; close(): Promise<void> }> {
  const temp = await mkdtemp('/tmp/opencode/openspec-reader-');
  const mime = resolve(temp, 'mime.types');
  await writeFile(mime, 'type=text/plain exts=md,markdown,mkd,mkdn,mdown,mdwn,mdtxt,mdtext,als,java,jml desc="Reader source documents"\n');
  const addonPath = resolve(temp, 'extension');
  await cp('dist', addonPath, { recursive: true });
  const manifest = JSON.parse(await readFile(resolve(addonPath, 'manifest.json'), 'utf8')) as Record<string, unknown>;
  // Firefox's temporary-addon-only flag simulates consent to declared hosts.
  // Production installations use the popup/settings permission control instead.
  await writeFile(resolve(addonPath, 'manifest.json'), JSON.stringify({ ...manifest, granted_host_permissions: true }));
  if (options.nativeJar) {
    const hosts = resolve(temp, '.mozilla/native-messaging-hosts'); await mkdir(hosts, { recursive: true });
    const config = resolve(temp, 'native-config.json');
    await writeFile(config, JSON.stringify({ jarPath: options.nativeJar, bridgeSource: resolve('native/AlloyBridge.java'), cacheDir: resolve(temp, 'classes') }));
    const launcher = resolve(temp, 'native-host');
    const quote = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;
    await writeFile(launcher, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(resolve('native/build/host.mjs'))} --config ${quote(config)}\n`, { mode: 0o755 });
    await writeFile(resolve(hosts, 'com.local.openspec_alloy.json'), JSON.stringify({ name: 'com.local.openspec_alloy', description: 'Test Alloy bridge', path: launcher, type: 'stdio', allowed_extensions: ['openspec-reader@local.markdown'] }));
  }
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No debug port');
  const port = address.port;
  await new Promise<void>((done) => server.close(() => done()));
  const context = await firefox.launchPersistentContext(resolve(temp, 'profile'), { headless: true, executablePath: process.env.FIREFOX_BIN, env: options.nativeJar ? { ...process.env, HOME: temp, TMPDIR: temp } : undefined, viewport: { width: 1440, height: 1000 }, args: ['--start-debugger-server', String(port)], firefoxUserPrefs: {
    'devtools.debugger.remote-enabled': true, 'devtools.debugger.prompt-connection': false,
    'devtools.chrome.enabled': true, 'xpinstall.signatures.required': false,
    'helpers.private_mime_types_file': mime,
    // Simulate consent to Firefox 153+'s separate file-scheme opt-in in this disposable profile.
    'extensions.webextensions.fileSchemeAccess.requireOptIn': false,
    'extensions.webextOptionalPermissionPrompts': false,
  } });
  let connection: Socket | null = null;
  let debug: FirefoxDebug | null = null;
  try {
    const rdp = await connectRdp(port);
    connection = rdp.socket;
    const root = await rdp.request('root', 'getRoot');
    if (typeof root.addonsActor !== 'string') throw new Error(`Missing addon actor: ${JSON.stringify(root)}`);
    const installed = await rdp.request(root.addonsActor, 'installTemporaryAddon', { addonPath, openDevTools: false });
    if (installed.error) throw new Error(`Addon installation failed: ${JSON.stringify(installed)}`);
    const list = await rdp.request('root', 'listAddons');
    const addon = (list.addons as { id: string; actor: string }[]).find((addon) => addon.id === 'openspec-reader@local.markdown')!;
    const watcher = await rdp.request(addon.actor, 'getWatcher');
    await rdp.request(String(watcher.actor), 'watchTargets', { targetType: 'frame' });
    debug = new FirefoxDebug(rdp);
  } catch (error) { await context.close(); await rm(temp, { recursive: true, force: true }); throw error; }
  return { context, debug: debug!, close: async () => { connection?.destroy(); await context.close(); await rm(temp, { recursive: true, force: true }); } };
}

/** Length-prefixed RDP frames; requests are serialized and bounded by a timeout. */
async function connectRdp(port: number): Promise<Rdp> {
  const socket = createConnection({ port, host: '127.0.0.1' });
  let buffer = Buffer.alloc(0);
  let pending: { actor: string; resolve(value: Record<string, unknown>): void } | null = null;
  const targets: Record<string, unknown>[] = [];
  const evaluations = new Map<string, Record<string, unknown>>();
  await new Promise<void>((done, reject) => {
    socket.once('error', reject);
    socket.once('connect', done);
  });
  socket.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);
    while (buffer.length) {
      const colon = buffer.indexOf(':');
      if (colon < 0) break;
      const length = Number(buffer.subarray(0, colon).toString());
      if (buffer.length < colon + 1 + length) break;
      const message = JSON.parse(buffer.subarray(colon + 1, colon + 1 + length).toString()) as Record<string, unknown>;
      if (message.type === 'target-available-form') targets.push(message.target as Record<string, unknown>);
      if (message.type === 'evaluationResult') evaluations.set(String(message.resultID), message);
      buffer = buffer.subarray(colon + 1 + length);
      if (pending && message.from === pending.actor && !message.applicationType && !message.type) {
        const request = pending;
        pending = null;
        request.resolve(message);
      }
    }
  });
  return { socket, targets, evaluations, request: (to, type, args = {}) => new Promise((done, reject) => {
    const timer = setTimeout(() => { pending = null; reject(new Error(`Firefox RDP timeout: ${type}`)); }, 20_000);
    pending = { actor: to, resolve: (value) => { clearTimeout(timer); done(value); } };
    const body = JSON.stringify({ to, type, ...args });
    socket.write(`${Buffer.byteLength(body)}:${body}`);
  }) };
}

interface Rdp {
  readonly socket: Socket;
  readonly targets: Record<string, unknown>[];
  readonly evaluations: Map<string, Record<string, unknown>>;
  request(to: string, type: string, args?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/** Firefox's Playwright build does not expose extension tabs as Page objects; test their actual DOM via RDP. */
export class FirefoxDebug {
  constructor(private readonly rdp: Rdp) {}
  async evaluate(fragment: string, script: string): Promise<unknown> {
    const target = this.rdp.targets.filter((target) => String(target.url).includes(fragment)).at(-1);
    if (!target) throw new Error(`No extension target for ${fragment}`);
    return this.console(String(target.consoleActor), script);
  }
  async wait(fragment: string, script: string): Promise<unknown> {
    for (let i = 0; i < 300; i++) {
      try { const result = await this.evaluate(fragment, script); if (result) return result; } catch { /* wait for target/document creation */ }
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error(`Timed out waiting for extension DOM: ${script}`);
  }
  async clickTrusted(fragment: string, label: string): Promise<void> {
    const point = await this.evaluate(fragment, `const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent === ${JSON.stringify(label)}); button.scrollIntoView({block:'center'}); const rect = button.getBoundingClientRect(); return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};`) as { x: number; y: number };
    const descriptor = await this.rdp.request('root', 'getProcess', { id: 0 });
    const form = (descriptor.form ?? descriptor.processDescriptor ?? descriptor.process) as { actor: string };
    const target = await this.rdp.request(form.actor, 'getTarget');
    const process = target.process as { consoleActor: string };
    await this.console(process.consoleActor, `const win = Services.wm.getMostRecentWindow('navigator:browser'); const box = win.gBrowser.selectedBrowser.getBoundingClientRect(); for (const type of ['mousedown','mouseup']) win.synthesizeMouseEvent(type, box.x+${point.x}, box.y+${point.y}, {identifier:win.windowUtils.DEFAULT_MOUSE_POINTER_ID,button:0,buttons:type==='mousedown'?1:0,clickCount:1,modifiers:0,pressure:0,inputSource:1}, {isDOMEventSynthesized:true,isWidgetEventSynthesized:false,isAsyncEnabled:false}); return true;`);
  }
  private async console(actor: string, script: string): Promise<unknown> {
    const response = await this.rdp.request(actor, 'evaluateJSAsync', { text: `JSON.stringify((()=>{${script}})() ?? null)` });
    const id = String(response.resultID);
    for (let i = 0; i < 200; i++) {
      const evaluated = this.rdp.evaluations.get(id);
      if (evaluated) {
        this.rdp.evaluations.delete(id);
        if (evaluated.exceptionMessage) throw new Error(String(evaluated.exceptionMessage));
        const result = evaluated.result;
        return typeof result === 'string' ? JSON.parse(result) : result;
      }
      await new Promise((done) => setTimeout(done, 10));
    }
    throw new Error(`RDP evaluation timed out: ${String(response.error ?? script)}`);
  }
}

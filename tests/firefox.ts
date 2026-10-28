import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { firefox } from 'playwright';
import type { BrowserContext } from 'playwright';
import { mkdtemp, writeFile, rm, cp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Use Firefox's real temporary-addon protocol, not a mocked browser API or injected test bundle. */
export async function launchExtension(): Promise<{ context: BrowserContext; close(): Promise<void> }> {
  const temp = await mkdtemp('/tmp/opencode/openspec-reader-');
  const mime = resolve(temp, 'mime.types');
  await writeFile(mime, 'type=text/plain exts=md,markdown,mkd,mkdn,mdown,mdwn,mdtxt,mdtext,als,java,jml desc="Reader source documents"\n');
  const addonPath = resolve(temp, 'extension');
  await cp('dist', addonPath, { recursive: true });
  const manifest = JSON.parse(await readFile(resolve(addonPath, 'manifest.json'), 'utf8')) as Record<string, unknown>;
  // Firefox's temporary-addon-only flag simulates consent to declared hosts.
  // Production installations use the popup/settings permission control instead.
  await writeFile(resolve(addonPath, 'manifest.json'), JSON.stringify({ ...manifest, granted_host_permissions: true }));
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No debug port');
  const port = address.port;
  await new Promise<void>((done) => server.close(() => done()));
  const context = await firefox.launchPersistentContext(resolve(temp, 'profile'), { headless: true, executablePath: process.env.FIREFOX_BIN, viewport: { width: 1440, height: 1000 }, args: ['--start-debugger-server', String(port)], firefoxUserPrefs: {
    'devtools.debugger.remote-enabled': true, 'devtools.debugger.prompt-connection': false,
    'devtools.chrome.enabled': true, 'xpinstall.signatures.required': false,
    'helpers.private_mime_types_file': mime,
    // Simulate consent to Firefox 153+'s separate file-scheme opt-in in this disposable profile.
    'extensions.webextensions.fileSchemeAccess.requireOptIn': false,
  } });
  let connection: Socket | null = null;
  try {
    const rdp = await connectRdp(port);
    connection = rdp.socket;
    const root = await rdp.request('root', 'getRoot');
    if (typeof root.addonsActor !== 'string') throw new Error(`Missing addon actor: ${JSON.stringify(root)}`);
    const installed = await rdp.request(root.addonsActor, 'installTemporaryAddon', { addonPath, openDevTools: false });
    if (installed.error) throw new Error(`Addon installation failed: ${JSON.stringify(installed)}`);
  } catch (error) { await context.close(); await rm(temp, { recursive: true, force: true }); throw error; }
  return { context, close: async () => { connection?.destroy(); await context.close(); await rm(temp, { recursive: true, force: true }); } };
}

/** Length-prefixed RDP frames; requests are serialized and bounded by a timeout. */
async function connectRdp(port: number): Promise<{ socket: Socket; request(to: string, type: string, args?: Record<string, unknown>): Promise<Record<string, unknown>> }> {
  const socket = createConnection({ port, host: '127.0.0.1' });
  let buffer = Buffer.alloc(0);
  let pending: { actor: string; resolve(value: Record<string, unknown>): void } | null = null;
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
      buffer = buffer.subarray(colon + 1 + length);
      if (pending && message.from === pending.actor && !message.applicationType && !message.type) {
        const request = pending;
        pending = null;
        request.resolve(message);
      }
    }
  });
  return { socket, request: (to, type, args = {}) => new Promise((done, reject) => {
    const timer = setTimeout(() => { pending = null; reject(new Error(`Firefox RDP timeout: ${type}`)); }, 20_000);
    pending = { actor: to, resolve: (value) => { clearTimeout(timer); done(value); } };
    const body = JSON.stringify({ to, type, ...args });
    socket.write(`${Buffer.byteLength(body)}:${body}`);
  }) };
}

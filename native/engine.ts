import { spawn, execFile } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import { isAlloyModelFile } from '../src/alloy-viz/model-files';

const execute = promisify(execFile);
export interface EngineConfig { readonly jarPath?: string; readonly projectRoot?: string; readonly java?: string; readonly javac?: string; readonly bridgeSource: string; readonly cacheDir: string }
interface Pending { readonly id: string; readonly resolve: (value: Record<string, unknown>) => void; readonly reject: (error: Error) => void; readonly timer: ReturnType<typeof setTimeout> }

/** A workspace has one JVM/session and one bounded operation at a time; cancellation kills its solver. */
export class LocalEngine {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private pending: Pending | null = null;
  private directory = '';
  private root = '';
  private provenance: Record<string, unknown> = {};
  private output = '';
  private serial = 0;
  private stderr = '';
  private decoder = new StringDecoder('utf8');
  private revision = 0;
  private compilation: AbortController | null = null;
  constructor(private readonly config: EngineConfig) {}

  /** Load from captured sources in a disposable workspace; project source files are never modified. */
  async load(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.cancel('Model replaced');
    const revision = this.revision;
    const jar = resolve(String(payload.jarPath || this.config.jarPath || ''));
    if (!/\.jar$/i.test(jar)) throw new Error('Select an existing Alloy 6 JAR');
    await access(jar);
    const sourceUrl = typeof payload.sourceUrl === 'string' ? payload.sourceUrl.split('#')[0] : '';
    const sourcePath = sourceUrl.startsWith('file:') ? fileURLToPath(sourceUrl) : '';
    let filename = modulePath(String(payload.filename || 'model.als'));
    // A Markdown fence references its parent .md, but its captured program is a virtual .als module.
    const sameFormat = /\.md$/i.test(filename) === /\.md$/i.test(sourcePath);
    const configuredRoot = typeof payload.projectRoot === 'string' ? payload.projectRoot : this.config.projectRoot;
    const rootDirectory = configuredRoot || (isAlloyModelFile(sourcePath) && sameFormat ? dirname(sourcePath) : '');
    const directory = await mkdtemp(join(tmpdir(), 'openspec-alloy-'));
    this.directory = directory;
    const files = new Map<string, string>();
    if (rootDirectory) await snapshot(await realpath(rootDirectory), '', files);
    await this.current(revision, directory);
    const supplied = Array.isArray(payload.files) ? payload.files : [];
    if (supplied.length > 256) throw new Error('Too many supplied modules');
    for (const file of supplied) {
      if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') throw new Error('Invalid module bundle');
      files.set(modulePath(file.path), file.content);
    }
    if (isAlloyModelFile(sourcePath) && sameFormat && rootDirectory) {
      const path = relative(await realpath(rootDirectory), sourcePath);
      if (!path.startsWith('..') && !path.includes(`..${sep}`)) filename = modulePath(path.split(sep).join('/'));
    }
    if (typeof payload.source !== 'string' || !payload.source.trim()) throw new Error('Select a nonempty model');
    files.set(filename, payload.source);
    if (files.size > 256 || Array.from(files.values()).reduce((size, source) => size + Buffer.byteLength(source), 0) > 16 * 1024 * 1024) throw new Error('Module bundle exceeds 256 files / 16 MiB');
    for (const [name, content] of files) { const path = join(directory, name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, content); }
    await this.current(revision, directory);
    this.root = join(directory, filename);
    const jarInfo = await stat(jar);
    const key = createHash('sha256').update(jar + jarInfo.size + jarInfo.mtimeMs).digest('hex').slice(0, 20);
    const classes = join(this.config.cacheDir, key);
    await mkdir(classes, { recursive: true });
    const bridgeInfo = await stat(this.config.bridgeSource);
    let compiled = false;
    try { compiled = (await stat(join(classes, 'AlloyBridge.class'))).mtimeMs >= bridgeInfo.mtimeMs; } catch { /* compile on first use */ }
    if (!compiled) {
      const controller = new AbortController(); this.compilation = controller;
      try { await execute(this.config.javac ?? 'javac', ['--release', '17', '-cp', jar, '-d', classes, this.config.bridgeSource], { timeout: 30_000, maxBuffer: 1024 * 1024, signal: controller.signal }); }
      catch (error) { if (controller.signal.aborted) throw new Error('Cancelled'); throw error; }
      finally { if (this.compilation === controller) this.compilation = null; }
    }
    await this.current(revision, directory);
    this.worker = spawn(this.config.java ?? 'java', ['-Xmx512m', '-cp', [classes, jar].join(process.platform === 'win32' ? ';' : ':'), 'AlloyBridge'], { stdio: 'pipe', detached: process.platform !== 'win32' });
    this.output = ''; this.stderr = ''; this.decoder = new StringDecoder('utf8');
    this.worker.stdout.on('data', (data: Buffer) => this.receive(data));
    this.worker.stderr.on('data', (data: Buffer) => { this.stderr = (this.stderr + data.toString()).slice(-8192); });
    this.worker.on('error', (error) => this.fail(error));
    this.worker.on('close', () => { this.worker = null; this.fail(new Error(`Alloy process ended. ${this.stderr}`)); });
    const result = await this.request('load', { root: this.root }, timeout(payload));
    this.provenance = { sourceHash: hash(payload.source), bundleHash: hash(JSON.stringify(Array.from(files).sort(([a], [b]) => a.localeCompare(b)))), jarPath: jar, jarSha256: hash(await readFile(jar)), engineVersion: result.version, capturedAt: new Date().toISOString(), entryFile: filename,
      modules: Array.from(files).map(([path, content]) => ({ path, sha256: hash(content) })),
    };
    return { ...result, provenance: this.provenance };
  }

  /** Explicit operations retain the exact parsed snapshot and incremental session. */
  async action(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.worker) throw new Error('Load a model before analysis');
    if (!['run', 'next', 'fork', 'evaluate'].includes(action)) throw new Error('Unsupported engine action');
    const result = await this.request(action, { ...payload, root: this.root }, timeout(payload));
    return { ...result, provenance: { ...this.provenance, solver: payload.solver ?? 'sat4j' } };
  }

  /** Used for user cancellation, timeouts, disconnects, and replacing a snapshot. */
  async cancel(reason = 'Cancelled'): Promise<void> {
    this.revision++;
    this.compilation?.abort();
    const worker = this.worker; this.worker = null;
    this.fail(new Error(reason));
    if (worker) {
      try { if (process.platform !== 'win32' && worker.pid) process.kill(-worker.pid, 'SIGKILL'); else worker.kill('SIGKILL'); } catch { worker.kill('SIGKILL'); }
      await new Promise<void>((done) => { worker.once('close', () => done()); setTimeout(done, 1000).unref(); });
    }
    if (this.directory) { await rm(this.directory, { recursive: true, force: true }); this.directory = ''; }
    this.output = '';
  }

  /** Requests are correlated even though the JVM protocol is sequential. */
  private request(action: string, payload: Record<string, unknown>, timeoutMs: number): Promise<Record<string, unknown>> {
    if (this.pending) return Promise.reject(new Error('Analysis is busy'));
    const id = String(++this.serial);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { void this.cancel('Analysis timed out'); }, timeoutMs);
      this.pending = { id, resolve, reject, timer };
      this.worker!.stdin.write(JSON.stringify({ ...payload, id, action }) + '\n');
    });
  }
  /** Bound worker output before parsing a response. */
  private receive(data: Buffer): void {
    this.output += this.decoder.write(data);
    if (this.output.length > 20 * 1024 * 1024) { void this.cancel('Alloy output is too large'); return; }
    const newline = this.output.indexOf('\n');
    if (newline < 0) return;
    const line = this.output.slice(0, newline); this.output = this.output.slice(newline + 1);
    try {
      const response = JSON.parse(line) as Record<string, unknown>;
      const pending = this.pending;
      if (!pending || response.id !== pending.id) return;
      this.pending = null; clearTimeout(pending.timer);
      if (!response.ok) {
        const error = new Error(String(response.error ?? 'Alloy error'));
        const location = response.location && typeof response.location === 'object' ? response.location as Record<string, unknown> : null;
        Object.assign(error, { location: location ? { ...location, root: location.filename === this.root } : undefined }); pending.reject(error);
      } else pending.resolve(response.data as Record<string, unknown>);
    } catch (error) { this.fail(error instanceof Error ? error : new Error('Invalid engine response')); }
  }
  /** Reject once and release the timeout before destroying the process. */
  private fail(error: Error): void { const pending = this.pending; this.pending = null; if (pending) { clearTimeout(pending.timer); pending.reject(error); } }
  /** Cancellation during asynchronous capture/compilation must never start a replacement solver. */
  private async current(revision: number, directory: string): Promise<void> {
    if (revision === this.revision) return;
    await rm(directory, { recursive: true, force: true }); throw new Error('Cancelled');
  }
}

/** Normalize explicitly supplied module names; do not allow writes outside the temporary bundle. */
export function modulePath(path: string): string {
  if (!path || path.length > 4096 || path.startsWith('/') || /[\\:\0]/.test(path) || path.split('/').some((part) => !part || part === '.' || part === '..') || !isAlloyModelFile(path)) throw new Error('Module names must be relative .als or .md paths');
  return path;
}
/** Content fingerprints are cryptographic and include every captured project module. */
function hash(source: string | Uint8Array): string { return createHash('sha256').update(source).digest('hex'); }
/** Timeouts are user configurable, with an explicit bounded range. */
function timeout(payload: Record<string, unknown>): number { const value = Number(payload.timeoutMs ?? 30_000); if (!Number.isSafeInteger(value) || value < 100 || value > 300_000) throw new Error('Timeout must be 100–300000 ms'); return value; }

/** Capture regular Alloy/literate model files; symlinks and build/dependency directories are not followed. */
async function snapshot(root: string, prefix: string, files: Map<string, string>): Promise<void> {
  const queue = [prefix];
  let bytes = 0;
  for (let index = 0; index < queue.length; index++) {
    if (queue.length > 2000) throw new Error('Project contains too many directories; choose a smaller module root');
    const folder = queue[index];
    for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['node_modules', 'build', 'dist', 'target'].includes(entry.name)) continue;
      const path = folder ? `${folder}/${entry.name}` : entry.name;
      if (entry.isDirectory()) queue.push(path);
      else if (entry.isFile() && isAlloyModelFile(entry.name)) {
        const info = await stat(join(root, path)); bytes += info.size;
        if (files.size >= 256 || bytes > 16 * 1024 * 1024) throw new Error('Project module snapshot exceeds 256 files / 16 MiB; choose a smaller root');
        files.set(path, await readFile(join(root, path), 'utf8'));
      }
    }
  }
}

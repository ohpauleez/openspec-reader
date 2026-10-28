import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { LocalEngine } from '../native/engine';
import { DOMParser } from '@xmldom/xmldom';
import { parseAlloyXml } from '../src/alloy-viz/xml';
import { pathToFileURL } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { NativeFrames, nativeFrame } from '../native/protocol';

const jar = resolve(process.env.ALLOY_JAR ?? '../.opencode/opt/alloy_v6.2.0.jar');
await access(jar);
const directory = await mkdtemp('/tmp/opencode/alloy-native-');
const previousTmp = process.env.TMPDIR; process.env.TMPDIR = directory;
const engine = new LocalEngine({ bridgeSource: resolve('native/AlloyBridge.java'), cacheDir: join(directory, 'classes') });
const source = await readFile('tests/fixtures/temporal.als', 'utf8');
try {
  const project = join(directory, 'project'); await mkdir(project);
  await writeFile(join(project, 'temporal.als'), '// original disk contents are deliberately different');
  const loaded = await engine.load({ jarPath: jar, projectRoot: project, filename: 'temporal.als', source, sourceUrl: pathToFileURL(join(project, 'temporal.als')).href });
  const commands = loaded.commands as { index: number; label: string; check: boolean }[];
  assert.equal(commands.length, 4);
  assert.ok(String(loaded.version).startsWith('6.'));
  assert.equal(await readFile(join(project, 'temporal.als'), 'utf8'), '// original disk contents are deliberately different');
  const example = await engine.action('run', { command: 0 });
  assert.equal(example.outcome, 'example');
  const trace = parseAlloyXml(String(example.xml), (xml) => new DOMParser().parseFromString(xml, 'application/xml'));
  assert.ok(trace.states.length >= 2);
  assert.ok(trace.loopStart >= 0 && trace.loopStart < trace.states.length);
  const active = trace.declarations.find((declaration) => declaration.label === 'active')!;
  assert.equal(trace.states[0].relations[active.id].length, 0);
  assert.equal(trace.states[1].relations[active.id].length, 1);
  const evaluated = await engine.action('evaluate', { expression: '#Clock.active', state: 1 });
  assert.equal(evaluated.value, '1');
  const alternative = await engine.action('fork', { state: -2 });
  assert.ok(alternative.xml || alternative.outcome === 'exhausted');
  const counterexample = await engine.action('run', { command: 1 });
  assert.equal(counterexample.outcome, 'counterexample');
  assert.equal((await engine.action('run', { command: 2 })).outcome, 'no-counterexample');
  assert.equal((await engine.action('run', { command: 3 })).outcome, 'no-instance');
  const again = await engine.action('run', { command: 0 });
  await mkdir('test-results', { recursive: true }); await writeFile('test-results/alloy-native-trace.xml', String(again.xml));
  assert.ok((await engine.action('next', {})).outcome);

  // Imports are read from a snapshot of the project, with the selected root overlaid exactly.
  await writeFile(join(project, 'domain.als'), 'module domain\nsig Item {}\n');
  await engine.load({ jarPath: jar, projectRoot: project, filename: 'main.als', source: 'module main\nopen domain\nrun { some Item } for 2\n' });
  assert.equal((await engine.action('run', { command: 0 })).outcome, 'example');

  // A complete literate spec is passed unchanged to Alloy, combining Alloy fences and ignoring prose/other code.
  const markdown = await readFile('tests/fixtures/literate-spec.md', 'utf8');
  await writeFile(join(project, 'spec.md'), 'Original Markdown on disk must remain untouched.');
  const markdownLoaded = await engine.load({ jarPath: jar, filename: 'spec.md', source: markdown, sourceUrl: pathToFileURL(join(project, 'spec.md')).href });
  const markdownCommands = markdownLoaded.commands as { line: number; filename: string }[];
  assert.equal(markdownCommands.length, 2);
  const runLine = markdown.split('\n').findIndex((line) => line.startsWith('run sample')) + 1;
  const checkLine = markdown.split('\n').findIndex((line) => line.startsWith('check Empty')) + 1;
  assert.equal(markdownCommands[0].line, runLine);
  assert.equal(markdownCommands[1].line, checkLine);
  assert.ok(markdownCommands.every((command) => command.filename.endsWith('spec.md')));
  assert.equal((markdownLoaded.provenance as { entryFile: string }).entryFile, 'spec.md');
  const markdownExample = await engine.action('run', { command: 0 });
  assert.equal(markdownExample.outcome, 'example');
  const markdownTrace = parseAlloyXml(String(markdownExample.xml), (xml) => new DOMParser().parseFromString(xml, 'application/xml'));
  assert.equal(markdownTrace.sources.find((source) => source.filename.endsWith('spec.md'))?.content, markdown);
  assert.equal((await engine.action('run', { command: 1 })).outcome, 'counterexample');
  assert.equal(await readFile(join(project, 'spec.md'), 'utf8'), 'Original Markdown on disk must remain untouched.');
  await assert.rejects(engine.load({ jarPath: jar, filename: 'spec.md', source: markdown.replace('check Empty', 'check Missing') }), (error: unknown) => {
    const location = (error as Error & { location: { line: number; root: boolean } }).location;
    assert.equal(location.line, checkLine); assert.equal(location.root, true); return true;
  });
  await assert.rejects(engine.load({ jarPath: jar, filename: 'empty.md', source: '# No executable model\n' }), /No Alloy code found/);

  // A fence extracted from a Markdown reader must still execute as a virtual .als module.
  await engine.load({ jarPath: jar, filename: 'fence.als', source: 'sig Fence {}\nrun { some Fence } for 2\n', sourceUrl: pathToFileURL(join(project, 'spec.md')).href });
  assert.equal((await engine.action('run', { command: 0 })).outcome, 'example');

  // Native module resolution also supports a Markdown dependency from the project snapshot.
  await writeFile(join(project, 'documented.md'), '---\ntitle: Domain\n---\n# Module docs\n```alloy\nmodule documented\nsig Item {}\n```\n');
  await engine.load({ jarPath: jar, projectRoot: project, filename: 'main.als', source: 'module main\nopen documented\nrun { some Item } for 2\n' });
  assert.equal((await engine.action('run', { command: 0 })).outcome, 'example');
  const pending = engine.action('run', { command: 0 });
  const cancelled = assert.rejects(pending, /Cancelled/);
  await engine.cancel(); await cancelled;
  await assert.rejects(engine.action('next', {}), /Load a model/);
  // Exercise the real installer/launcher without registering anything in the user's Firefox home.
  const destination = join(directory, "host's files");
  const manifests = join(directory, 'manifests');
  await promisify(execFile)(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/native-install.ts', '--jar', jar, '--destination', destination, '--manifest-dir', manifests], { timeout: 30_000 });
  const manifest = JSON.parse(await readFile(join(manifests, 'com.local.openspec_alloy.json'), 'utf8')) as { path: string; allowed_extensions: string[] };
  assert.deepEqual(manifest.allowed_extensions, ['openspec-reader@local.markdown']);
  const host = spawn(manifest.path, [], { stdio: 'pipe' });
  const frames = new NativeFrames();
  const hello = new Promise<Record<string, unknown>>((done, reject) => {
    const timer = setTimeout(() => { host.kill(); reject(new Error('Installed native host did not respond')); }, 10_000);
    host.on('error', (error) => { clearTimeout(timer); reject(error); });
    host.stdout.on('data', (data: Buffer) => { const messages = frames.push(data); if (messages[0]) { clearTimeout(timer); done(messages[0] as Record<string, unknown>); } });
  });
  host.stdin.write(nativeFrame({ id: 'hello', action: 'hello' }));
  const response = await hello;
  assert.equal(response.ok, true);
  assert.equal((response.data as { jarPath: string }).jarPath, jar);
  const exited = new Promise<void>((done) => host.once('close', () => done())); host.stdin.end(); await exited;
  console.log('Real Alloy 6 checks passed: snapshot imports, commands, temporal XML, evaluation, alternatives, enumeration, SAT/UNSAT/check outcomes, and cancellation cleanup.');
} finally { await engine.cancel(); if (previousTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previousTmp; await rm(directory, { recursive: true, force: true }); }

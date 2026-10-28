import { mkdir, writeFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';

/** Explicit installation registers the bridge, not an Alloy distribution. Project JARs remain untouched. */
function option(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const jarPath = option('--jar');
if (jarPath) await access(resolve(jarPath));
if (process.platform === 'win32') throw new Error('Use the native host README for Windows registration; automatic installation supports Linux/macOS.');
const directory = resolve(option('--destination') ?? 'native/build');
const manifests = resolve(option('--manifest-dir') ?? (process.platform === 'darwin' ? join(homedir(), 'Library/Application Support/Mozilla/NativeMessagingHosts') : join(homedir(), '.mozilla/native-messaging-hosts')));
await mkdir(directory, { recursive: true }); await mkdir(manifests, { recursive: true });
const config = join(directory, 'config.json');
await writeFile(config, JSON.stringify({ jarPath: jarPath ? resolve(jarPath) : '', projectRoot: option('--root') ? resolve(option('--root')!) : '', bridgeSource: resolve('native/AlloyBridge.java'), cacheDir: join(directory, 'classes') }, null, 2));
const quote = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;
const launcher = join(directory, 'openspec-alloy-host');
await access(resolve('native/build/host.mjs'));
await writeFile(launcher, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(resolve('native/build/host.mjs'))} --config ${quote(config)}\n`, { mode: 0o755 });
const manifest = join(manifests, 'com.local.openspec_alloy.json');
await writeFile(manifest, JSON.stringify({ name: 'com.local.openspec_alloy', description: 'OpenSpec Reader local Alloy 6 bridge', path: launcher, type: 'stdio', allowed_extensions: ['openspec-reader@local.markdown'] }, null, 2));
console.log(`Registered native host: ${manifest}\nConfiguration: ${config}\nThe bridge uses your existing JAR; Java 17+ and javac are needed on its first load.`);

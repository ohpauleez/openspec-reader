import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('native/build', { recursive: true });
await build({ entryPoints: ['native/host.ts'], outfile: 'native/build/host.mjs', platform: 'node', target: 'node22', format: 'esm', bundle: true, sourcemap: true });
console.log('Native host built in native/build/host.mjs');

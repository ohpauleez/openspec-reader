import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { writeNotices } from './notices';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
const shell = await build({
  entryPoints: ['src/background.ts', 'src/content.ts', 'src/options.ts', 'src/popup.ts'],
  outdir: 'dist', bundle: true, format: 'iife', target: 'firefox140',
  sourcemap: 'external', minify: !process.env.DEBUG_BUILD, legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
  metafile: true,
});
const reader = await build({
  entryPoints: { reader: 'src/reader.ts', alloy: 'src/alloy-viz/explorer.ts', 'alloy-timeline-search-worker': 'src/alloy-viz/timeline-search-worker.ts' }, outdir: 'dist', bundle: true,
  format: 'esm', splitting: true, chunkNames: 'chunks/[name]-[hash]', target: 'firefox142',
  sourcemap: 'external', minify: !process.env.DEBUG_BUILD, legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
  metafile: true,
});
const layoutWorker = await build({
  entryPoints: { 'alloy-layout-worker': 'node_modules/elkjs/lib/elk-worker.min.js' },
  outdir: 'dist', bundle: true, format: 'iife', target: 'firefox142',
  minify: true, sourcemap: 'external', legalComments: 'eof', metafile: true,
});
await cp('manifest.json', 'dist/manifest.json');
await cp('public', 'dist', { recursive: true });
await cp('LICENSE', 'dist/LICENSE');
await writeNotices([shell.metafile!, reader.metafile!, layoutWorker.metafile!]);
console.log('Firefox extension built in dist/');

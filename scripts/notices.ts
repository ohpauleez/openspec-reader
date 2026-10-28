import { readFile, readdir, writeFile } from 'node:fs/promises';
import type { Metafile } from 'esbuild';

/** Include license text for every bundled npm package, determined from esbuild's actual inputs. */
export async function writeNotices(metafiles: readonly Metafile[]): Promise<void> {
  const packages = new Set<string>();
  for (const metafile of metafiles) for (const input of Object.keys(metafile.inputs)) {
    const parts = input.split('/');
    const index = parts.lastIndexOf('node_modules');
    if (index >= 0) packages.add(parts.slice(0, index + (parts[index + 1].startsWith('@') ? 3 : 2)).join('/'));
  }
  const notices = ['# Bundled third-party notices\n\nGenerated from the packages included in this build.'];
  for (const path of Array.from(packages).sort()) {
    const pkg = JSON.parse(await readFile(`${path}/package.json`, 'utf8')) as { name: string; version: string; license?: string };
    notices.push(`\n## ${pkg.name} ${pkg.version}\n\nLicense: ${pkg.license ?? 'See package license below'}`);
    const files = (await readdir(path)).filter((file) => /^(?:licen[cs]e|copying|notice)(?:\..*)?$/i.test(file));
    for (const file of files) notices.push(`\n### ${file}\n\n${await readFile(`${path}/${file}`, 'utf8')}`);
  }
  await writeFile('dist/THIRD_PARTY_NOTICES.md', notices.join('\n'));
}

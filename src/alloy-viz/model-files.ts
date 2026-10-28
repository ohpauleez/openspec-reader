import type { ModelLaunch } from './types';

/** These formats can be loaded as complete models by the local Alloy parser. */
export function isAlloyModelFile(path: string): boolean {
  return /\.(?:als|md)$/i.test(path);
}

/** Keep the complete uploaded document and its filename, including literate Markdown and relative paths. */
export function modelFileLaunch(file: { readonly path: string; readonly content: string }): ModelLaunch {
  return { title: file.path, filename: file.path, selected: ['file'], parts: [{ id: 'file', label: file.path, source: file.content, sourceUrl: '', line: 1 }] };
}

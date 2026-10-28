import type { AlloyDocument } from './alloy-document';
import type { JavaDocument } from './java-document';
import { createCodeView } from './code';
import type { CodeHandle } from './code';
import { element, reveal } from './dom';
import { fingerprint } from './document';
import type { SearchBlock } from './render';
import type { ReadingState } from './state';
import { openExplorer } from './alloy-viz/launch';
import { button } from './dom';

export type SourceDocument = AlloyDocument | JavaDocument;

/** Show one continuous read-only source file, with source-mapped outline and search targets. */
export function renderSource(model: SourceDocument, article: HTMLElement, targets: Map<string, () => void>, blocks: SearchBlock[], dark: boolean, saved: ReadingState | null, changed: () => void): CodeHandle {
  const fence = { id: `${model.kind}-source`, language: model.kind === 'alloy' ? 'alloy' : model.language, source: model.codeSource, line: 1 };
  const stateKey = `${fence.id}:${fingerprint(fence.source)}`;
  const code = createCodeView(fence, dark, saved?.code[stateKey] ?? [], changed, 'document', model.kind === 'java' ? model : undefined);
  article.classList.add('osr-source-document', `osr-${model.kind}-document`);
  article.append(element('h1', 'osr-source-title', model.title), code.element);
  if (model.kind === 'alloy') code.element.querySelector('.osr-code-tools')!.append(button('Explore model', () => { void openExplorer({ title: model.title, selected: ['file'], parts: [{ id: 'file', label: model.title, source: model.source, sourceUrl: location.href, line: 1 }] }); }));
  for (const definition of model.definitions) {
    targets.set(definition.id, () => { reveal(code.element); code.revealOffset(definition.from); });
  }
  blocks.push({ element: code.element, text: model.codeSource, line: 1, revealOffset: code.revealOffset });
  return code;
}

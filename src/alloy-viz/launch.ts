import browser from 'webextension-polyfill';
import type { ModelLaunch } from './types';
import type { DocumentModel } from '../document';

/** Preserve every fence as a selectable source fragment; never silently concatenate models. */
export function markdownLaunch(model: DocumentModel, selected: string): ModelLaunch {
  return { title: model.title, selected: [selected], parts: model.fences.filter((fence) => fence.language === 'alloy' || fence.language === 'als').map((fence) => {
    const hierarchy = model.sections.filter((section) => section.line <= fence.line && fence.line < section.endLine);
    const section = hierarchy.at(-1);
    const requirement = hierarchy.slice().reverse().find((section) => section.kind === 'scenario' || section.kind === 'requirement');
    const label = requirement && requirement !== section ? `${requirement.title} · ${section?.title}` : section?.title ?? 'Alloy model';
    return { id: fence.id, source: fence.source, line: fence.line + 1, sourceUrl: `${location.href.split('#')[0]}${section ? `#${section.id}` : ''}`, label: `${label} · line ${fence.line}` };
  }) };
}

/** Opening an explorer uses a snapshot, so the file tab remains a normal read-only reader. */
export async function openExplorer(launch: ModelLaunch): Promise<void> {
  try { await browser.runtime.sendMessage({ type: 'alloy-explore', launch }); }
  catch (error) { console.error('Could not open Alloy explorer:', error); }
}

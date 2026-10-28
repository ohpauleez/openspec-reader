import type { EngineResult, ModelLaunch, ViewProfile } from './types';
import { validateLaunch, validateProfile, validateEngineResult } from './types';
import { validateGraphLayout } from './graph-layout';
import type { SavedGraphLayout } from './graph-layout';

export interface Exploration {
  readonly format: 'openspec-alloy-viz';
  readonly version: 1;
  readonly label: string;
  readonly xml: string;
  readonly launch: ModelLaunch | null;
  readonly selected: readonly string[];
  readonly profile: ViewProfile;
  readonly result: EngineResult;
  readonly files?: readonly { path: string; content: string }[];
  readonly graphLayout?: SavedGraphLayout;
  readonly timelineBaseline?: TimelineBaseline;
}
export interface TimelineBaseline { readonly label: string; readonly xml: string; readonly profile: ViewProfile; readonly result?: EngineResult }

/** Persist raw Analyzer XML so reload follows exactly the same validated import path. */
export function readExploration(text: string): Exploration {
  if (text.length > 24 * 1024 * 1024) throw new Error('Saved exploration is too large');
  const value = JSON.parse(text) as Record<string, unknown>;
  if (!value || value.format !== 'openspec-alloy-viz' || value.version !== 1 || typeof value.xml !== 'string') throw new Error('Unknown exploration format');
  const launch = value.launch === null ? null : validateLaunch(value.launch);
  if (value.launch && !launch) throw new Error('Invalid saved model snapshot');
  const selected = Array.isArray(value.selected) ? value.selected.filter((id): id is string => typeof id === 'string').slice(0, 128) : [];
  const result = value.result ? validateEngineResult(value.result) : {};
  const files = Array.isArray(value.files) ? value.files.slice(0, 256).filter((file) => file && typeof file.path === 'string' && typeof file.content === 'string') : [];
  let timelineBaseline: TimelineBaseline | undefined;
  if (value.timelineBaseline !== undefined) {
    const baseline = value.timelineBaseline as Record<string, unknown>;
    if (!baseline || typeof baseline.xml !== 'string' || baseline.xml.length > 16 * 1024 * 1024 || typeof baseline.label !== 'string') throw new Error('Invalid Timeline comparison evidence');
    timelineBaseline = { label: baseline.label.slice(0, 1000), xml: baseline.xml, profile: validateProfile(baseline.profile), result: baseline.result ? validateEngineResult(baseline.result) : {} };
  }
  return { format: 'openspec-alloy-viz', version: 1, label: typeof value.label === 'string' ? value.label : 'Saved exploration', xml: value.xml, launch, selected, profile: validateProfile(value.profile), result, files, graphLayout: validateGraphLayout(value.graphLayout), ...(timelineBaseline ? { timelineBaseline } : {}) };
}

/** Downloads are user initiated and need no filesystem/native bridge permission. */
export function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface TimelineMapping {
  readonly declaration: string;
  readonly kind: 'action' | 'recorded' | 'state' | 'communication';
  readonly change: 'added' | 'removed' | 'both' | 'present';
  readonly state: 'before' | 'after';
  readonly source: number;
  readonly target: number;
  readonly correlation: number;
  readonly template: string;
  readonly sourceDeclaration: string;
}
export interface TimelinePatternNode {
  readonly declaration: string;
  readonly action: string;
  readonly change: string;
  readonly actor: string;
  readonly peer: string;
}
export interface TimelineProfile {
  readonly detail: 'summary' | 'changes' | 'evidence';
  readonly participantSignatures: readonly string[];
  readonly laneOrder: readonly string[];
  readonly hiddenLanes: readonly string[];
  readonly focusedLanes: readonly string[];
  readonly collapsedSignatures: readonly string[];
  readonly expandedGroups: readonly string[];
  readonly collapseLocal: boolean;
  readonly showIdle: boolean;
  readonly follow: boolean;
  readonly zoom: number;
  readonly query: string;
  readonly mappings: readonly TimelineMapping[];
  readonly pattern: readonly TimelinePatternNode[];
  readonly identityField: string;
  readonly alignment: 'state' | 'actions';
  readonly confirmedPairs: readonly { readonly left: string; readonly right: string }[];
  readonly showDifferences: boolean;
}
export const DEFAULT_TIMELINE: TimelineProfile = {
  detail: 'summary', participantSignatures: [], laneOrder: [], hiddenLanes: [], focusedLanes: [], collapsedSignatures: [], expandedGroups: [],
  collapseLocal: true, showIdle: false, follow: true, zoom: 1, query: '', mappings: [], pattern: [], identityField: '', alignment: 'state', confirmedPairs: [], showDifferences: true,
};

/** Restore bounded declarative preferences; templates interpolate tuple columns, never executable code. */
export function validateTimelineProfile(value: unknown): TimelineProfile | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const text = (value: unknown, length = 8192) => typeof value === 'string' ? value.slice(0, length) : '';
  const strings = (value: unknown, count = 20_000): string[] => Array.isArray(value) ? [...new Set(value.slice(0, count).filter((s): s is string => typeof s === 'string' && s.length <= 16384))] : [];
  const column = (value: unknown, fallback: number) => Number.isInteger(value) && Number(value) >= -1 && Number(value) < 20 ? Number(value) : fallback;
  const mappings: TimelineMapping[] = [];
  for (const raw of Array.isArray(v.mappings) ? v.mappings.slice(0, 100) : []) {
    if (!raw || typeof raw !== 'object' || !['action', 'recorded', 'state', 'communication'].includes(raw.kind) || typeof raw.declaration !== 'string') continue;
    mappings.push({ declaration: text(raw.declaration, 32768), kind: raw.kind, change: ['added', 'removed', 'both', 'present'].includes(raw.change) ? raw.change : 'both', state: raw.state === 'before' ? 'before' : 'after', source: column(raw.source, 0), target: column(raw.target, 1), correlation: column(raw.correlation, -1), template: text(raw.template, 500), sourceDeclaration: text(raw.sourceDeclaration, 8192) });
  }
  const pattern: TimelinePatternNode[] = (Array.isArray(v.pattern) ? v.pattern.slice(0, 4) : []).filter((n) => n && typeof n === 'object').map((n) => ({ declaration: text(n.declaration), action: text(n.action, 200), change: text(n.change, 30), actor: text(n.actor, 30), peer: text(n.peer, 30) }));
  return {
    detail: v.detail === 'changes' || v.detail === 'evidence' ? v.detail : 'summary', participantSignatures: strings(v.participantSignatures, 2000), laneOrder: strings(v.laneOrder), hiddenLanes: strings(v.hiddenLanes), focusedLanes: strings(v.focusedLanes), collapsedSignatures: strings(v.collapsedSignatures, 2000), expandedGroups: strings(v.expandedGroups, 10_000),
    collapseLocal: v.collapseLocal !== false, showIdle: v.showIdle === true, follow: v.follow !== false, zoom: typeof v.zoom === 'number' && Number.isFinite(v.zoom) ? Math.min(2, Math.max(.5, v.zoom)) : 1,
    query: text(v.query, 500), mappings, pattern, identityField: text(v.identityField, 32768), alignment: v.alignment === 'actions' ? 'actions' : 'state', confirmedPairs: (Array.isArray(v.confirmedPairs) ? v.confirmedPairs.slice(0, 2000) : []).filter((p) => p && typeof p.left === 'string' && typeof p.right === 'string' && p.left.length <= 8192 && p.right.length <= 8192).map((p) => ({ left: p.left, right: p.right })), showDifferences: v.showDifferences !== false,
  };
}

import type { AlloyDeclaration, AlloyTrace, TraceState, Tuple, ViewProfile } from './types';
import type { TimelineMapping, TimelineProfile } from './timeline-profile';
import { DEFAULT_TIMELINE } from './timeline-profile';
import { traceChanges } from './focus';
import type { FocusSelection } from './focus';
import { stateAtoms, tupleKey } from './model';

export interface TimelineEvidence {
  readonly declaration: string;
  readonly label: string;
  readonly change: 'added' | 'removed' | 'present';
  readonly tuple: Tuple;
  readonly state: number;
}
export interface TimelineEvent {
  readonly id: string;
  readonly transition: number;
  readonly from: number;
  readonly to: number;
  readonly kind: 'birth' | 'death' | 'membership' | 'relation' | 'state' | 'action' | 'communication';
  readonly label: string;
  readonly declaration: string;
  readonly sourceLabel: string;
  readonly participants: readonly string[];
  readonly evidence: readonly TimelineEvidence[];
  readonly provenance: 'observed' | 'mapped' | 'recorded-value';
  readonly sender?: string;
  readonly receiver?: string;
  readonly correlation?: string;
  readonly actionKey?: string;
}
export interface TimelineTransition { readonly id: number; readonly from: number; readonly to: number; readonly loop: boolean; readonly events: readonly TimelineEvent[] }
export interface TimelineModel { readonly trace: AlloyTrace; readonly transitions: readonly TimelineTransition[]; readonly events: readonly TimelineEvent[]; readonly atoms: readonly string[]; readonly signatures: ReadonlyMap<string, string>; readonly temporal: boolean }
export interface TimelineLane { readonly id: string; readonly label: string; readonly members: readonly string[]; readonly signature: string; readonly group: boolean; readonly uncertain?: boolean; readonly placeholder?: boolean }
export interface TimelineRow { readonly id: string; readonly transitions: readonly TimelineTransition[]; readonly events: readonly TimelineEvent[]; readonly hidden: number; readonly collapsed: boolean; readonly from: number; readonly to: number; readonly loop: boolean }
const rawCache = new WeakMap<AlloyTrace, readonly TimelineTransition[]>();
const primaryCache = new WeakMap<AlloyTrace, readonly ReadonlyMap<string, AlloyDeclaration>[]>();
const declarationKeys = new WeakMap<AlloyTrace, ReadonlyMap<string, string>>();

/** Index most-specific primitive membership in bounded passes, independent of declaration ordering. */
function primaryStates(trace: AlloyTrace): readonly ReadonlyMap<string, AlloyDeclaration>[] {
  const cached = primaryCache.get(trace); if (cached) return cached;
  const byId = new Map(trace.declarations.map((d) => [d.id, d])); const depths = new Map<string, number>();
  const primitives = trace.declarations.filter((d) => d.kind === 'sig' && !d.builtin && !d.subset);
  for (const d of primitives) { let depth = 0; let parent = d.parent; for (let i = 0; parent && i < trace.declarations.length; i++) { depth++; parent = byId.get(parent)?.parent ?? null; } depths.set(d.id, depth); }
  const states = trace.states.map((state) => {
    const map = new Map<string, AlloyDeclaration>();
    for (const d of primitives) for (const atom of state.signatures[d.id] ?? []) { const existing = map.get(atom); if (!existing || depths.get(existing.id)! < depths.get(d.id)!) map.set(atom, d); }
    return map;
  });
  primaryCache.set(trace, states); return states;
}

/** Canonical declaration references survive XML ID changes and distinguish equally named fields of different owners. */
export function timelineDeclarationKey(trace: AlloyTrace, d: AlloyDeclaration): string {
  let keys = declarationKeys.get(trace);
  if (!keys) {
    const labels = new Map(trace.declarations.map((entry) => [entry.id, entry.label]));
    keys = new Map(trace.declarations.map((entry) => [entry.id, JSON.stringify([entry.kind, entry.parent ? labels.get(entry.parent) ?? '' : '', entry.label])]));
    declarationKeys.set(trace, keys);
  }
  return keys.get(d.id) ?? JSON.stringify([d.kind, '', d.label]);
}
/** Only explicit temporal evidence produces a closing transition; legacy single snapshots never invent actions or loops. */
export function isTemporalTimeline(trace: AlloyTrace): boolean { return trace.traceKind === 'temporal' || (trace.traceKind !== 'static' && trace.states.length > 1); }

/** Extract exact deltas once, retaining full original tuples and source/target state coordinates. */
function rawTransitions(trace: AlloyTrace): readonly TimelineTransition[] {
  const cached = rawCache.get(trace); if (cached) return cached;
  if (!isTemporalTimeline(trace)) { rawCache.set(trace, []); return []; }
  const declarations = new Map(trace.declarations.map((d) => [d.id, d]));
  const primary = primaryStates(trace);
  const result = traceChanges(trace).map((change, index): TimelineTransition => {
    const events: TimelineEvent[] = []; const before = trace.states[change.from]; const after = trace.states[change.to];
    const oldAtoms = new Set(stateAtoms(before)); const nextAtoms = new Set(stateAtoms(after));
    const add = (d: AlloyDeclaration, tuple: Tuple, direction: 'added' | 'removed', membership: boolean) => {
      const state = direction === 'added' ? change.to : change.from; const atom = tuple[0];
      const owner = membership ? primary[state].get(atom) : null;
      const exists = membership && owner?.id === d.id && !(direction === 'added' ? oldAtoms : nextAtoms).has(atom);
      const kind = exists ? direction === 'added' ? 'birth' : 'death' : membership ? 'membership' : 'relation';
      const label = exists ? `${direction === 'added' ? 'Appears' : 'Disappears'}: ${atom}` : membership ? `${direction === 'added' ? 'Join' : 'Leave'} ${d.label}: ${atom}` : `${direction === 'added' ? 'Add' : 'Remove'} ${d.label}(${tuple.join(', ')})`;
      const evidence: TimelineEvidence = { declaration: d.id, label: d.label, change: direction, tuple, state };
      events.push({ id: JSON.stringify([index, d.id, direction, tuple]), transition: index, from: change.from, to: change.to, kind, label, declaration: timelineDeclarationKey(trace, d), sourceLabel: d.kind === 'field' ? `${declarations.get(d.parent!)?.label}.${d.label}` : d.label, participants: [...new Set(tuple)], evidence: [evidence], provenance: 'observed' });
    };
    for (const membership of change.memberships) {
      const d = declarations.get(membership.signature)!; const present = new Set(after.signatures[d.id] ?? []);
      for (const atom of membership.atoms) add(d, [atom], present.has(atom) ? 'added' : 'removed', true);
    }
    for (const relation of change.relations) {
      const d = declarations.get(relation.relation)!;
      for (const tuple of relation.added) add(d, tuple, 'added', false);
      for (const tuple of relation.removed) add(d, tuple, 'removed', false);
    }
    return { id: index, from: change.from, to: change.to, loop: index === trace.states.length - 1, events };
  });
  rawCache.set(trace, result); return result;
}

/** Templates interpolate only captured tuple columns; arbitrary expressions and HTML never execute. */
export function timelineLabel(template: string, tuple: Tuple, fallback: string): string {
  return template ? template.replace(/\{(\d+)\}/g, (_, column: string) => tuple[Number(column)] ?? '?') : fallback;
}

/** Apply one interpretation rule to its observed changes or explicitly selected recorded relation values. */
function mappedEvents(trace: AlloyTrace, transition: TimelineTransition, rule: TimelineMapping): TimelineEvent[] {
  const d = trace.declarations.find((entry) => timelineDeclarationKey(trace, entry) === rule.declaration);
  if (!d || d.kind === 'sig') return [];
  const matching = transition.events.filter((e) => e.declaration === rule.declaration && (rule.change === 'both' || e.evidence[0].change === rule.change));
  if (rule.change === 'present') {
    const state = rule.state === 'before' ? transition.from : transition.to;
    for (const tuple of trace.states[state].relations[d.id] ?? []) matching.push({ id: JSON.stringify([transition.id, d.id, 'present', tuple, state]), transition: transition.id, from: transition.from, to: transition.to, kind: 'action', label: d.label, declaration: rule.declaration, sourceLabel: `${trace.declarations.find((entry) => entry.id === d.parent)?.label ?? ''}.${d.label}`, participants: [...new Set(tuple)], evidence: [{ declaration: d.id, label: d.label, change: 'present', tuple, state }], provenance: 'recorded-value' });
  }
  if (rule.kind === 'state') return stateUpdates(matching, rule, d.label);
  return matching.map((event) => {
    const tuple = event.evidence[0].tuple;
    const sender = tuple[rule.source]; const receiver = tuple[rule.target];
    return { ...event, id: `${event.id}:mapped`, kind: rule.kind === 'communication' && sender && receiver ? 'communication' : 'action', actionKey: rule.template || d.label, label: timelineLabel(rule.template, tuple, `${d.label}(${tuple.join(', ')})`), sourceLabel: rule.sourceDeclaration || event.sourceLabel, provenance: rule.kind === 'recorded' ? 'recorded-value' : 'mapped', ...(sender ? { sender } : {}), ...(receiver ? { receiver } : {}), ...(tuple[rule.correlation] ? { correlation: tuple[rule.correlation] } : {}) };
  });
}

/** State summaries retain all added/removed values and their evidence; no functional-field assumption is made. */
function stateUpdates(events: readonly TimelineEvent[], rule: TimelineMapping, label: string): TimelineEvent[] {
  const owners = new Map<string, TimelineEvent[]>();
  for (const event of events) { const owner = event.evidence[0].tuple[rule.source] ?? 'Model'; owners.set(owner, [...(owners.get(owner) ?? []), event]); }
  return [...owners].map(([owner, group]) => {
    const values = (direction: string) => group.filter((e) => e.evidence[0].change === direction).map((e) => e.evidence[0].tuple[rule.target] ?? e.evidence[0].tuple.join(', ')).join(', ') || '∅';
    const event = group[0]; const tuple = event.evidence[0].tuple;
    const present = group.every((e) => e.evidence[0].change === 'present');
    return { ...event, id: JSON.stringify([event.transition, rule.declaration, owner, 'state']), kind: 'state', label: rule.template ? timelineLabel(rule.template, tuple, label) : present ? `${owner}: ${label} {${values('present')}}` : `${owner}: ${label} {${values('removed')}} → {${values('added')}}`, sourceLabel: rule.sourceDeclaration || event.sourceLabel, evidence: group.flatMap((e) => e.evidence), participants: [...new Set(group.flatMap((e) => e.participants))], sender: owner, provenance: present ? 'recorded-value' : 'mapped' };
  });
}

/** Build the immutable semantic model. Interpretation decorates evidence; raw transition indexes remain untouched. */
export function buildTimeline(trace: AlloyTrace, settings: TimelineProfile = DEFAULT_TIMELINE): TimelineModel {
  const rules = new Map(settings.mappings.map((mapping) => [mapping.declaration, mapping]));
  const transitions = rawTransitions(trace).map((transition) => {
    if (!rules.size) return transition;
    const interpreted = [...rules.values()].flatMap((rule) => mappedEvents(trace, transition, rule));
    const replaced = new Set(interpreted.flatMap((e) => e.evidence.filter((evidence) => evidence.change !== 'present').map((evidence) => JSON.stringify([evidence.declaration, evidence.change, evidence.tuple]))));
    const events = transition.events.filter((event) => !replaced.has(JSON.stringify([event.evidence[0].declaration, event.evidence[0].change, event.evidence[0].tuple])));
    return { ...transition, events: [...events, ...interpreted] };
  });
  const atoms = new Set<string>(); const signatures = new Map<string, string>();
  for (const state of primaryStates(trace)) for (const [atom, d] of state) { atoms.add(atom); if (!signatures.has(atom)) signatures.set(atom, d.label); }
  const events = transitions.flatMap((transition) => transition.events);
  return { trace, transitions, events, atoms: [...atoms].sort(), signatures, temporal: isTemporalTimeline(trace) };
}

/** Select stable participant lanes with optional signature grouping and separate, reversible lane visibility. */
export function timelineLanes(model: TimelineModel, profile: ViewProfile, settings: TimelineProfile, focus?: FocusSelection): TimelineLane[] {
  const active = new Set(model.events.flatMap((e) => e.provenance === 'observed' ? e.participants : [e.sender, e.receiver].filter((atom): atom is string => !!atom))); const grouped = new Map<string, string[]>(); const lanes: TimelineLane[] = [];
  const hiddenSignatures = new Set(model.trace.declarations.filter((d) => profile.hiddenSignatures.includes(d.id)).map((d) => d.label));
  for (const atom of model.atoms) {
    const signature = model.signatures.get(atom) ?? '';
    if (atom === profile.projection || hiddenSignatures.has(signature) || settings.hiddenLanes.includes(atom) || (settings.participantSignatures.length && !settings.participantSignatures.includes(signature))) continue;
    if (!settings.showIdle && model.temporal && !active.has(atom) && !(profile.focus?.alwaysShow ?? []).includes(atom)) continue;
    if (focus?.active && !focus.allowed.has(atom)) continue;
    if (settings.collapsedSignatures.includes(signature)) grouped.set(signature, [...(grouped.get(signature) ?? []), atom]);
    else lanes.push({ id: JSON.stringify(['atom', atom]), label: atom, members: [atom], signature, group: false });
  }
  for (const [signature, members] of grouped) lanes.push({ id: JSON.stringify(['group', signature]), label: `${signature} · ${members.length}`, members, signature, group: true });
  const rank = new Map(settings.laneOrder.map((atom, index) => [atom, index]));
  lanes.sort((a, b) => (rank.get(a.members[0]) ?? 1e6) - (rank.get(b.members[0]) ?? 1e6) || a.signature.localeCompare(b.signature) || a.label.localeCompare(b.label));
  return [...lanes, { id: 'global', label: 'Model / global', members: [], signature: '', group: false }];
}

/** Ordinary filters affect displayed events; focus suppresses noise without deleting the original event evidence. */
export function timelineEventVisible(event: TimelineEvent, profile: ViewProfile, settings: TimelineProfile, focus?: FocusSelection): boolean {
  if (event.evidence.every((e) => profile.hiddenRelations.includes(e.declaration) || profile.hiddenSignatures.includes(e.declaration))) return false;
  if (profile.projection && !event.participants.includes(profile.projection)) return false;
  if (focus?.active && !event.participants.some((atom) => focus.seeds.has(atom))) return false;
  return !settings.focusedLanes.length || event.participants.some((atom) => settings.focusedLanes.includes(atom));
}

/** Collapse only consecutive local transitions with the same participant; interactions and loop boundaries remain explicit. */
export function timelineRows(model: TimelineModel, profile: ViewProfile, settings: TimelineProfile, focus?: FocusSelection, exempt: ReadonlySet<string> = new Set()): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (const transition of model.transitions) {
    const events = transition.events.filter((e) => timelineEventVisible(e, profile, settings, focus));
    const row: TimelineRow = { id: `transition:${transition.id}`, transitions: [transition], events, hidden: transition.events.length - events.length, collapsed: false, from: transition.from, to: transition.to, loop: transition.loop };
    const locals = (e: TimelineEvent) => e.sender && (e.kind === 'state' || (e.kind === 'action' && !e.receiver)) ? [e.sender] : e.participants;
    const previous = rows.at(-1); const participants = new Set(events.flatMap(locals)); const previousParticipants = new Set(previous?.events.flatMap(locals));
    const expanded = settings.expandedGroups.includes(row.id) || previous?.transitions.some((t) => settings.expandedGroups.includes(`transition:${t.id}`));
    const selected = events.some((e) => exempt.has(e.id)) || previous?.events.some((e) => exempt.has(e.id));
    if (settings.collapseLocal && !expanded && !selected && !row.loop && previous && !previous.loop && !row.hidden && !previous.hidden && participants.size <= 1 && previousParticipants.size <= 1 && [...participants][0] === [...previousParticipants][0]) rows[rows.length - 1] = { ...previous, id: `${previous.id}+${transition.id}`, transitions: [...previous.transitions, transition], events: [...previous.events, ...events], collapsed: true, to: row.to };
    else rows.push(row);
  }
  return rows;
}

/** Exact textual identity values support confirmed cross-trace alignment; missing or ambiguous keys remain unmatched. */
export function timelineIdentities(model: TimelineModel, field: string): ReadonlyMap<string, string> {
  const d = model.trace.declarations.find((d) => timelineDeclarationKey(model.trace, d) === field && d.kind !== 'sig'); const values = new Map<string, Set<string>>();
  if (d) for (const state of model.trace.states) for (const tuple of state.relations[d.id] ?? []) if (tuple.length === 2 && (/^-?\d+$/.test(tuple[1]) || /^".*"$/.test(tuple[1]))) { const key = tupleKey([timelineDeclarationKey(model.trace, d), tuple[1]]); const set = values.get(tuple[0]) ?? new Set<string>(); set.add(key); values.set(tuple[0], set); }
  const counts = new Map<string, number>(); for (const set of values.values()) if (set.size === 1) { const key = [...set][0]; counts.set(key, (counts.get(key) ?? 0) + 1); }
  return new Map([...values].filter(([, keys]) => keys.size === 1 && counts.get([...keys][0]) === 1).map(([atom, keys]) => [atom, [...keys][0]]));
}

/** Retrieve the captured state for a participant's color/inspection without assuming its existence at state zero. */
export function timelineAtomState(trace: AlloyTrace, atom: string, preferred = 0): TraceState {
  const primary = primaryStates(trace);
  if (primary[preferred]?.has(atom)) return trace.states[preferred];
  const index = primary.findIndex((state) => state.has(atom)); return trace.states[Math.max(0, index)];
}

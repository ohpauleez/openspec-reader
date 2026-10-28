import type { AlloyTrace, TraceFocus, TraceState, Tuple, ViewProfile } from './types';
import { DEFAULT_FOCUS, DEFAULT_PROFILE } from './types';
import { stateAtoms, tupleDifference, visibleTuples } from './model';

interface MembershipChange { readonly signature: string; readonly atoms: readonly string[] }
interface RelationChange { readonly relation: string; readonly added: readonly Tuple[]; readonly removed: readonly Tuple[] }
export interface TransitionChanges {
  readonly from: number; readonly to: number;
  readonly memberships: readonly MembershipChange[];
  readonly relations: readonly RelationChange[];
}
export interface FocusSelection {
  readonly options: TraceFocus;
  readonly active: boolean;
  readonly changed: ReadonlySet<string>;
  readonly seeds: ReadonlySet<string>;
  readonly allowed: ReadonlySet<string>;
  readonly message: string;
  readonly from: number; readonly to: number;
  readonly membershipCount: number; readonly addedCount: number; readonly removedCount: number;
}
const changesCache = new WeakMap<AlloyTrace, readonly TransitionChanges[]>();
const involvedCache = new WeakMap<AlloyTrace, ReadonlySet<string>>();
const relevantCache = new WeakMap<AlloyTrace, ReadonlySet<string>>();
const selectionCache = new WeakMap<AlloyTrace, { options: TraceFocus; hiddenSignatures: readonly string[]; hiddenRelations: readonly string[]; projection: string; selection: FocusSelection }>();

/** Index every adjacent transition and the closing lasso edge once. Deltas retain original tuple columns/references. */
export function traceChanges(trace: AlloyTrace): readonly TransitionChanges[] {
  const cached = changesCache.get(trace); if (cached) return cached;
  const changes = trace.states.map((before, from): TransitionChanges => {
    const to = from + 1 < trace.states.length ? from + 1 : trace.loopStart; const after = trace.states[to];
    const memberships: MembershipChange[] = []; const relations: RelationChange[] = [];
    for (const d of trace.declarations) {
      if (d.kind === 'sig') {
        if (d.builtin) continue;
        const old = new Set(before.signatures[d.id] ?? []); const next = new Set(after.signatures[d.id] ?? []);
        const atoms = [...old].filter((atom) => !next.has(atom)).concat([...next].filter((atom) => !old.has(atom)));
        if (atoms.length) memberships.push({ signature: d.id, atoms });
      } else {
        const delta = tupleDifference(before.relations[d.id] ?? [], after.relations[d.id] ?? []);
        if (delta.added.length || delta.removed.length) relations.push({ relation: d.id, ...delta });
      }
    }
    return { from, to, memberships, relations };
  });
  changesCache.set(trace, changes); return changes;
}

/** Direct change participation uses the whole trace, including its loop; unchanged supporting atoms are not in this set. */
export function traceInvolvedAtoms(trace: AlloyTrace): ReadonlySet<string> {
  const cached = involvedCache.get(trace); if (cached) return cached;
  const atoms = new Set<string>();
  for (const change of traceChanges(trace)) {
    for (const membership of change.memberships) for (const atom of membership.atoms) atoms.add(atom);
    for (const relation of change.relations) for (const tuple of [...relation.added, ...relation.removed]) for (const atom of tuple) atoms.add(atom);
  }
  involvedCache.set(trace, atoms); return atoms;
}

/** Color relevance includes one fixed tuple hop around changes. Static/single-state results treat all atoms as relevant. */
export function traceRelevantAtoms(trace: AlloyTrace): ReadonlySet<string> {
  const cached = relevantCache.get(trace); if (cached) return cached;
  const changed = traceInvolvedAtoms(trace);
  const relevant = changed.size ? neighboringAtoms(trace, trace.states, DEFAULT_PROFILE, changed) : new Set(trace.states.flatMap(stateAtoms));
  relevantCache.set(trace, relevant); return relevant;
}

/** Step focus follows the actual incoming playback transition; the initial frame previews its outgoing transition. */
function selectedTransition(trace: AlloyTrace, index: number, previous: number | null): { from: number; to: number } {
  return previous !== null ? { from: previous, to: index } : { from: index, to: index + 1 < trace.states.length ? index + 1 : trace.loopStart };
}

/** Unchanged context expands exactly one tuple hop from fixed seeds, never recursively through newly added atoms. */
export function neighboringAtoms(trace: AlloyTrace, states: readonly TraceState[], profile: ViewProfile, seeds: ReadonlySet<string>): Set<string> {
  const allowed = new Set(seeds);
  for (const state of states) for (const d of trace.declarations) {
    if (d.kind === 'sig' || profile.hiddenRelations.includes(d.id)) continue;
    for (const tuple of visibleTuples(state, d.id, profile)) if (tuple.some((atom) => seeds.has(atom))) for (const atom of tuple) allowed.add(atom);
  }
  return allowed;
}

/** Build presentation relevance from changed tuples and non-builtin membership changes, independently of color/layout pins. */
export function traceFocus(trace: AlloyTrace, profile: ViewProfile, index = 0, previous: number | null = null): FocusSelection {
  const options = profile.focus ?? DEFAULT_FOCUS; const transition = selectedTransition(trace, index, previous);
  const cached = selectionCache.get(trace);
  if (cached && cached.options === options && cached.hiddenSignatures === profile.hiddenSignatures && cached.hiddenRelations === profile.hiddenRelations && cached.projection === profile.projection && (options.mode !== 'step' || (cached.selection.from === transition.from && cached.selection.to === transition.to))) return cached.selection;
  const changed = new Set<string>(); let membershipCount = 0; let addedCount = 0; let removedCount = 0;
  const changes = options.mode === 'full' ? [] : traceChanges(trace);
  const selected = options.mode === 'trace' ? changes : changes.filter((c) => c.from === transition.from && c.to === transition.to);
  for (const change of selected) {
    for (const membership of change.memberships) if (!profile.hiddenSignatures.includes(membership.signature)) {
      for (const atom of membership.atoms) changed.add(atom); membershipCount += membership.atoms.length;
    }
    for (const relation of change.relations) {
      if (profile.hiddenRelations.includes(relation.relation) || options.ignoredRelations.includes(relation.relation)) continue;
      const applicable = (tuple: Tuple) => !profile.projection || tuple.includes(profile.projection);
      const added = relation.added.filter(applicable); const removed = relation.removed.filter(applicable);
      for (const tuple of [...added, ...removed]) for (const atom of tuple) changed.add(atom);
      addedCount += added.length; removedCount += removed.length;
    }
  }
  const active = options.mode !== 'full' && changed.size > 0;
  const seeds = new Set([...changed, ...options.alwaysShow]);
  const states = options.mode === 'trace' ? trace.states : [trace.states[transition.from], trace.states[transition.to]];
  const allowed = active && options.context === 'one' ? neighboringAtoms(trace, states, profile, seeds) : new Set(seeds);
  const noChanges = !changes.some((c) => c.memberships.length || c.relations.length);
  const message = options.mode === 'full' ? 'Full instance' : active ? options.mode === 'trace' ? 'Trace focus' : `Step focus · State ${transition.from} → ${transition.to}` : noChanges ? 'No changes in this trace. Showing full instance.' : options.mode === 'step' ? `No changes in State ${transition.from} → ${transition.to} for selected declarations. Showing full instance.` : 'No changes in selected declarations. Showing full instance.';
  const selection: FocusSelection = { options, active, changed, seeds, allowed, message, ...transition, membershipCount, addedCount, removedCount };
  selectionCache.set(trace, { options, hiddenSignatures: profile.hiddenSignatures, hiddenRelations: profile.hiddenRelations, projection: profile.projection, selection }); return selection;
}

/** Edges are whole original tuples; focused graphs can omit unchanged links between context-only atoms. */
export function focusTupleVisible(focus: FocusSelection | undefined, tuple: Tuple, projection = ''): boolean {
  return !focus?.active || (tuple.every((atom) => atom === projection || focus.allowed.has(atom)) && (!focus.options.hideContextEdges || tuple.some((atom) => focus.seeds.has(atom))));
}

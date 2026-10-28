import type { AlloyTrace, ModelLaunch, ModelPart, TraceState, Tuple, ViewProfile } from './types';

/** Tuples are ordered sequences, not edges; JSON encoding avoids delimiter collisions. */
export function tupleKey(tuple: Tuple): string { return JSON.stringify(tuple); }

/** Compare exact tuple values, preserving n-ary column ordering and empty relations. */
export function tupleDifference(before: readonly Tuple[], after: readonly Tuple[]): { added: Tuple[]; removed: Tuple[] } {
  const old = new Set(before.map(tupleKey));
  const next = new Set(after.map(tupleKey));
  return { added: after.filter((tuple) => !old.has(tupleKey(tuple))), removed: before.filter((tuple) => !next.has(tupleKey(tuple))) };
}

/** Atoms keep their labels within a trace; memberships are recomputed for the selected state. */
export function stateAtoms(state: TraceState): string[] {
  return Array.from(new Set([...Object.values(state.signatures).flat(), ...Object.values(state.relations).flatMap((tuples) => tuples.flat())])).sort();
}

export interface Playback { readonly index: number; readonly previous: number | null; readonly history: readonly number[] }
/** Advance through the stored lasso, retaining the actual predecessor at a loop-back transition. */
export function stepForward(playback: Playback, trace: AlloyTrace): Playback {
  return { index: playback.index + 1 < trace.states.length ? playback.index + 1 : trace.loopStart, previous: playback.index, history: [...playback.history, playback.index].slice(-10_000) };
}
/** Backtracking follows playback history, rather than incorrectly wrapping to an unrelated state. */
export function stepBack(playback: Playback): Playback {
  const index = playback.history.at(-1) ?? Math.max(0, playback.index - 1);
  return { index, previous: index > 0 ? index - 1 : null, history: playback.history.slice(0, -1) };
}

/** User-selected fence composition is explicit and retains original document line mappings. */
export function composeModel(launch: ModelLaunch, selected: readonly string[]): { source: string; parts: { part: ModelPart; start: number; end: number }[] } {
  const parts: { part: ModelPart; start: number; end: number }[] = [];
  let source = '';
  let line = 1;
  for (const part of launch.parts.filter((part) => selected.includes(part.id))) {
    if (source) { source += '\n\n'; line += 2; }
    const start = line;
    source += part.source;
    line += part.source.split('\n').length - 1;
    parts.push({ part, start, end: line });
  }
  return { source, parts };
}

/** Map compiler diagnostics in assembled models back to captured Markdown/Alloy source lines. */
export function originalLocation(launch: ModelLaunch, selected: readonly string[], line: number): { url: string; line: number; label: string } | null {
  const segment = composeModel(launch, selected).parts.find((segment) => segment.start <= line && line <= segment.end);
  return segment ? { url: segment.part.sourceUrl, line: segment.part.line + line - segment.start, label: segment.part.label } : null;
}

/** Relation filters/projection affect presentation only; full-arity tuples remain in the trace. */
export function visibleTuples(state: TraceState, relation: string, profile: ViewProfile): readonly Tuple[] {
  return (state.relations[relation] ?? []).filter((tuple) => !profile.projection || tuple.includes(profile.projection));
}

import type { TimelineEvent, TimelineLane, TimelineModel, TimelineTransition } from './timeline-model';
import { timelineIdentities } from './timeline-model';
import type { TimelinePatternNode, TimelineProfile } from './timeline-profile';

export interface TimelineMatch { readonly label: string; readonly events: readonly string[]; readonly transitions: readonly number[]; readonly baseline?: boolean }
export interface TimelineAlignment { readonly left?: TimelineTransition; readonly right?: TimelineTransition; readonly status: 'same' | 'tentative' | 'different' | 'left-only' | 'right-only' }
export interface TimelineMotif { readonly key: string; readonly label: string; readonly occurrences: readonly { readonly execution: string; readonly transition: number }[] }

/** Bind explicit actor variables consistently across a state-ordered pattern. This is not a causal-order inference. */
function patternBindings(event: TimelineEvent, node: TimelinePatternNode, bindings: ReadonlyMap<string, string>): Map<string, string> | null {
  if (node.declaration && !`${event.declaration} ${event.sourceLabel}`.toLowerCase().includes(node.declaration.toLowerCase())) return null;
  if (node.action && !event.label.toLowerCase().includes(node.action.toLowerCase())) return null;
  if (node.change && !event.evidence.some((e) => e.change === node.change)) return null;
  const next = new Map(bindings);
  for (const [variable, atom] of [[node.actor, event.sender ?? event.participants[0]], [node.peer, event.receiver ?? event.participants[1]]]) {
    if (!variable) continue;
    if (!atom || (next.has(variable) && next.get(variable) !== atom)) return null;
    next.set(variable, atom);
  }
  return next;
}

/** Match up to four ordered event nodes with a bounded frontier; return complete original evidence identifiers. */
export function findTimelinePattern(model: TimelineModel, nodes: readonly TimelinePatternNode[]): { matches: TimelineMatch[]; limited: boolean } {
  if (!nodes.length) return { matches: [], limited: false };
  let frontier: { events: TimelineEvent[]; bindings: Map<string, string> }[] = []; const matches: TimelineMatch[] = []; let limited = false; let work = 0;
  for (const event of model.events) {
    const existing = [...frontier]; const first = patternBindings(event, nodes[0], new Map());
    if (first) { if (nodes.length === 1) matches.push({ label: 'Pattern match', events: [event.id], transitions: [event.transition] }); else frontier.push({ events: [event], bindings: first }); }
    for (const partial of existing) {
      if (++work > 250_000) { limited = true; break; }
      if (event.transition <= partial.events.at(-1)!.transition) continue;
      const bindings = patternBindings(event, nodes[partial.events.length], partial.bindings); if (!bindings) continue;
      const events = [...partial.events, event];
      if (events.length === nodes.length) matches.push({ label: 'State-ordered pattern match', events: events.map((e) => e.id), transitions: events.map((e) => e.transition) });
      else frontier.push({ events, bindings });
    }
    if (frontier.length > 2000) { frontier = frontier.slice(-2000); limited = true; }
    if (matches.length >= 1000 || work > 250_000) { limited = true; break; }
  }
  return { matches, limited };
}

/** Fan-out/in describes tuple topology; request-response requires explicit communication roles and correlation values. */
export function timelinePatterns(model: TimelineModel, kind: 'fanout' | 'fanin' | 'request-response' | 'acquire-release' | 'repeat'): TimelineMatch[] {
  const matches: TimelineMatch[] = [];
  if (kind === 'fanout' || kind === 'fanin') {
    for (const transition of model.transitions) {
      const groups = new Map<string, TimelineEvent[]>();
      for (const event of transition.events) {
        const tuple = event.evidence[0]?.tuple; if (!tuple || tuple.length < 2) continue;
        const owner = kind === 'fanout' ? event.sender ?? tuple[0] : event.receiver ?? tuple[1];
        const key = JSON.stringify([event.declaration, event.evidence[0].change, owner]); groups.set(key, [...(groups.get(key) ?? []), event]);
      }
      for (const group of groups.values()) {
        const peers = new Set(group.map((e) => kind === 'fanout' ? e.receiver ?? e.evidence[0].tuple[1] : e.sender ?? e.evidence[0].tuple[0]));
        if (peers.size >= 2) matches.push({ label: `Relation-update ${kind === 'fanout' ? 'fan-out' : 'fan-in'}`, events: group.map((e) => e.id), transitions: [transition.id] });
      }
    }
  } else if (kind === 'request-response') {
    const pending = new Map<string, TimelineEvent>();
    for (const event of model.events) if (event.kind === 'communication' && event.sender && event.receiver && event.correlation) {
      const reverse = JSON.stringify([event.receiver, event.sender, event.correlation]); const request = pending.get(reverse);
      if (request && request.transition < event.transition) matches.push({ label: 'Ordered correlated request/response candidates', events: [request.id, event.id], transitions: [request.transition, event.transition] });
      pending.set(JSON.stringify([event.sender, event.receiver, event.correlation]), event);
    }
  } else if (kind === 'acquire-release') {
    const pending = new Map<string, TimelineEvent>();
    for (const event of model.events) if (event.provenance !== 'observed') {
      const key = JSON.stringify([event.sender ?? event.participants[0], event.correlation ?? '']);
      if (/\b(acquire|lock|enter)\b/i.test(event.label)) pending.set(key, event);
      else if (/\b(release|unlock|exit)\b/i.test(event.label)) { const acquire = pending.get(key); if (acquire && acquire.transition < event.transition) matches.push({ label: 'Mapped acquire/release label pair', events: [acquire.id, event.id], transitions: [acquire.transition, event.transition] }); }
    }
  } else {
    const groups = new Map<string, TimelineTransition[]>();
    for (const transition of model.transitions) { const key = transitionToken(model, transition); groups.set(key, [...(groups.get(key) ?? []), transition]); }
    for (const group of groups.values()) if (group.length > 1) matches.push({ label: `Repeated transition · ${group.length} occurrences`, events: group.flatMap((t) => t.events.map((e) => e.id)), transitions: group.map((t) => t.id) });
  }
  return matches.slice(0, 1000);
}

/** Canonical event structure includes aliasing between participants; printed atom names are not cross-trace identities. */
export function transitionToken(model: TimelineModel, transition: TimelineTransition, identities: ReadonlyMap<string, string> = new Map()): string {
  const local = new Map<string, string>(); const counts = new Map<string, number>();
  const atom = (value: string) => {
    const confirmed = identities.get(value); if (confirmed) return confirmed;
    const signature = model.signatures.get(value); if (!signature) return `literal:${value}`;
    if (!local.has(value)) { const n = counts.get(signature) ?? 0; counts.set(signature, n + 1); local.set(value, `${signature}#${n}`); }
    return local.get(value)!;
  };
  return JSON.stringify([transition.loop ? 'loop' : 'step', [...transition.events].sort((a, b) => a.declaration.localeCompare(b.declaration) || a.kind.localeCompare(b.kind) || a.evidence[0].change.localeCompare(b.evidence[0].change)).map((e) => [e.kind, e.declaration, e.provenance, e.evidence.map((v) => [v.change, v.tuple.map(atom)]), e.actionKey ?? '']).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
}

/** Explicit pairs must be one-to-one and refer to captured atoms; stable identity fields remain the default evidence. */
function comparisonIdentities(left: TimelineModel, right: TimelineModel, settings: TimelineProfile): { left: Map<string, string>; right: Map<string, string> } {
  const leftIds = new Map(timelineIdentities(left, settings.identityField)); const rightIds = new Map(timelineIdentities(right, settings.identityField));
  const leftCounts = new Map<string, number>(); const rightCounts = new Map<string, number>();
  for (const pair of settings.confirmedPairs) { leftCounts.set(pair.left, (leftCounts.get(pair.left) ?? 0) + 1); rightCounts.set(pair.right, (rightCounts.get(pair.right) ?? 0) + 1); }
  settings.confirmedPairs.forEach((pair, index) => { if (leftCounts.get(pair.left) === 1 && rightCounts.get(pair.right) === 1 && left.signatures.has(pair.left) && right.signatures.has(pair.right)) { leftIds.set(pair.left, `confirmed:${index}`); rightIds.set(pair.right, `confirmed:${index}`); } });
  return { left: leftIds, right: rightIds };
}

/** Align bounded state sequences or event/action sequences. Unconfirmed structural agreement is always marked tentative. */
export function compareTimelines(left: TimelineModel, right: TimelineModel, settings: TimelineProfile): TimelineAlignment[] {
  const { left: leftIds, right: rightIds } = comparisonIdentities(left, right, settings);
  const a = left.transitions.map((t) => transitionToken(left, t, leftIds)); const b = right.transitions.map((t) => transitionToken(right, t, rightIds));
  const pair = (i: number, j: number): TimelineAlignment => {
    const confirmed = left.transitions[i].events.every((e) => e.participants.every((p) => !left.signatures.has(p) || leftIds.has(p))) && right.transitions[j].events.every((e) => e.participants.every((p) => !right.signatures.has(p) || rightIds.has(p)));
    const sameLoop = left.transitions[i].loop === right.transitions[j].loop && (!left.transitions[i].loop || left.transitions[i].to === right.transitions[j].to);
    return { left: left.transitions[i], right: right.transitions[j], status: a[i] !== b[j] || !sameLoop ? 'different' : confirmed ? 'same' : 'tentative' };
  };
  if (settings.alignment === 'state') return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => i >= a.length ? { right: right.transitions[i], status: 'right-only' } : i >= b.length ? { left: left.transitions[i], status: 'left-only' } : pair(i, i));
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const rows: TimelineAlignment[] = []; let i = 0; let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) rows.push(pair(i++, j++));
    else if (i < a.length && (j >= b.length || dp[i + 1][j] >= dp[i][j + 1])) rows.push({ left: left.transitions[i++], status: 'left-only' });
    else rows.push({ right: right.transitions[j++], status: 'right-only' });
  }
  return rows;
}

/** Lane correspondence is confirmed only by stable keys or explicit pairs; structural placement carries a visible ◇ marker. */
export function alignTimelineLanes(left: readonly TimelineLane[], right: readonly TimelineLane[], leftModel: TimelineModel, rightModel: TimelineModel, settings: TimelineProfile): { left: TimelineLane[]; right: TimelineLane[] } {
  const { left: leftIds, right: rightIds } = comparisonIdentities(leftModel, rightModel, settings);
  const key = (lane: TimelineLane, ids: ReadonlyMap<string, string>) => lane.id === 'global' ? 'global' : lane.members.length && lane.members.every((a) => ids.has(a)) ? JSON.stringify(lane.members.map((a) => ids.get(a)).sort()) : '';
  const used = new Set<string>(); const a: TimelineLane[] = []; const b: TimelineLane[] = [];
  const missing = (lane: TimelineLane): TimelineLane => ({ id: `gap:${lane.id}`, label: `◇ Not displayed: ${lane.label}`, members: [], signature: '', group: false, placeholder: true });
  for (const lane of left) {
    const confirmedKey = key(lane, leftIds);
    const confirmed = confirmedKey ? right.find((other) => !used.has(other.id) && key(other, rightIds) === confirmedKey) : undefined;
    const structural = confirmed ?? right.find((other) => other.id !== 'global' && !used.has(other.id) && other.signature === lane.signature && other.group === lane.group);
    if (structural) { used.add(structural.id); a.push(confirmed ? lane : { ...lane, label: `◇ ${lane.label}`, uncertain: true }); b.push(confirmed ? structural : { ...structural, label: `◇ ${structural.label}`, uncertain: true }); }
    else { a.push(lane); b.push(missing(lane)); }
  }
  for (const lane of right) if (!used.has(lane.id)) { a.push(missing(lane)); b.push(lane); }
  return { left: a, right: b };
}

/** Discover repeated 2–4-transition structural motifs across finite stored executions, with raw occurrence coordinates. */
export function discoverTimelineMotifs(executions: readonly { label: string; model: TimelineModel }[]): TimelineMotif[] {
  const groups = new Map<string, { label: string; occurrences: { execution: string; transition: number }[] }>();
  const interned = new Map<string, number>();
  for (const execution of executions.slice(0, 12)) {
    const tokens = execution.model.transitions.map((t) => { const token = transitionToken(execution.model, t); if (!interned.has(token)) interned.set(token, interned.size); return interned.get(token)!; });
    for (let size = 2; size <= 4; size++) for (let start = 0; start + size <= tokens.length; start++) {
      const key = JSON.stringify(tokens.slice(start, start + size)); const group = groups.get(key) ?? { label: `${size}-transition structural pattern`, occurrences: [] };
      group.occurrences.push({ execution: execution.label, transition: start }); groups.set(key, group);
    }
  }
  return [...groups].filter(([, group]) => group.occurrences.length >= 2 && (group.occurrences.length >= 5 || new Set(group.occurrences.map((o) => o.execution)).size >= Math.ceil(executions.length / 2))).map(([key, group]) => ({ key, ...group })).sort((a, b) => b.occurrences.length - a.occurrences.length).slice(0, 100);
}

/** Execution grouping uses observed participant counts or structural/action sequences, not solver-equivalence claims. */
export function clusterTimelines(executions: readonly { label: string; model: TimelineModel }[], metric: 'participants' | 'actions' | 'divergence'): readonly { label: string; executions: string[] }[] {
  const groups = new Map<string, string[]>();
  const baseline = executions[0]?.model.transitions.map((t) => transitionToken(executions[0].model, t)) ?? [];
  for (const execution of executions.slice(0, 12)) {
    const tokens = metric === 'participants' ? [] : execution.model.transitions.map((t) => transitionToken(execution.model, t));
    const divergence = Array.from({ length: Math.max(tokens.length, baseline.length) }, (_, i) => i).find((i) => tokens[i] !== baseline[i]);
    const key = metric === 'participants' ? `${execution.model.atoms.length} participants` : metric === 'divergence' ? divergence === undefined ? execution.model.trace.loopStart === executions[0].model.trace.loopStart ? 'No structural divergence' : 'Different loop target' : `First structural divergence at transition ${divergence}` : JSON.stringify([execution.model.trace.loopStart, tokens]);
    groups.set(key, [...(groups.get(key) ?? []), execution.label]);
  }
  return [...groups.values()].map((members, index) => ({ label: metric === 'actions' ? `Structural sequence ${index + 1}` : [...groups.keys()][index], executions: members }));
}

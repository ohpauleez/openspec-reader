import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { parseAlloyXml } from '../src/alloy-viz/xml';
import { DEFAULT_FOCUS, DEFAULT_PROFILE, validateProfile } from '../src/alloy-viz/types';
import type { TraceFocus, ViewProfile } from '../src/alloy-viz/types';
import { focusTupleVisible, neighboringAtoms, traceChanges, traceFocus, traceInvolvedAtoms, traceRelevantAtoms } from '../src/alloy-viz/focus';
import { graphAtoms, layoutTopology } from '../src/alloy-viz/graph-layout';
import { prepareSignatureColors } from '../src/alloy-viz/colors';
import { readExploration } from '../src/alloy-viz/save';
import { focusXml } from './fixtures/focus';

const parse = (xml: string) => parseAlloyXml(xml, (text) => new DOMParser().parseFromString(text, 'application/xml'));
const trace = parse(focusXml());
const profile = (focus: Partial<TraceFocus> = {}): ViewProfile => ({ ...DEFAULT_PROFILE, focus: { ...DEFAULT_FOCUS, mode: 'trace', context: 'none', ...focus } });

describe('Behavior-focused trace visibility', () => {
  it('separates direct changes from color relevance, with fixed one-hop support and a static-result fallback', () => {
    const direct = traceInvolvedAtoms(trace); const relevant = traceRelevantAtoms(trace);
    expect(direct.has('C0')).toBe(false); expect(relevant.has('C0')).toBe(true);
    expect(relevant.has('H0')).toBe(true); expect(relevant.has('R0')).toBe(true);
    expect(relevant.has('C1')).toBe(false); expect(relevant.has('D0')).toBe(false); expect(relevant.has('Quiet0')).toBe(false);
    const staticTrace = parse(focusXml(true));
    expect(traceInvolvedAtoms(staticTrace).size).toBe(0);
    for (const atom of graphAtoms(staticTrace, staticTrace.states, DEFAULT_PROFILE)) expect(traceRelevantAtoms(staticTrace).has(atom)).toBe(true);
  });
  it('uses changed tuples, births/deaths and subset memberships, not a mutable declaration or all tuples of a changed relation', () => {
    const focus = traceFocus(trace, profile());
    expect([...focus.changed].sort()).toEqual(['A0', 'A1', 'B0', 'B1', 'Born0', 'Gone0']);
    expect(focus.allowed.has('Quiet0')).toBe(false);
    expect(focus.allowed.has('Quiet1')).toBe(false);
    expect(focus.membershipCount).toBe(3);
    expect(focus.addedCount).toBe(3); expect(focus.removedCount).toBe(3);
    expect(graphAtoms(trace, trace.states, profile(), focus)).toEqual(['A0', 'A1', 'B0', 'B1', 'Born0', 'Gone0']);
  });

  it('includes the last-to-loop-target transition, and step focus follows the actual incoming transition', () => {
    expect(traceChanges(trace).map((c) => [c.from, c.to])).toEqual([[0, 1], [1, 2], [2, 1]]);
    const step = traceFocus(trace, profile({ mode: 'step' }), 1, 2);
    expect(step.message).toBe('Step focus · State 2 → 1');
    expect([...step.changed].sort()).toEqual(['A0', 'B0', 'B1']);
    expect(step.addedCount).toBe(1); expect(step.removedCount).toBe(1);
    expect(traceFocus(trace, profile({ mode: 'step' }), 0).from).toBe(0);
  });

  it('expands exactly one hop and retains every argument of higher-arity tuples', () => {
    const settings = profile({ context: 'one' }); const focus = traceFocus(trace, settings);
    expect(focus.allowed.has('C0')).toBe(true); expect(focus.allowed.has('H0')).toBe(true); expect(focus.allowed.has('R0')).toBe(true);
    expect(focus.allowed.has('C1')).toBe(false); expect(focus.allowed.has('D0')).toBe(false);
    expect(focusTupleVisible(focus, ['A0', 'H0', 'R0'])).toBe(true);
    expect(focusTupleVisible(focus, ['C0', 'H0'])).toBe(false);
    expect(focusTupleVisible(traceFocus(trace, profile({ context: 'one', hideContextEdges: false })), ['C0', 'H0'])).toBe(true);
    expect(focusTupleVisible(traceFocus(trace, profile()), ['A0', 'H0', 'R0'])).toBe(false);
    const topology = layoutTopology(trace, settings, trace.states, [], focus);
    expect(topology.edges.filter((e) => e.label.startsWith('nary['))).toHaveLength(3);
    expect(topology.nodes.some((n) => n.atom === 'C1')).toBe(false);
  });

  it('keeps focus stable throughout playback and independent of difference display, layout, and colors', () => {
    const settings = profile({ context: 'one' }); const first = traceFocus(trace, settings, 0);
    expect(traceFocus(trace, settings, 2, 1)).toBe(first);
    const colors = prepareSignatureColors(trace, settings);
    expect(traceFocus(trace, colors, 1, 2)).toBe(first);
    const normal = prepareSignatureColors(trace, DEFAULT_PROFILE).colorTheme;
    expect(colors.colorTheme).toEqual(normal);
  });

  it('keeps explicit atoms independently of pins and reveals neighbors without recursively revealing a component', () => {
    const settings = profile({ alwaysShow: ['D0'] }); const focus = traceFocus(trace, settings);
    expect(focus.allowed.has('D0')).toBe(true); expect(focus.allowed.has('D1')).toBe(false);
    const next = traceFocus(trace, profile({ alwaysShow: ['D0'], context: 'one' }));
    expect(next.allowed.has('D1')).toBe(true);
    expect([...neighboringAtoms(trace, trace.states, settings, new Set(['A0']))].sort()).toEqual(['A0', 'B0', 'B1', 'C0', 'H0', 'R0']);
  });

  it('respects relevance relation selection, projection, and ordinary declaration filters without modifying source values', () => {
    const settings = profile({ ignoredRelations: ['active'] }); const focus = traceFocus(trace, settings);
    expect([...focus.changed].sort()).toEqual(['A1', 'Born0', 'Gone0']);
    const projected = { ...profile({ context: 'one' }), projection: 'A0' };
    const projectedFocus = traceFocus(trace, projected);
    expect(graphAtoms(trace, trace.states, projected, projectedFocus)).not.toContain('A0');
    expect(focusTupleVisible(projectedFocus, ['A0', 'H0', 'R0'], 'A0')).toBe(true);
    expect(trace.states[0].relations['active']).toContainEqual(['Quiet0', 'Quiet1']);
    const hidden = { ...profile(), hiddenSignatures: ['node'] };
    expect(graphAtoms(trace, trace.states, hidden, traceFocus(trace, hidden))).not.toContain('A0');
  });

  it('retains the full instance with an explicit explanation for static traces and empty step relevance', () => {
    const staticTrace = parse(focusXml(true)); const focus = traceFocus(staticTrace, profile());
    expect(focus.active).toBe(false); expect(focus.message).toContain('No changes in this trace');
    expect(graphAtoms(staticTrace, staticTrace.states, profile(), focus)).toEqual(graphAtoms(staticTrace, staticTrace.states, DEFAULT_PROFILE));
    const empty = { ...trace, states: [trace.states[0], trace.states[0], trace.states[1]] };
    expect(traceFocus(empty, profile({ mode: 'step' }), 1, 0).message).toContain('No changes in State 0 → 1');
  });

  it('validates and saves focus preferences/overrides in compatible exploration bundles', () => {
    const settings = profile({ context: 'one', alwaysShow: ['D0'], ignoredRelations: ['active'] });
    const saved = readExploration(JSON.stringify({ format: 'openspec-alloy-viz', version: 1, label: 'Focused', xml: focusXml(), launch: null, selected: [], profile: settings, result: {} }));
    expect(saved.profile.focus).toEqual(settings.focus);
    expect(validateProfile({ focus: { mode: 'script', context: 'recursive', alwaysShow: ['D0', 'D0', 3], ignoredRelations: [3, 'active'], hideContextEdges: false } }).focus).toEqual({ mode: 'full', context: 'one', alwaysShow: ['D0'], ignoredRelations: ['active'], hideContextEdges: false });
    expect(traceFocus(trace, validateProfile({})).active).toBe(false);
  });
});

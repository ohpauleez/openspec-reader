import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { parseAlloyXml } from '../src/alloy-viz/xml';
import { DEFAULT_PROFILE, validateProfile } from '../src/alloy-viz/types';
import { DEFAULT_TIMELINE, validateTimelineProfile } from '../src/alloy-viz/timeline-profile';
import type { TimelineMapping } from '../src/alloy-viz/timeline-profile';
import { buildTimeline, isTemporalTimeline, timelineDeclarationKey, timelineEventVisible, timelineIdentities, timelineLanes, timelineRows } from '../src/alloy-viz/timeline-model';
import { alignTimelineLanes, clusterTimelines, compareTimelines, discoverTimelineMotifs, findTimelinePattern, timelinePatterns } from '../src/alloy-viz/timeline-analysis';
import { compileTimelineQuery, searchTimelineRecords, timelineSearchRecord } from '../src/alloy-viz/timeline-search';
import { traceChanges } from '../src/alloy-viz/focus';
import { readExploration } from '../src/alloy-viz/save';
import { timelineXml } from './fixtures/timeline';

const parse = (xml: string) => parseAlloyXml(xml, (text) => new DOMParser().parseFromString(text, 'application/xml'));
const trace = parse(timelineXml());
const model = buildTimeline(trace);
const key = (label: string) => timelineDeclarationKey(trace, trace.declarations.find((d) => d.kind === 'field' && d.label === label)!);
const mapping = (label: string, patch: Partial<TimelineMapping> = {}): TimelineMapping => ({ declaration: key(label), kind: 'action', change: 'both', state: 'after', source: 0, target: 1, correlation: -1, template: '', sourceDeclaration: '', ...patch });

describe('Evidence-backed execution timelines', () => {
  it('distinguishes snapshots, unknown single-state exports, and explicit temporal self loops', () => {
    const snapshot = parse(timelineXml({ static: true })); expect(snapshot.traceKind).toBe('static'); expect(buildTimeline(snapshot).transitions).toEqual([]);
    const unknown = parse(timelineXml({ static: true }).replace('bitwidth="4"', 'bitwidth="4" tracelength="1"')); expect(unknown.traceKind).toBe('unknown'); expect(isTemporalTimeline(unknown)).toBe(false);
    const temporal = parse(timelineXml({ selfLoop: true })); expect(temporal.traceKind).toBe('temporal'); expect(buildTimeline(temporal).transitions).toMatchObject([{ from: 0, to: 0, loop: true, events: [] }]);
  });
  it('retains the closing lasso edge, exact tuples and every membership/relation delta without inventing actions', () => {
    expect(model.transitions.map((t) => [t.from, t.to, t.loop])).toEqual([[0, 1, false], [1, 2, false], [2, 3, false], [3, 1, true]]);
    const entries = traceChanges(trace).reduce((sum, t) => sum + t.memberships.reduce((n, m) => n + m.atoms.length, 0) + t.relations.reduce((n, r) => n + r.added.length + r.removed.length, 0), 0);
    expect(model.events).toHaveLength(entries);
    expect(model.events.every((e) => e.provenance === 'observed' && e.kind !== 'action' && e.kind !== 'communication')).toBe(true);
    const nary = model.events.find((e) => e.evidence[0].label === 'pending')!;
    expect(nary.participants).toEqual(['Actor$0', 'Actor$1', 'Resource$0']); expect(nary.evidence[0].tuple).toHaveLength(3);
    for (const event of model.events) for (const evidence of event.evidence) expect(trace.states[evidence.state].relations[evidence.declaration]).toContainEqual(evidence.tuple);
  });
  it('maps state fields and recorded action values while preserving raw evidence and provenance', () => {
    const settings = { ...DEFAULT_TIMELINE, mappings: [mapping('phase', { kind: 'state' }), mapping('action', { kind: 'recorded', change: 'present', template: '{2}({0}, {1})', sourceDeclaration: 'this/acquire' })] };
    const interpreted = buildTimeline(trace, settings); const phase = interpreted.transitions[0].events.find((e) => e.kind === 'state')!;
    expect(phase.label).toContain('"Idle"'); expect(phase.label).toContain('"Busy"'); expect(phase.evidence).toHaveLength(2); expect(phase.sender).toBe('Actor$0');
    const action = interpreted.transitions[0].events.find((e) => e.provenance === 'recorded-value')!;
    expect(action.label).toBe('"Acquire"(Actor$0, Resource$0)'); expect(action.evidence[0]).toMatchObject({ change: 'present', state: 1 }); expect(action.sourceLabel).toBe('this/acquire');
    expect(model.events.every((e) => e.provenance === 'observed')).toBe(true);
    const recordedState = buildTimeline(trace, { ...DEFAULT_TIMELINE, mappings: [mapping('phase', { kind: 'state', change: 'present' })] });
    expect(recordedState.transitions[0].events.find((e) => e.kind === 'state')!.label).not.toContain('∅');
  });
  it('requires explicit communication roles/correlation for request-response matching', () => {
    expect(timelinePatterns(model, 'request-response')).toEqual([]);
    const interpreted = buildTimeline(trace, { ...DEFAULT_TIMELINE, mappings: [mapping('messages', { kind: 'communication', change: 'added', correlation: 2, template: 'Send({0}, {1}, {2})' })] });
    const request = interpreted.events.find((e) => e.kind === 'communication')!;
    expect(request).toMatchObject({ sender: 'Actor$0', receiver: 'Actor$1', correlation: '7', provenance: 'mapped' });
    expect(timelinePatterns(interpreted, 'request-response')[0].transitions).toEqual([0, 1]);
    expect(timelinePatterns(buildTimeline(trace, { ...DEFAULT_TIMELINE, mappings: [mapping('action', { kind: 'recorded', change: 'present', template: '{2}({0})' })] }), 'acquire-release')).toHaveLength(1);
  });
  it('keeps hidden arguments and grouped lanes recoverable and filters presentation independently', () => {
    const settings = { ...DEFAULT_TIMELINE, hiddenLanes: ['Actor$1'], collapsedSignatures: ['this/Resource'] };
    const lanes = timelineLanes(model, DEFAULT_PROFILE, settings); expect(lanes.some((l) => l.members.includes('Actor$1'))).toBe(false); expect(lanes.some((l) => l.group)).toBe(true);
    const event = model.events.find((e) => e.evidence[0].label === 'pending')!;
    expect(event.evidence[0].tuple).toHaveLength(3); expect(timelineEventVisible(event, DEFAULT_PROFILE, settings)).toBe(true);
    expect(timelineEventVisible(event, { ...DEFAULT_PROFILE, hiddenRelations: ['pending'] }, settings)).toBe(false);
    const filtered = timelineRows(model, { ...DEFAULT_PROFILE, hiddenRelations: trace.declarations.filter((d) => d.kind !== 'sig').map((d) => d.id) }, settings);
    expect(filtered[0].events).toEqual([]); expect(filtered[0].hidden).toBeGreaterThan(0); expect(filtered[0].transitions[0].events).not.toEqual([]);
  });
  it('collapses local-only steps reversibly while protecting interactions, matches and loop boundaries', () => {
    const localTrace = { ...trace, declarations: trace.declarations.filter((d) => d.kind === 'sig'), states: [0, 1, 2, 3].map((n) => ({ signatures: { actor: n % 2 ? ['Actor$0'] : ['Actor$0', 'Actor$1'], u: n % 2 ? ['Actor$0'] : ['Actor$0', 'Actor$1'] }, relations: {} })) };
    const local = buildTimeline(localTrace); const rows = timelineRows(local, DEFAULT_PROFILE, DEFAULT_TIMELINE);
    expect(rows[0].collapsed).toBe(true); expect(rows.at(-1)!.loop).toBe(true); expect(rows.at(-1)!.collapsed).toBe(false);
    const expanded = timelineRows(local, DEFAULT_PROFILE, { ...DEFAULT_TIMELINE, expandedGroups: ['transition:0'] }); expect(expanded[0].collapsed).toBe(false);
    const matched = timelineRows(local, DEFAULT_PROFILE, DEFAULT_TIMELINE, undefined, new Set([local.events[0].id])); expect(matched[0].collapsed).toBe(false);
    expect(timelineRows(model, DEFAULT_PROFILE, DEFAULT_TIMELINE).every((r) => !r.collapsed)).toBe(true);
  });
  it('searches original event evidence with fields, quoted phrases, namespaces, boolean operators and regexes', () => {
    const records = model.events.map(timelineSearchRecord);
    expect(searchTimelineRecords(records, 'participant:Actor$0 AND relation:pending change:added').count).toBeGreaterThan(0);
    expect(searchTimelineRecords(records, 'relation:this/Actor').count).toBeGreaterThan(0);
    expect(searchTimelineRecords(records, '"Add pending" OR relation:owner NOT change:removed').count).toBeGreaterThan(0);
    expect(searchTimelineRecords(records, 'participant:/Actor\\$0/i state:0..1').count).toBeGreaterThan(0);
    expect(() => compileTimelineQuery('relation:pending AND')).toThrow(); expect(() => compileTimelineQuery('unknown:value')).toThrow(); expect(() => compileTimelineQuery('/[/')).toThrow();
  });
  it('matches ordered custom patterns with consistent actor variables without ordering same-transition events', () => {
    const interpreted = buildTimeline(trace, { ...DEFAULT_TIMELINE, mappings: [mapping('messages', { kind: 'communication', change: 'added', correlation: 2 })] });
    const found = findTimelinePattern(interpreted, [{ declaration: 'messages', action: '', change: 'added', actor: 'A', peer: 'B' }, { declaration: 'messages', action: '', change: 'added', actor: 'B', peer: 'A' }]);
    expect(found.matches.some((m) => m.transitions.join(',') === '0,1')).toBe(true);
    for (const match of found.matches) expect(match.transitions[1]).toBeGreaterThan(match.transitions[0]);
  });
  it('never treats printed atom names as confirmed cross-trace identity', () => {
    const baseline = buildTimeline(parse(timelineXml({ rename: true })));
    const structural = compareTimelines(model, baseline, DEFAULT_TIMELINE); expect(structural.every((r) => r.status === 'tentative')).toBe(true);
    const identities = timelineIdentities(model, key('id')); expect(identities.has('Actor$0')).toBe(true); expect(identities.has('Resource$0')).toBe(false);
    const confirmed = { ...DEFAULT_TIMELINE, identityField: key('id'), confirmedPairs: [{ left: 'Resource$0', right: 'Resource$9' }] };
    expect(compareTimelines(model, baseline, confirmed).every((r) => r.status === 'same')).toBe(true);
    const aligned = alignTimelineLanes(timelineLanes(model, DEFAULT_PROFILE, DEFAULT_TIMELINE), timelineLanes(baseline, DEFAULT_PROFILE, DEFAULT_TIMELINE), model, baseline, DEFAULT_TIMELINE);
    expect(aligned.left.some((l) => l.uncertain)).toBe(true); expect(aligned.left).toHaveLength(aligned.right.length);
  });
  it('aligns stuttering/event-sequence differences and discovers/groups repeated execution structures', () => {
    const extra = buildTimeline({ ...trace, states: [trace.states[0], ...trace.states], loopStart: 2 });
    const alignment = compareTimelines(model, extra, { ...DEFAULT_TIMELINE, alignment: 'actions' }); expect(alignment[0].status).toBe('right-only'); expect(alignment).toHaveLength(5);
    const executions = [{ label: 'first', model }, { label: 'second', model: buildTimeline(parse(timelineXml({ rename: true }))) }];
    expect(discoverTimelineMotifs(executions).some((m) => new Set(m.occurrences.map((o) => o.execution)).size === 2)).toBe(true);
    expect(clusterTimelines(executions, 'participants')[0].executions).toHaveLength(2);
    expect(clusterTimelines(executions, 'actions')[0].executions).toHaveLength(2);
  });
  it('validates declarative preferences and comparison evidence in compatible saved bundles', () => {
    const settings = validateTimelineProfile({ query: 'x'.repeat(800), zoom: Infinity, mappings: [mapping('phase'), { declaration: 'x', kind: 'javascript' }], pattern: Array(10).fill({ action: 'Acquire', actor: 'A' }), confirmedPairs: [{ left: 'Actor$0', right: 'Actor$9' }] })!;
    expect(settings.query).toHaveLength(500); expect(settings.zoom).toBe(1); expect(settings.mappings).toHaveLength(1); expect(settings.pattern).toHaveLength(4);
    const bundle = readExploration(JSON.stringify({ format: 'openspec-alloy-viz', version: 1, label: 'Timeline', xml: timelineXml(), launch: null, selected: [], profile: { ...DEFAULT_PROFILE, timeline: settings }, result: {}, timelineBaseline: { label: 'Baseline', xml: timelineXml({ rename: true }), profile: DEFAULT_PROFILE } }));
    expect(bundle.profile.timeline).toEqual(settings); expect(bundle.timelineBaseline!.label).toBe('Baseline');
    expect(validateProfile({}).timeline).toBeUndefined(); expect(() => readExploration(JSON.stringify({ ...bundle, timelineBaseline: { xml: 42, label: 'bad' } }))).toThrow();
  });
});

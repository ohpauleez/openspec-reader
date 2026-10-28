import browser from 'webextension-polyfill';
import { button, element } from '../dom';
import type { AlloyTrace, EngineResult, ViewProfile } from './types';
import { DEFAULT_PROFILE, validateEngineResult } from './types';
import type { FocusSelection } from './focus';
import type { Playback } from './model';
import { DEFAULT_TIMELINE } from './timeline-profile';
import type { TimelineProfile } from './timeline-profile';
import { buildTimeline, timelineDeclarationKey, timelineEventVisible, timelineLanes, timelineRows } from './timeline-model';
import type { TimelineEvent, TimelineLane, TimelineModel, TimelineRow } from './timeline-model';
import { TimelineDiagram } from './timeline-diagram';
import { timelineField, timelineMappingEditor, timelineParticipants, timelinePatternEditor, timelineSelect } from './timeline-editors';
import { alignTimelineLanes, clusterTimelines, compareTimelines, discoverTimelineMotifs, findTimelinePattern, timelinePatterns } from './timeline-analysis';
import type { TimelineAlignment, TimelineMatch } from './timeline-analysis';
import { timelineSearchRecord } from './timeline-search';
import { parseAlloyXml } from './xml';
import { readExploration } from './save';
import type { TimelineBaseline } from './save';

export interface TimelineLibraryEntry extends TimelineBaseline { readonly id: string }
export interface TimelineCallbacks {
  readonly profile: (profile: TimelineProfile) => void;
  readonly select: (from: number, to: number) => void;
  readonly atom: (atom: string) => void;
  readonly view: (view: 'graph' | 'table') => void;
  readonly source: (label: string) => void;
  readonly inspector: HTMLElement;
  readonly claimInspector: () => void;
  readonly library: () => Promise<readonly TimelineLibraryEntry[]>;
}
interface Baseline { readonly bundle: TimelineBaseline; readonly trace: AlloyTrace; model: TimelineModel }

/** ShiViz-style execution workspace: immutable evidence, reversible transforms, synchronized explanations/lanes and inspection. */
export class TimelineWorkspace {
  readonly root = element('section', 'sequence-workspace');
  private readonly toolbar = element('div', 'sequence-toolbar');
  private readonly panels = element('div', 'sequence-panels');
  private readonly boards = element('div', 'sequence-boards');
  private readonly status = element('output', 'sequence-status');
  private readonly results = element('div', 'sequence-results');
  private readonly libraryPanel = element('div', 'sequence-library');
  private readonly query = element('input');
  private readonly detail = timelineSelect('Timeline detail', [['summary', 'Summary'], ['changes', 'Changes'], ['evidence', 'Evidence']], 'summary');
  private readonly patternKind = timelineSelect('Timeline pattern', [['repeat', 'Repeated transition'], ['fanout', 'Relation-update fan-out'], ['fanin', 'Relation-update fan-in'], ['request-response', 'Correlated communication pair'], ['acquire-release', 'Mapped acquire/release pair']], 'repeat');
  private readonly follow = element('input');
  private readonly collapse = element('input');
  private readonly idle = element('input');
  private readonly left: TimelineDiagram;
  private readonly right: TimelineDiagram;
  private model: TimelineModel | null = null;
  private trace: AlloyTrace | null = null;
  private profile: ViewProfile = DEFAULT_PROFILE;
  private settings: TimelineProfile = DEFAULT_TIMELINE;
  private engineResult: EngineResult = {};
  private playback: Playback = { index: 0, previous: null, history: [] };
  private focus: FocusSelection | undefined;
  private baseline: Baseline | null = null;
  private selected: { event?: TimelineEvent; row?: TimelineRow; baseline: boolean } | null = null;
  private highlights = new Set<string>();
  private matches: TimelineMatch[] = [];
  private matchIndex = -1;
  private searchWorker: Worker | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchKey = '';
  private mappings: TimelineProfile['mappings'] | null = null;
  private panelSettings: TimelineProfile | null = null;
  private panelModel: TimelineModel | null = null;
  private previousCursor = '';
  private alignment: readonly TimelineAlignment[] = [];
  private libraryEntries: readonly TimelineLibraryEntry[] = [];
  private libraryGeneration = 0;
  private matchLabel = '';
  private viewport: readonly number[] | null = null;

  constructor(private readonly callbacks: TimelineCallbacks) {
    const diagram = (baseline: boolean) => new TimelineDiagram({ select: (row, event) => this.select(row, event, baseline), initial: () => this.initial(baseline), lane: (lane) => this.laneMenu(lane, baseline), reorder: (source, target) => this.reorder(source, target), expand: (row) => this.patch({ expandedGroups: [...new Set([...this.settings.expandedGroups, ...row.transitions.map((t) => `transition:${t.id}`)])] }), manualScroll: () => { if (this.settings.follow) this.patch({ follow: false }); } });
    this.left = diagram(false); this.right = diagram(true);
    this.query.placeholder = 'participant:Client0 AND change:added'; this.query.setAttribute('aria-label', 'Timeline search');
    this.query.addEventListener('keydown', (event) => { if (event.key === 'Enter') this.commitSearch(); });
    this.detail.addEventListener('change', () => this.patch({ detail: this.detail.value as TimelineProfile['detail'] }));
    this.toolbar.append(this.query, button('Search timeline', () => this.commitSearch()), button('Clear timeline search', () => { this.clearMatches(); this.patch({ query: '' }); }), button('Previous match', () => this.navigateMatch(-1)), button('Next match', () => this.navigateMatch(1)), this.detail);
    const checkbox = (input: HTMLInputElement, label: string, key: 'follow' | 'collapseLocal' | 'showIdle') => { input.type = 'checkbox'; input.setAttribute('aria-label', label); input.addEventListener('change', () => this.patch({ [key]: input.checked })); const field = element('label'); field.append(input, document.createTextNode(label)); return field; };
    this.toolbar.append(checkbox(this.follow, 'Follow playback', 'follow'), checkbox(this.collapse, 'Collapse local events', 'collapseLocal'), checkbox(this.idle, 'Show idle participants', 'showIdle'), button('Timeline zoom −', () => this.patch({ zoom: Math.max(.5, this.settings.zoom - .1) })), button('Timeline zoom +', () => this.patch({ zoom: Math.min(2, this.settings.zoom + .1) })), this.patternKind, button('Find timeline pattern', () => this.findPattern()), button('Load saved executions', () => { void this.loadLibrary(); }));
    const baselineInput = element('input'); baselineInput.type = 'file'; baselineInput.accept = '.xml,.json'; baselineInput.setAttribute('aria-label', 'Compare Timeline file');
    baselineInput.addEventListener('change', () => { const file = baselineInput.files?.[0]; if (file) void this.importBaseline(file); baselineInput.value = ''; }); this.toolbar.append(timelineField('Compare Timeline file', baselineInput));
    this.status.setAttribute('aria-live', 'polite');
    this.root.append(element('h2', '', 'Timeline'), element('p', 'muted', 'Time flows down through atomic state-transition bands, not elapsed time. Events within one band have no implied internal order. Dashed connectors show tuple co-participation; arrows require an explicit communication mapping. Export SVG captures the visible Timeline window.'), this.toolbar, this.status, this.panels, this.results, this.libraryPanel, this.boards);
    this.root.addEventListener('keydown', (event) => this.keyboard(event));
  }

  /** Rendering is stable during playback; mappings rebuild the semantic model, other preferences only transform it. */
  update(trace: AlloyTrace, profile: ViewProfile, result: EngineResult, playback: Playback, focus?: FocusSelection): void {
    const settings = profile.timeline ?? DEFAULT_TIMELINE; const replaced = this.trace !== trace; const remap = this.mappings !== settings.mappings;
    this.trace = trace; this.profile = profile; this.settings = settings; this.engineResult = result; this.playback = playback; this.focus = focus;
    if (replaced || remap || !this.model) {
      this.model = buildTimeline(trace, settings); this.mappings = settings.mappings; this.selected = null; this.clearMatches(); this.searchKey = '';
      this.libraryGeneration++; this.libraryEntries = []; this.libraryPanel.replaceChildren();
      if (this.baseline) this.baseline.model = buildTimeline(this.baseline.trace, settings);
    }
    this.detail.value = this.baseline ? 'summary' : settings.detail; this.detail.disabled = !!this.baseline; this.detail.title = this.baseline ? 'Comparison uses aligned summary bands; inspect a band for complete event evidence.' : '';
    this.query.value = settings.query; this.follow.checked = settings.follow; this.collapse.checked = settings.collapseLocal; this.idle.checked = settings.showIdle;
    this.renderPanels(); this.draw();
    if (this.viewport && !replaced) { this.left.root.scrollTop = this.viewport[0]; this.left.root.scrollLeft = this.viewport[1]; this.right.root.scrollTop = this.viewport[2]; this.right.root.scrollLeft = this.viewport[3]; }
    this.viewport = null;
    if (settings.query && this.searchKey !== settings.query) this.search();
    const cursor = `${playback.previous ?? -1}:${playback.index}`;
    if (settings.follow && (cursor !== this.previousCursor || replaced)) { this.left.jump(playback.previous ?? -1, playback.index); this.right.jump(playback.previous ?? -1, playback.index); }
    this.previousCursor = cursor;
    if (this.selected) this.inspectSelection();
  }

  /** Optional baseline evidence is parsed before the current workspace changes, and travels with exported bundles. */
  setBaseline(bundle: TimelineBaseline | undefined): void {
    if (!bundle) { this.clearMatches(); this.searchKey = ''; this.selected = null; this.baseline = null; this.panelSettings = null; return; }
    const trace = parseAlloyXml(bundle.xml);
    if (bundle.result?.temporal === false && trace.states.length > 1) throw new Error('Static comparison metadata disagrees with a multi-state trace');
    const outcome = /^check\b/i.test(trace.command) ? 'counterexample' : 'example';
    if (bundle.result?.outcome && bundle.result.outcome !== outcome) throw new Error('Comparison outcome disagrees with captured Analyzer XML');
    const typed = bundle.result?.temporal === false ? { ...trace, traceKind: 'static' as const } : bundle.result?.temporal === true ? { ...trace, traceKind: 'temporal' as const } : trace;
    this.clearMatches(); this.searchKey = ''; this.selected = null;
    this.baseline = { bundle, trace: typed, model: buildTimeline(typed, this.settings) }; this.panelSettings = null;
  }
  /** Comparison data is optional and contains no nested exploration or executable settings. */
  baselineBundle(): TimelineBaseline | undefined { return this.baseline?.bundle; }
  /** Switching views preserves manual navigation independently of playback-follow mode. */
  leave(): void { this.viewport = [this.left.root.scrollTop, this.left.root.scrollLeft, this.right.root.scrollTop, this.right.root.scrollLeft]; }
  /** Shared atom inspection supersedes the retained Timeline event selection. */
  clearSelection(): void { this.selected = null; }
  /** Page exit releases bounded background search work. */
  dispose(): void { this.stopSearch(); this.libraryGeneration++; }
  /** Header export delegates to the current visible timeline window. */
  exportSvg(): string { return this.left.exportSvg(); }
  /** Editor updates retain saved, validated declarative preferences in the shared view profile. */
  private patch(change: Partial<TimelineProfile>): void { this.callbacks.profile({ ...this.settings, ...change }); }

  /** Preserve open editor sections across configuration changes. */
  private renderPanels(): void {
    if (!this.model || (this.panelSettings === this.settings && this.panelModel === this.model)) return;
    const open = new Set([...this.panels.querySelectorAll('details[open]')].map((e) => e.className));
    this.panels.replaceChildren(timelineParticipants(this.model, this.settings, (patch) => this.patch(patch)), timelineMappingEditor(this.model, this.settings, (patch) => this.patch(patch)), timelinePatternEditor(this.settings, (patch) => this.patch(patch), () => this.findCustomPattern()));
    if (this.baseline) this.panels.append(this.comparisonControls());
    for (const detail of this.panels.querySelectorAll('details')) if (open.has(detail.className)) detail.open = true;
    this.panelSettings = this.settings; this.panelModel = this.model;
  }

  /** Both comparison panes use aligned bands; missing transitions receive honest empty placeholders. */
  private draw(): void {
    if (!this.model) return;
    const lanes = timelineLanes(this.model, this.profile, this.settings, this.focus); const exempt = new Set(this.highlights);
    if (this.selected?.event) exempt.add(this.selected.event.id);
    const selection = { from: this.playback.previous ?? -1, to: this.playback.index, event: this.selected?.baseline ? undefined : this.selected?.event?.id };
    if (!this.baseline) {
      this.left.root.onscroll = null; this.right.root.onscroll = null;
      if (this.boards.firstElementChild !== this.left.root || this.boards.children.length !== 1) this.boards.replaceChildren(this.left.root);
      this.boards.classList.remove('sequence-comparing'); this.alignment = [];
      this.left.update(this.model, this.profile, this.settings, timelineRows(this.model, this.profile, this.settings, this.focus, exempt), lanes, selection, this.highlights);
    } else {
      this.alignment = compareTimelines(this.model, this.baseline.model, this.settings);
      if (this.boards.children.length !== 2) this.boards.replaceChildren(this.left.root, this.right.root);
      this.boards.classList.add('sequence-comparing');
      const current = this.alignedRows(false); const baseline = this.alignedRows(true);
      const baselineLanes = timelineLanes(this.baseline.model, this.baseline.bundle.profile, this.settings);
      const aligned = alignTimelineLanes(lanes, baselineLanes, this.model, this.baseline.model, this.settings);
      const comparisonSettings = { ...this.settings, collapseLocal: false, detail: 'summary' as const, expandedGroups: [] };
      this.left.update(this.model, this.profile, comparisonSettings, current, aligned.left, selection, this.highlights);
      this.right.update(this.baseline.model, this.baseline.bundle.profile, comparisonSettings, baseline, aligned.right, { from: -2, to: -2, event: this.selected?.baseline ? this.selected.event?.id : undefined }, this.highlights);
      // Scroll positions share the same aligned row heights, independent of each pane's lane count.
      this.left.root.onscroll = () => { if (Math.abs(this.right.root.scrollTop - this.left.root.scrollTop) > 1) this.right.root.scrollTop = this.left.root.scrollTop; };
      this.right.root.onscroll = () => { if (Math.abs(this.left.root.scrollTop - this.right.root.scrollTop) > 1) this.left.root.scrollTop = this.right.root.scrollTop; };
      const summary = this.panels.querySelector('.sequence-comparison-summary'); if (summary) summary.textContent = this.settings.showDifferences ? this.alignment.map((row, i) => `${i}: ${row.status}`).join(' · ') || 'Comparing initial snapshots; no transition events.' : 'Difference highlighting off; captured evidence and alignment are unchanged.';
    }
    this.status.textContent = `${this.model.temporal ? `${this.model.transitions.length} stored transitions, including the closing loop` : 'Single captured snapshot; no observed transitions'} · ${this.model.events.length} evidence-backed events · ${lanes.length - 1} participant lanes.${this.baseline ? ` Comparing current execution (left) with ${this.baseline.bundle.label} (right). ${this.alignment.filter((r) => r.status === 'tentative').length} structurally matching bands have unconfirmed participant identities.` : ''}${this.matchLabel ? ` ${this.matchLabel}` : ''}`;
  }

  /** Alignment gaps are explicit bands, not fabricated self-transitions or stutters in the evidence. */
  private alignedRows(baseline: boolean): TimelineRow[] {
    return this.alignment.map((pair, index) => {
      const transition = baseline ? pair.right : pair.left;
      const events = transition?.events.filter((e) => timelineEventVisible(e, baseline ? this.baseline!.bundle.profile : this.profile, this.settings, baseline ? undefined : this.focus)) ?? [];
      return { id: `alignment:${index}:${pair.status}`, transitions: transition ? [transition] : [], events, hidden: (transition?.events.length ?? 0) - events.length, collapsed: false, from: transition?.from ?? 0, to: transition?.to ?? 0, loop: transition?.loop ?? false };
    });
  }

  /** Clicking an event selects its original source/target pair; baseline clicks never change the current trace's state. */
  private select(row: TimelineRow, event?: TimelineEvent, baseline = false): void {
    if (!row.transitions.length) return;
    this.callbacks.claimInspector();
    this.selected = { row, event, baseline };
    const transition = event ?? row.transitions[0];
    if (!baseline) this.callbacks.select(transition.from, transition.to);
    else {
      const pair = this.alignment.find((p) => p.right?.id === row.transitions[0].id); if (pair?.left) this.left.jump(pair.left.from, pair.left.to);
    }
    this.draw(); this.inspectSelection();
  }

  /** Initial-state inspection links to the full ordinary views and captured signature counts. */
  private initial(baseline: boolean): void {
    this.callbacks.claimInspector();
    this.selected = null; const model = baseline ? this.baseline!.model : this.model!;
    if (!baseline) this.callbacks.select(-1, 0);
    const root = this.callbacks.inspector; root.replaceChildren(element('h2', '', `${baseline ? 'Baseline · ' : ''}Initial state 0`), element('p', '', model.temporal ? 'Captured state before the execution transitions.' : 'Single snapshot; no action or temporal order inferred.'));
    if (!baseline) root.append(button('Open state in Graph', () => this.callbacks.view('graph')), button('Open state in Table', () => this.callbacks.view('table')));
    for (const d of model.trace.declarations.filter((d) => d.kind === 'sig' && !d.builtin)) { const details = element('details'); details.append(element('summary', '', `${d.label} · ${model.trace.states[0].signatures[d.id]?.length ?? 0} atoms`), element('pre', '', (model.trace.states[0].signatures[d.id] ?? []).join(', ') || '∅')); root.append(details); }
  }

  /** Evidence inspection is paginated but complete, including hidden participants and every n-ary argument column. */
  private inspectSelection(page = 0): void {
    if (!this.selected || !this.model) return;
    this.callbacks.claimInspector();
    const { event, row, baseline } = this.selected; const model = baseline ? this.baseline!.model : this.model; const root = this.callbacks.inspector;
    const events = event ? [event] : row!.transitions.flatMap((t) => t.events);
    root.replaceChildren(element('h2', '', event?.label ?? `${row!.collapsed ? 'Collapsed local steps' : 'Transition'} ${row!.from} → ${row!.to}`), element('p', 'muted', baseline ? `Baseline: ${this.baseline!.bundle.label}` : 'Current captured execution'));
    if (event) {
      root.append(element('p', '', `State ${event.from} → ${event.to} · stored transition ${event.transition}`));
      const metadata = baseline ? this.baseline!.bundle.result : this.engineResult;
      const source = metadata?.declarations?.find((d) => d.label === event.sourceLabel);
      if (source) root.append(element('p', 'source-location', `${source.filename}:${source.line}:${source.column}`));
      root.append(element('p', '', event.provenance === 'observed' ? 'Observed state-difference evidence.' : event.provenance === 'recorded-value' ? 'Value explicitly captured in the selected relation/state; this does not prove a source predicate invocation.' : 'User-configured interpretation of observed changes; no predicate execution or causality inferred.'));
      const participants = element('div', 'actions'); for (const atom of event.participants) participants.append(button(atom, () => { if (baseline) root.append(element('pre', '', `${atom}: ${model.signatures.get(atom) ?? 'supporting value'}`)); else { this.selected = null; this.callbacks.atom(atom); } })); root.append(participants);
      root.append(button('Reveal event participants', () => this.patch({ hiddenLanes: this.settings.hiddenLanes.filter((a) => !event.participants.includes(a)), participantSignatures: [], showIdle: true })), button('Event source', () => this.eventSource(event, model, baseline)));
    }
    const evidence = events.flatMap((e) => e.evidence.map((v) => ({ event: e, value: v })));
    root.append(element('p', '', `${events.length} original events · ${evidence.length} evidence entries · states refer to stored positions, not loop iterations.`));
    if (row && row.transitions.length > 1) for (const transition of row.transitions) root.append(button(`Inspect state ${transition.from} → ${transition.to}`, () => this.select({ ...row, transitions: [transition], events: transition.events, from: transition.from, to: transition.to, collapsed: false }, undefined, baseline)));
    for (const { event: original, value } of evidence.slice(page * 100, (page + 1) * 100)) {
      const section = element('section', 'sequence-evidence'); section.append(button(original.label, () => this.select({ ...row!, transitions: [model.transitions[original.transition]], from: original.from, to: original.to }, original, baseline)), element('small', '', `State ${value.state} · ${value.change} · ${value.label}`), element('pre', '', value.tuple.map((atom, i) => `[${i + 1}] ${atom}`).join('\n'))); root.append(section);
    }
    if (evidence.length > 100) root.append(button('Previous evidence', () => this.inspectSelection(Math.max(0, page - 1))), element('span', '', `${page * 100 + 1}–${Math.min((page + 1) * 100, evidence.length)} of ${evidence.length}`), button('Next evidence', () => { if ((page + 1) * 100 < evidence.length) this.inspectSelection(page + 1); }));
    if (!event && !events.length) root.append(element('p', '', 'No observed changes in this stored transition (stutter).'));
  }

  /** Current source links reuse the explorer's mappings; baseline source stays attached to its own captured execution. */
  private eventSource(event: TimelineEvent, model: TimelineModel, baseline: boolean): void {
    if (!baseline) { this.callbacks.source(event.sourceLabel); return; }
    const location = this.baseline!.bundle.result?.declarations?.find((d) => d.label === event.sourceLabel);
    const sources = location ? model.trace.sources.filter((s) => s.filename === location.filename) : model.trace.sources;
    for (const source of sources) { const details = element('details'); details.open = true; details.append(element('summary', '', `${source.filename}${location ? `:${location.line}` : ''}`), element('pre', '', source.content)); this.callbacks.inspector.append(details); }
    if (!sources.length) this.callbacks.inspector.append(element('p', '', 'No captured source is available for this baseline event.'));
  }

  /** Participant actions parallel ShiViz's host menus, with explicit hidden-partner indications in event glyphs. */
  private laneMenu(lane: TimelineLane, baseline: boolean): void {
    this.callbacks.claimInspector();
    const root = this.callbacks.inspector; this.selected = null; root.replaceChildren(element('h2', '', lane.label), element('p', 'muted', baseline ? 'Baseline participant' : lane.signature || 'Global/model events'));
    if (lane.id === 'global' || lane.placeholder) return;
    const related = new Set(this.model!.events.filter((e) => e.participants.some((a) => lane.members.includes(a))).flatMap((e) => e.participants));
    root.append(button('Hide lane', () => this.patch({ hiddenLanes: [...new Set([...this.settings.hiddenLanes, ...lane.members])] })), button('Focus on related changes', () => this.patch({ focusedLanes: lane.members })), button('Reveal partners', () => this.patch({ hiddenLanes: this.settings.hiddenLanes.filter((a) => !related.has(a)), participantSignatures: [], showIdle: true })), button('Clear participant focus', () => this.patch({ focusedLanes: [] })));
    if (lane.group) root.append(button('Expand signature lanes', () => this.patch({ collapsedSignatures: this.settings.collapsedSignatures.filter((s) => s !== lane.signature) })));
    else root.append(button('Group signature lanes', () => this.patch({ collapsedSignatures: [...new Set([...this.settings.collapsedSignatures, lane.signature])] })));
    if (!baseline && lane.members[0]) root.append(button('Inspect participant', () => this.callbacks.atom(lane.members[0])));
  }

  /** Reordering changes stable lane preferences, never atom identity or colors. */
  private reorder(source: TimelineLane, target: TimelineLane): void {
    const lanes = timelineLanes(this.model!, this.profile, this.settings, this.focus).flatMap((lane) => lane.members); const filtered = lanes.filter((a) => !source.members.includes(a));
    const index = Math.max(0, filtered.indexOf(target.members[0])); filtered.splice(index, 0, ...source.members); this.patch({ laneOrder: filtered });
  }

  /** Search regexes execute only in a disposable module worker with a hard timeout and stale-result protection. */
  private search(): void {
    if (!this.model) return;
    this.stopSearch(); this.searchKey = this.settings.query; const model = this.model; const query = this.settings.query;
    const worker = new Worker(browser.runtime.getURL('alloy-timeline-search-worker.js'), { type: 'module' }); this.searchWorker = worker;
    this.matchLabel = 'Searching all original events…'; this.draw();
    const finish = (error?: string) => { if (this.searchWorker !== worker) return; this.stopSearch(); if (error) { this.matchLabel = error; this.draw(); } };
    worker.onmessage = (event: MessageEvent<{ ids?: string[]; count?: number; error?: string }>) => {
      if (this.searchWorker !== worker || this.model !== model || this.settings.query !== query) return;
      if (event.data.error) { finish(event.data.error); return; }
      const byId = new Map(model.events.map((e) => [`current:${e.id}`, { event: e, baseline: false }]));
      for (const e of this.baseline?.model.events ?? []) byId.set(`baseline:${e.id}`, { event: e, baseline: true });
      this.setMatches((event.data.ids ?? []).filter((id) => byId.has(id)).map((id) => { const found = byId.get(id)!; return { label: `${found.baseline ? 'Baseline: ' : ''}${found.event.label}`, events: [found.event.id], transitions: [found.event.transition], baseline: found.baseline }; }), `${event.data.count ?? 0} matches${this.baseline ? ' across both executions' : ''}${(event.data.count ?? 0) > 10_000 ? ' · first 10,000 available for navigation; narrow the query' : ''}`); finish();
    };
    worker.onerror = () => finish('Timeline search worker failed.');
    this.searchTimer = setTimeout(() => finish('Search timed out; simplify the regular expression or narrow the query.'), 1500);
    worker.postMessage({ records: [...model.events.map((event) => ({ ...timelineSearchRecord(event), id: `current:${event.id}` })), ...(this.baseline?.model.events ?? []).map((event) => ({ ...timelineSearchRecord(event), id: `baseline:${event.id}` }))], query });
  }
  /** Explicit resubmission restarts search even after displaying a motif overlay for the same query. */
  private commitSearch(): void { this.searchKey = ''; if (!this.query.value.trim()) this.clearMatches(); this.patch({ query: this.query.value.slice(0, 500) }); }
  /** A replacement query or page exit releases timers and worker resources. */
  private stopSearch(): void { this.searchWorker?.terminate(); this.searchWorker = null; if (this.searchTimer) clearTimeout(this.searchTimer); this.searchTimer = null; }
  /** Search/motif highlights are a reversible overlay, not destructive filtering of the trace. */
  private clearMatches(): void { this.stopSearch(); this.matches = []; this.matchIndex = -1; this.highlights.clear(); this.matchLabel = ''; this.results.replaceChildren(); }
  /** Matches exempt collapsed ranges and include hidden-event evidence. Navigation can explicitly reveal participants. */
  private setMatches(matches: TimelineMatch[], label: string): void {
    this.matches = matches; this.matchIndex = -1; this.highlights = new Set(matches.flatMap((m) => m.events)); this.matchLabel = label;
    this.results.replaceChildren(element('strong', '', label));
    for (const [index, match] of matches.slice(0, 20).entries()) this.results.append(button(`${index + 1}. ${match.label}`, () => { this.matchIndex = index - 1; this.navigateMatch(1); }));
    this.draw();
  }
  /** Match navigation restores event participants and exact transition coordinates without changing shared declaration filters. */
  private navigateMatch(direction: number): void {
    if (!this.matches.length || !this.model) return;
    this.matchIndex = (this.matchIndex + direction + this.matches.length) % this.matches.length; const match = this.matches[this.matchIndex];
    const model = match.baseline ? this.baseline?.model : this.model; if (!model) return;
    const event = model.events.find((e) => e.id === match.events[0]); if (!event) return;
    const transitions = model.transitions.filter((t) => match.transitions.includes(t.id));
    const participants = new Set(model.events.filter((e) => match.events.includes(e.id)).flatMap((e) => e.participants));
    if ([...participants].some((atom) => this.settings.hiddenLanes.includes(atom)) || this.settings.focusedLanes.length || this.settings.participantSignatures.length) this.patch({ hiddenLanes: this.settings.hiddenLanes.filter((a) => !participants.has(a)), focusedLanes: [], participantSignatures: [], showIdle: true });
    this.select({ id: `match:${this.matchIndex}`, transitions, events: transitions.flatMap((t) => t.events), hidden: 0, collapsed: false, from: event.from, to: event.to, loop: transitions.some((t) => t.loop) }, event, match.baseline);
    (match.baseline ? this.right : this.left).jump(event.from, event.to);
  }
  /** Predefined motifs report exactly which relation/action evidence supports each match. */
  private findPattern(): void {
    if (!this.model) return; this.stopSearch(); const kind = this.patternKind.value as Parameters<typeof timelinePatterns>[1];
    const matches = timelinePatterns(this.model, kind); this.setMatches(matches, `${matches.length} ${this.patternKind.selectedOptions[0].textContent} matches${matches.length >= 1000 ? ' · showing up to 1,000; narrow the pattern' : ''}${kind === 'request-response' ? ' · requires communication mappings and correlation columns' : ''}`);
  }
  /** Custom patterns use a bounded state-ordered matcher and expose any search bound reached. */
  private findCustomPattern(): void { if (this.model) { this.stopSearch(); const found = findTimelinePattern(this.model, this.settings.pattern); this.setMatches(found.matches, `${found.matches.length} custom pattern matches${found.limited ? ' · bounded search frontier reached; narrow the pattern' : ''}`); } }

  /** Baseline import accepts raw XML or saved artifacts, independent of the native engine. */
  private async importBaseline(file: File): Promise<void> {
    try { if (file.size > 24 * 1024 * 1024) throw new Error('Comparison file is too large'); const text = await file.text(); const saved = text.trimStart().startsWith('{') ? readExploration(text) : null;
      this.setBaseline(saved ? { label: saved.label, xml: saved.xml, profile: saved.profile, result: validateEngineResult({ ...saved.result, xml: undefined }) } : { label: file.name, xml: text, profile: DEFAULT_PROFILE }); this.patch({ confirmedPairs: [] });
    } catch (error) { this.status.textContent = `Comparison import failed: ${String(error)}`; }
  }

  /** Cross-trace identities require a stable Int/String field or explicit user-confirmed pairs. */
  private comparisonControls(): HTMLElement {
    const root = element('details', 'sequence-comparison-controls'); root.open = true; root.append(element('summary', '', `Compare with ${this.baseline!.bundle.label}`));
    const alignment = timelineSelect('Timeline comparison alignment', [['state', 'By stored transition index'], ['actions', 'By event/action sequence']], this.settings.alignment);
    alignment.addEventListener('change', () => this.patch({ alignment: alignment.value as TimelineProfile['alignment'] }));
    const fields = this.model!.trace.declarations.filter((d) => d.kind !== 'sig' && d.types.some((t) => t.length === 2));
    const identity = timelineSelect('Timeline identity field', [['', 'Unconfirmed structural alignment'], ...fields.map((d): [string, string] => [timelineDeclarationKey(this.model!.trace, d), `${d.label} → stable Int/String values`])], this.settings.identityField);
    identity.addEventListener('change', () => this.patch({ identityField: identity.value }));
    const left = timelineSelect('Current participant identity', this.model!.atoms.map((a) => [a, a])); const right = timelineSelect('Baseline participant identity', this.baseline!.model.atoms.map((a) => [a, a])); if (left.options.length) left.selectedIndex = 0; if (right.options.length) right.selectedIndex = 0;
    root.append(element('p', 'muted', 'Alloy atom names are trace-local. Matching printed names alone does not confirm identity. Identity fields must have one stable, unique Int/String value across the trace; otherwise matches remain tentative. Confirm individual participant pairs below.'), alignment, identity, left, right, button('Confirm participant pair', () => { if (left.value && right.value) this.patch({ confirmedPairs: [...this.settings.confirmedPairs.filter((p) => p.left !== left.value && p.right !== right.value), { left: left.value, right: right.value }] }); }), button('Next divergence', () => this.nextDivergence()), button('Close Timeline comparison', () => { this.setBaseline(undefined); this.patch({ confirmedPairs: [] }); }));
    const differences = element('input'); differences.type = 'checkbox'; differences.checked = this.settings.showDifferences; differences.addEventListener('change', () => this.patch({ showDifferences: differences.checked })); root.append(timelineField('Highlight Timeline differences', differences));
    for (const pair of this.settings.confirmedPairs) root.append(button(`Remove identity ${pair.left} ↔ ${pair.right}`, () => this.patch({ confirmedPairs: this.settings.confirmedPairs.filter((p) => p !== pair) })));
    root.append(element('p', 'sequence-comparison-summary', this.alignment.map((row, i) => `${i}: ${row.status}`).join(' · ') || 'Comparing initial snapshots.'));
    return root;
  }
  /** Navigate only actual divergences; tentative correspondence is labelled separately. */
  private nextDivergence(): void {
    const current = this.alignment.findIndex((p) => p.left?.from === this.playback.previous && p.left.to === this.playback.index);
    for (let offset = 1; offset <= this.alignment.length; offset++) {
      const pair = this.alignment[(current + offset + this.alignment.length) % this.alignment.length]; if (pair.status === 'same' || pair.status === 'tentative') continue;
      const transition = pair.left ?? pair.right!; const baseline = !pair.left;
      this.select({ id: 'divergence', transitions: [transition], events: transition.events, hidden: 0, collapsed: false, from: transition.from, to: transition.to, loop: transition.loop }, undefined, baseline); (baseline ? this.right : this.left).jump(transition.from, transition.to); break;
    }
  }

  /** Saved executions are loaded on demand, with an aggregate evidence budget and stale-load cancellation. */
  private async loadLibrary(): Promise<void> {
    const generation = ++this.libraryGeneration; this.libraryPanel.replaceChildren(element('p', '', 'Loading saved executions…'));
    try {
      const entries = await this.callbacks.library(); if (generation !== this.libraryGeneration) return;
      let bytes = 0; this.libraryEntries = entries.slice(0, 10).filter((entry) => { if (bytes + entry.xml.length > 24 * 1024 * 1024) return false; bytes += entry.xml.length; return true; });
      const executions: { label: string; model: TimelineModel }[] = [{ label: 'Current execution', model: this.model! }]; this.libraryPanel.replaceChildren(element('h3', '', 'Saved executions'));
      for (const entry of this.libraryEntries) {
        try { const parsed = parseAlloyXml(entry.xml); const trace = entry.result?.temporal === false ? { ...parsed, traceKind: 'static' as const } : entry.result?.temporal === true ? { ...parsed, traceKind: 'temporal' as const } : parsed; executions.push({ label: `${entry.label} [${entry.id.slice(-6)}]`, model: buildTimeline(trace, this.settings) }); this.libraryPanel.append(button(`Compare: ${entry.label}`, () => { this.setBaseline(entry); this.patch({ confirmedPairs: [] }); })); } catch { this.libraryPanel.append(element('p', '', `Could not parse saved execution: ${entry.label}`)); }
        await new Promise<void>((resolve) => setTimeout(resolve, 0)); if (generation !== this.libraryGeneration) return;
      }
      const metric = timelineSelect('Execution grouping metric', [['participants', 'Participant count'], ['actions', 'Structural/event sequence'], ['divergence', 'Structural divergence from current']], 'participants');
      const groups = element('div'); const draw = () => { groups.replaceChildren(); for (const group of clusterTimelines(executions, metric.value as 'participants' | 'actions' | 'divergence')) groups.append(element('p', '', `${group.label}: ${group.executions.join(', ')}`)); }; metric.addEventListener('change', draw); draw(); this.libraryPanel.append(metric, groups);
      const motifs = discoverTimelineMotifs(executions); const details = element('details', 'sequence-discovered-patterns'); details.append(element('summary', '', `${motifs.length} repeated 2–4-transition structural motifs${motifs.length >= 100 ? ' · strongest 100 shown' : ''}`));
      for (const motif of motifs) { const occurrence = motif.occurrences.find((o) => o.execution === 'Current execution'); details.append(button(`${motif.label} · ${motif.occurrences.length} occurrences`, () => { this.callbacks.claimInspector(); this.selected = null; this.callbacks.inspector.replaceChildren(element('h2', '', motif.label), ...motif.occurrences.map((o) => element('p', '', `${o.execution}: transition ${o.transition}`))); if (occurrence) { const t = this.model!.transitions[occurrence.transition]; this.left.jump(t.from, t.to); } })); }
      this.libraryPanel.append(details, element('p', 'muted', `Loaded ${executions.length - 1} saved executions within the 24 MiB library budget. Structural motifs describe stored state order, not causal equivalence.`));
    } catch (error) { this.libraryPanel.replaceChildren(element('p', '', String(error))); }
  }

  /** Keyboard navigation follows logical events/transitions without hijacking text-editing controls. */
  private keyboard(event: KeyboardEvent): void {
    if ((event.target as Element).closest('input,textarea,select') || !this.model) return;
    if (event.key === 'Escape') { this.clearMatches(); this.selected = null; this.patch({ focusedLanes: [], query: '' }); return; }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); const index = this.model.events.findIndex((e) => e.id === this.selected?.event?.id); const next = this.model.events[Math.max(0, Math.min(this.model.events.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))]; if (!next) return;
      const transition = this.model.transitions[next.transition]; this.select({ id: 'keyboard', transitions: [transition], events: transition.events, hidden: 0, collapsed: false, from: transition.from, to: transition.to, loop: transition.loop }, next); this.left.jump(next.from, next.to);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault(); const index = this.model.transitions.findIndex((t) => t.from === this.playback.previous && t.to === this.playback.index); const next = this.model.transitions[Math.max(0, Math.min(this.model.transitions.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]; if (next) { this.select({ id: 'keyboard', transitions: [next], events: next.events, hidden: 0, collapsed: false, from: next.from, to: next.to, loop: next.loop }); this.left.jump(next.from, next.to); }
    }
  }
}

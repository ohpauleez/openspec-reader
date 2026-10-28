import browser from 'webextension-polyfill';
import { button, element } from '../dom';
import { parseAlloyDocument } from '../alloy-document';
import { parseAlloyXml } from './xml';
import type { AlloyTrace, EngineResult, ModelLaunch, TraceFocus, ViewProfile } from './types';
import { DEFAULT_FOCUS, DEFAULT_PROFILE, validateLaunch } from './types';
import { composeModel, originalLocation, stateAtoms, stepBack, stepForward, tupleDifference } from './model';
import type { Playback } from './model';
import { InstanceGraph } from './graph';
import { atomId, createGraphLayout, elkGraph, graphAtoms, installLayout, layoutTopology, MAX_GRAPH_ATOMS, restoreGraphLayout, saveGraphLayout } from './graph-layout';
import type { SavedGraphLayout } from './graph-layout';
import { layoutInWorker } from './layout-engine';
import { relationTables } from './tables';
import { AnalysisPanel, outcomeText } from './analysis-panel';
import type { ExecutionSnapshot } from './analysis-panel';
import { download, readExploration } from './save';
import type { Exploration } from './save';
import { isAlloyModelFile, modelFileLaunch } from './model-files';
import { customizeSignatureColor, prepareSignatureColors, SignatureColors } from './colors';
import { signatureColorLegend } from './color-legend';
import { neighboringAtoms, traceFocus } from './focus';
import type { FocusSelection } from './focus';
import { TimelineWorkspace } from './timeline-view';
import { isTemporalTimeline } from './timeline-model';

type InspectorSelection = { readonly kind: 'none' } | { readonly kind: 'atom'; readonly atom: string } | { readonly kind: 'timeline' };

/** Extension-owned Alloy workspace. Import/rendering never depends on a local engine. */
class Explorer {
  private readonly root = document.querySelector<HTMLElement>('#explorer')!;
  private readonly sidebar = element('aside', 'explorer-sidebar');
  private readonly main = element('section', 'explorer-main');
  private readonly content = element('div', 'visualization');
  private readonly inspector = element('aside', 'inspector');
  private readonly status = element('p', 'workspace-status', 'Open a model or import an Alloy XML result to begin.');
  private readonly parts = element('div', 'model-parts');
  private readonly filters = element('div', 'filters');
  private readonly colorPanel = element('div', 'signature-color-controls');
  private readonly colorLegend = element('details', 'graph-color-legend');
  private legendProfile: ViewProfile | null = null;
  private readonly timeline = element('div', 'timeline');
  private readonly caption = element('input');
  private readonly sourceText = element('textarea');
  private readonly rootChoice = element('select');
  private readonly filename = element('input');
  private readonly projection = element('select');
  private readonly watchInput = element('input');
  private readonly watches = element('div', 'watches');
  private readonly sourcePanel = element('div', 'source-panel');
  private readonly layout = createGraphLayout();
  private readonly graphs = [new InstanceGraph((atom) => this.inspect(atom), this.layout, () => this.layoutChanged()), new InstanceGraph((atom) => this.inspect(atom), this.layout, () => this.layoutChanged())];
  private readonly layoutAlgorithm = element('select');
  private readonly layoutDirection = element('select');
  private readonly layoutScope = element('select');
  private readonly layoutStatus = element('output', 'layout-status');
  private layoutJob: AbortController | null = null;
  private fitPending = false;
  private readonly focusMode = element('select');
  private readonly focusContext = element('select');
  private readonly contextEdges = element('input');
  private readonly focusAtom = element('select');
  private readonly focusStatus = element('output', 'focus-status');
  private readonly focusOverrides = element('div', 'focus-overrides');
  private focusSelection: FocusSelection | undefined;
  private readonly engine: AnalysisPanel;
  private launch: ModelLaunch | null = null;
  private selected: string[] = [];
  private files: { path: string; content: string }[] = [];
  private trace: AlloyTrace | null = null;
  private xml = '';
  private result: EngineResult = {};
  private loadedMetadata: EngineResult = {};
  private evidence: ExecutionSnapshot | null = null;
  private inspection: InspectorSelection = { kind: 'none' };
  private profile: ViewProfile = DEFAULT_PROFILE;
  private playback: Playback = { index: 0, previous: null, history: [] };
  private view: 'graph' | 'table' | 'timeline' | 'compare' | 'source' = 'graph';
  private readonly sequence = new TimelineWorkspace({
    profile: (timeline) => { this.profile = { ...this.profile, timeline }; this.renderState(); },
    select: (from, to) => { this.pause(); this.inspection = { kind: 'timeline' }; this.playback = { index: to, previous: from < 0 ? null : from, history: [] }; this.renderState(); },
    atom: (atom) => this.inspect(atom),
    view: (view) => { this.view = view; this.renderState(); },
    source: (label) => this.showDeclaration(label),
    inspector: this.inspector,
    claimInspector: () => { this.inspection = { kind: 'timeline' }; },
    library: async () => { const all = await browser.storage.local.get(null); const entries = []; for (const [id, value] of Object.entries(all)) if (id.startsWith('alloy-snapshot:')) { const saved = readExploration(JSON.stringify(value)); entries.push({ id, label: saved.label, xml: saved.xml, profile: saved.profile, result: saved.result }); } return entries; },
  });
  private diffs = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly playButton = button('Play trace', () => this.play());
  private readonly stateSelect = element('select');
  private readonly saved = element('select');

  constructor() {
    this.engine = new AnalysisPanel(() => this.execution(), () => this.playback.index, (data, snapshot) => this.engineResult(data, snapshot));
    this.root.replaceChildren();
    this.caption.placeholder = 'Example / requirement / scenario label'; this.caption.setAttribute('aria-label', 'Example label');
    this.filename.value = 'model.als'; this.filename.setAttribute('aria-label', 'Root module filename');
    this.sourceText.readOnly = true; this.sourceText.setAttribute('aria-label', 'Captured assembled Alloy model');
    this.rootChoice.setAttribute('aria-label', 'Uploaded root model');
    this.rootChoice.hidden = true;
    this.rootChoice.addEventListener('change', () => {
      const file = this.files.find((file) => file.path === this.rootChoice.value);
      if (file) this.setLaunch(modelFileLaunch(file));
    });
    this.watchInput.placeholder = '#Node, events, or another Alloy expression'; this.watchInput.setAttribute('aria-label', 'Alloy watch expression');
    this.projection.setAttribute('aria-label', 'Project atom'); this.projection.addEventListener('change', () => { this.profile = { ...this.profile, projection: this.projection.value }; this.visibilityChanged(); });
    this.stateSelect.setAttribute('aria-label', 'Trace state'); this.stateSelect.addEventListener('change', () => { this.pause(); const index = Number(this.stateSelect.value); this.playback = { index, previous: index > 0 ? index - 1 : null, history: [] }; this.renderState(); });
    this.filename.addEventListener('change', () => this.changed());
    const header = element('header', 'workspace-header');
    header.append(element('h1', '', '◈ Alloy explorer'), this.caption, button('Save snapshot', () => { void this.save(); }), button('Export bundle', () => this.exportBundle()), button('Export SVG', () => this.exportSvg()), button('Theme', () => { this.root.classList.toggle('dark'); }));
    const imports = element('section'); imports.append(element('h2', '', 'Model and result files'), fileControl('Open model / add modules', '.als,.md', true, (files) => { void this.openModels(files); }), fileControl('Add module folder', '.als,.md', true, (files) => { void this.openModels(files); }, true), fileControl('Import result / saved bundle', '.xml,.json', false, (files) => { if (files[0]) void this.importFile(files[0]); }));
    this.saved.setAttribute('aria-label', 'Saved explorations'); this.saved.addEventListener('change', () => { if (this.saved.value) void this.openSaved(this.saved.value); });
    imports.append(this.saved);
    const composition = element('details', 'composition'); composition.open = true;
    composition.append(element('summary', '', 'Execution unit / selected model fragments'), this.parts, this.rootChoice, this.filename, this.sourceText, element('p', 'muted', 'A .md root is a complete literate Alloy model, with YAML front matter and ```alloy fences parsed by Alloy itself. For extracted fragments, select only those belonging to the same module. Imports come from added .als/.md files or the optional local project root.'));
    const watchPanel = element('section'); watchPanel.append(element('h2', '', 'Expression watches'), this.watchInput, button('Add watch', () => this.addWatch()), button('Evaluate at selected state', () => { void this.evaluate(); }), this.watches, element('p', 'muted', 'Watches require a live satisfying solution. Values refer to stored trace positions, not playback loop iterations.'));
    this.sidebar.append(imports, composition, this.engine.root, this.filters, this.colorPanel, watchPanel);
    const views = element('nav', 'view-tabs'); views.setAttribute('aria-label', 'Alloy visualization views');
    for (const name of ['graph', 'table', 'timeline', 'compare', 'source'] as const) views.append(button(name === 'compare' ? 'Adjacent states' : name[0].toUpperCase() + name.slice(1), () => { if (name === 'compare' && this.view !== name) this.fitPending = true; this.view = name; this.renderState(); }));
    views.append(button('Fit graph', () => { this.fitPending = true; this.renderState(); }));
    views.append(button('Toggle sidebar', () => { this.root.classList.toggle('sidebar-collapsed'); }));
    const diff = element('input'); diff.type = 'checkbox'; diff.checked = true; diff.addEventListener('change', () => { this.diffs = diff.checked; this.renderState(); });
    const diffLabel = element('label'); diffLabel.append(diff, document.createTextNode(' Show differences')); views.append(diffLabel);
    const controls = element('div', 'playback-controls'); controls.append(button('Previous state', () => { if (this.trace) { this.pause(); this.playback = stepBack(this.playback); this.renderState(); } }), this.playButton,
      button('Next state', () => { if (this.trace) { this.pause(); this.playback = stepForward(this.playback, this.trace); this.renderState(); } }), this.stateSelect);
    const display = element('div', 'workspace-display'); display.append(this.content, this.inspector);
    this.main.append(this.status, views, this.layoutControls(), this.focusControls(), controls, this.timeline, display);
    this.root.append(header, this.sidebar, this.main);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    window.addEventListener('pagehide', () => { this.pause(); this.layoutJob?.abort(); this.sequence.dispose(); this.engine.close(); });
    this.renderState(); void this.restore();
  }

  private async restore(): Promise<void> {
    const token = location.hash.slice(1);
    if (token) {
      const key = `alloy-launch:${token}`;
      const stored = await browser.storage.local.get(key);
      const launch = validateLaunch(stored[key]);
      if (launch) this.setLaunch(launch);
    }
    await this.listSaved();
  }
  private setLaunch(launch: ModelLaunch): void {
    this.launch = launch; this.selected = [...launch.selected]; this.caption.value = launch.title;
    this.parts.replaceChildren();
    for (const part of launch.parts) {
      const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.checked = this.selected.includes(part.id);
      const label = element('label', 'part'); label.append(checkbox, document.createTextNode(part.label));
      checkbox.addEventListener('change', () => { this.selected = Array.from(this.parts.querySelectorAll<HTMLInputElement>('input:checked')).map((input) => input.value); this.changed(); });
      checkbox.value = part.id; this.parts.append(label);
    }
    const compiled = composeModel(launch, this.selected).source;
    this.filename.value = launch.filename ?? suggestedFilename(compiled, launch.parts.find((part) => this.selected.includes(part.id))?.sourceUrl);
    this.changed();
  }
  private changed(): void {
    this.sourceText.value = this.launch ? composeModel(this.launch, this.selected).source : '';
    this.engine.invalidate();
    if (this.trace) this.status.textContent = 'Model selection changed. The displayed result retains its captured source/provenance; load commands to analyse the new selection.';
  }
  private execution(): ExecutionSnapshot {
    if (!this.launch) throw new Error('Open an Alloy model first, or select an Alloy fence from a reader');
    const source = composeModel(this.launch, this.selected).source;
    if (!source.trim()) throw new Error('Select at least one model fragment');
    return { launch: this.launch, selected: [...this.selected], payload: { source, filename: this.filename.value, files: this.files, sourceUrl: this.launch.parts.length === 1 ? this.launch.parts[0].sourceUrl : '' } };
  }

  private async openModels(files: readonly File[]): Promise<void> {
    try {
      const models = files.filter((file) => isAlloyModelFile(file.name));
      if (!models.length || models.length > 256) throw new Error('Select 1–256 .als or .md model files');
      if (models.reduce((size, file) => size + file.size, 0) > 16 * 1024 * 1024) throw new Error('Module files exceed 16 MiB');
      const loaded = await Promise.all(models.map(async (file) => {
        if (file.size > 8 * 1024 * 1024) throw new Error('Model is too large');
        return { path: file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name, content: await file.text() };
      }));
      const combined = [...this.files.filter((file) => !loaded.some((next) => next.path === file.path)), ...loaded];
      if (combined.length > 256 || combined.reduce((size, file) => size + new TextEncoder().encode(file.content).byteLength, 0) > 16 * 1024 * 1024) throw new Error('Module bundle exceeds 256 files / 16 MiB');
      this.files = combined;
      this.updateRootChoices();
      if (!this.launch && loaded[0]) this.setLaunch(modelFileLaunch(loaded[0]));
      else this.changed();
      this.status.textContent = `${this.files.length} .als/.md module files available. Choose an uploaded root model to switch files; a .md file opens as one complete literate model.`;
    } catch (error) { this.status.textContent = String(error); }
  }
  private async importFile(file: File): Promise<void> {
    try {
      if (file.size > 24 * 1024 * 1024) throw new Error('Result is too large');
      const text = await file.text();
      if (text.trimStart().startsWith('{')) {
        const saved = readExploration(text); const trace = validatedTrace(saved.xml, saved.result);
        this.sequence.setBaseline(saved.timelineBaseline);
        this.engine.invalidate(); this.pause(); if (saved.launch) this.setLaunch({ ...saved.launch, selected: saved.selected });
        this.profile = saved.profile; this.files = [...(saved.files ?? [])]; this.updateRootChoices(); this.caption.value = saved.label; this.evidence = saved.launch ? { launch: saved.launch, selected: saved.selected, payload: {} } : null;
        this.applyTrace(saved.xml, saved.result, trace, saved.graphLayout, true);
      } else { const trace = validatedTrace(text, {}); this.sequence.setBaseline(undefined); this.engine.invalidate(); this.pause(); this.evidence = null; if (this.profile.colorTheme?.model !== JSON.stringify(['', trace.filename])) this.profile = DEFAULT_PROFILE; this.applyTrace(text, {}, trace); }
    } catch (error) { this.status.textContent = `Import failed: ${String(error)}`; }
  }
  private applyTrace(xml: string, result: EngineResult, trace: AlloyTrace = validatedTrace(xml, result), savedLayout?: SavedGraphLayout, restoring = false): void {
    const inferred = /^check\b/i.test(trace.command) ? 'counterexample' : 'example';
    this.pause(); this.xml = xml; this.trace = trace;
    if (!restoring && this.profile.timeline?.confirmedPairs.length) this.profile = { ...this.profile, timeline: { ...this.profile.timeline, confirmedPairs: [] } };
    const sourceUrl = this.evidence?.launch?.parts[0]?.sourceUrl.split('#')[0] ?? '';
    const entry = this.evidence?.launch?.filename ?? result.provenance?.entryFile ?? trace.filename;
    const previousModel = this.profile.colorTheme?.model;
    this.profile = prepareSignatureColors(trace, this.profile, JSON.stringify([sourceUrl, entry]));
    if (previousModel && previousModel !== this.profile.colorTheme?.model && this.profile.focus) this.profile = { ...this.profile, focus: { ...this.profile.focus, alwaysShow: [], ignoredRelations: [] } };
    if (this.profile.projection && !trace.states.some((state) => stateAtoms(state).includes(this.profile.projection))) this.profile = { ...this.profile, projection: '' };
    this.inspection = { kind: 'none' }; this.inspector.replaceChildren();
    this.result = { ...result, outcome: result.outcome ?? inferred };
    this.playback = { index: 0, previous: null, history: [] };
    this.layoutJob?.abort(); this.layoutJob = null;
    this.layout.positions.clear(); this.layout.routes.clear(); this.layout.pins.clear();
    if (savedLayout) restoreGraphLayout(this.layout, savedLayout);
    this.fitPending = true;
    this.syncLayoutControls();
    for (const graph of this.graphs) graph.setTrace(trace);
    this.stateSelect.replaceChildren();
    for (let i = 0; i < trace.states.length; i++) { const option = element('option', '', `State ${i}`); option.value = String(i); this.stateSelect.append(option); }
    this.buildFilters(); this.buildFocusAtoms(); this.renderWatches(); this.status.textContent = `${outcomeText(this.result)} ${trace.command} · ${trace.states.length} stored states · ${isTemporalTimeline(trace) ? `loop to ${trace.loopStart}` : 'single captured snapshot'} · ${trace.bitwidth}-bit integers.`;
    this.renderState();
    if (savedLayout?.positions.length) this.layoutStatus.textContent = 'Saved layout restored.';
    else void this.arrange();
  }

  /** Layout settings are explicit; playback never requests or installs a new layout. */
  private layoutControls(): HTMLElement {
    const root = element('div', 'layout-controls'); root.setAttribute('aria-label', 'Graph layout controls');
    const choices = (select: HTMLSelectElement, label: string, options: [string, string][]) => {
      select.setAttribute('aria-label', label);
      for (const [value, text] of options) { const option = element('option', '', text); option.value = value; select.append(option); }
      const field = element('label'); field.append(document.createTextNode(`${label} `), select); root.append(field);
    };
    choices(this.layoutAlgorithm, 'Graph layout', [['layered', 'Layered'], ['force', 'Force-directed']]);
    choices(this.layoutDirection, 'Layout direction', [['RIGHT', 'Left to right'], ['DOWN', 'Top to bottom']]);
    choices(this.layoutScope, 'Layout scope', [['trace', 'Whole trace (stable)'], ['state', 'Current state']]);
    const changed = () => {
      this.layout.settings = { ...this.layout.settings, algorithm: this.layoutAlgorithm.value === 'force' ? 'force' : 'layered', direction: this.layoutDirection.value === 'DOWN' ? 'DOWN' : 'RIGHT', scope: this.layoutScope.value === 'state' ? 'state' : 'trace' };
      this.syncLayoutControls(); void this.arrange();
    };
    for (const select of [this.layoutAlgorithm, this.layoutDirection, this.layoutScope]) select.addEventListener('change', changed);
    root.append(button('Arrange graph', () => { void this.arrange(); }), button('Layout current state', () => { this.layout.settings = { ...this.layout.settings, scope: 'state' }; this.syncLayoutControls(); void this.arrange(); }), button('Unpin all', () => { this.layout.pins.clear(); this.layoutChanged(); }));
    this.layoutStatus.setAttribute('aria-live', 'polite'); root.append(this.layoutStatus); return root;
  }
  /** Keep restored settings and control state consistent. */
  private syncLayoutControls(): void {
    this.layoutAlgorithm.value = this.layout.settings.algorithm; this.layoutDirection.value = this.layout.settings.direction; this.layoutScope.value = this.layout.settings.scope;
    this.layoutDirection.disabled = this.layout.settings.algorithm !== 'layered';
  }
  /** Manual edits supersede pending automatic work and are shared by both comparison panes. */
  private layoutChanged(): void {
    this.layoutJob?.abort(); this.layoutJob = null; this.layoutStatus.textContent = `${this.layout.pins.size} pinned atoms. Arrange preserves pinned positions.`; this.renderState();
  }
  /** Filtering leaves stable coordinates intact and prevents an obsolete worker result from being installed. */
  private visibilityChanged(): void {
    this.layoutJob?.abort(); this.layoutJob = null; this.layoutStatus.textContent = 'Visibility changed. Choose Arrange graph to reorganize visible declarations.'; this.renderState();
  }
  /** Focus visibility is independent of layout pins and never rearranges existing atom coordinates. */
  private updateFocus(change: Partial<TraceFocus>): void {
    this.profile = { ...this.profile, focus: { ...(this.profile.focus ?? DEFAULT_FOCUS), ...change } }; this.fitPending = true; this.visibilityChanged();
  }
  /** Explicit graph-scope controls keep omitted context discoverable and leave tables complete. */
  private focusControls(): HTMLElement {
    const root = element('div', 'focus-controls'); root.setAttribute('aria-label', 'Trace focus controls');
    const choice = (select: HTMLSelectElement, label: string, options: [string, string][]) => {
      select.setAttribute('aria-label', label);
      for (const [value, text] of options) { const option = element('option', '', text); option.value = value; select.append(option); }
      const field = element('label'); field.append(document.createTextNode(`${label} `), select); root.append(field);
    };
    choice(this.focusMode, 'Trace visibility', [['full', 'Full instance'], ['trace', 'Trace focus'], ['step', 'Step focus']]);
    choice(this.focusContext, 'Focus context', [['one', 'One hop'], ['none', 'None']]);
    this.focusMode.addEventListener('change', () => this.updateFocus({ mode: this.focusMode.value === 'trace' ? 'trace' : this.focusMode.value === 'step' ? 'step' : 'full' }));
    this.focusContext.addEventListener('change', () => this.updateFocus({ context: this.focusContext.value === 'none' ? 'none' : 'one' }));
    this.contextEdges.type = 'checkbox'; this.contextEdges.checked = true; this.contextEdges.setAttribute('aria-label', 'Hide links between context atoms');
    this.contextEdges.addEventListener('change', () => this.updateFocus({ hideContextEdges: this.contextEdges.checked }));
    const edgeLabel = element('label'); edgeLabel.append(this.contextEdges, document.createTextNode(' Hide links between context atoms')); root.append(edgeLabel);
    this.focusAtom.setAttribute('aria-label', 'Always-show atom'); root.append(this.focusAtom, button('Always show selected atom', () => { if (this.focusAtom.value) this.keepAtoms([this.focusAtom.value]); }), button('Clear always-show atoms', () => this.updateFocus({ alwaysShow: [] })), button('Show all atoms', () => this.updateFocus({ mode: 'full' })));
    this.focusStatus.setAttribute('aria-live', 'polite'); root.append(this.focusStatus, this.focusOverrides); return root;
  }
  /** The dropdown also exposes atoms currently hidden by focus, subject to normal declaration filters when shown. */
  private buildFocusAtoms(): void {
    this.focusAtom.replaceChildren(element('option', '', 'Choose an atom to keep…')); this.focusAtom.options[0].value = '';
    if (!this.trace) return;
    const atoms = graphAtoms(this.trace, this.trace.states, { ...this.profile, hiddenSignatures: [], hiddenRelations: [], projection: '' });
    for (const atom of atoms.slice(0, 20_000)) { const option = element('option', '', atom); option.value = atom; this.focusAtom.append(option); }
  }
  /** Bounded user overrides do not implicitly pin the atom's position or expand context recursively. */
  private keepAtoms(atoms: readonly string[]): void {
    this.updateFocus({ alwaysShow: [...new Set([...(this.profile.focus?.alwaysShow ?? []), ...atoms])].slice(0, 20_000) });
  }
  /** Report graph omissions separately from declaration filters and display caps; all current values remain in tables. */
  private renderFocusStatus(current: AlloyTrace['states'][number], before: AlloyTrace['states'][number] | null): void {
    const focus = this.focusSelection!; const options = focus.options;
    this.focusMode.value = options.mode; this.focusContext.value = options.context; this.contextEdges.checked = options.hideContextEdges;
    this.focusContext.disabled = this.contextEdges.disabled = options.mode === 'full';
    const eligible = graphAtoms(this.trace!, [current, ...(before ? [before] : [])], this.profile);
    const visible = focus.active ? eligible.filter((atom) => focus.allowed.has(atom)) : eligible;
    this.focusStatus.textContent = `${focus.message} · Showing ${Math.min(visible.length, MAX_GRAPH_ATOMS)} of ${eligible.length} atoms · ${eligible.length - visible.length} hidden by focus${visible.length > MAX_GRAPH_ATOMS ? ' · graph limited to 400' : ''}.${focus.active ? ` ${focus.membershipCount} signature membership changes · ${focus.addedCount} tuples added · ${focus.removedCount} removed${options.mode === 'trace' ? ' across all transitions, including the loop' : ''}.` : ''} Tables retain complete values; always-show overrides respect declaration filters and projection.`;
    this.focusOverrides.replaceChildren();
    for (const atom of options.alwaysShow.slice(0, 100)) this.focusOverrides.append(button(`Stop always showing ${atom}`, () => this.updateFocus({ alwaysShow: options.alwaysShow.filter((value) => value !== atom) })));
    if (options.alwaysShow.length > 100) this.focusOverrides.append(element('span', '', `${options.alwaysShow.length - 100} more overrides; inspect an atom to remove it or clear all.`));
  }
  /** Run a cancellable worker against a captured topology; stale results cannot alter a replacement trace or drag. */
  private async arrange(): Promise<void> {
    if (!this.trace) return;
    this.layoutJob?.abort(); const job = new AbortController(); this.layoutJob = job;
    const trace = this.trace; const profile = this.profile;
    const states = this.layout.settings.scope === 'trace' ? trace.states : [trace.states[this.playback.index]];
    const topology = layoutTopology(trace, profile, states, this.layout.settings.ignoredRelations, this.focusSelection);
    this.layoutStatus.textContent = 'Arranging graph…';
    try {
      const result = await layoutInWorker(elkGraph(topology, this.layout.settings), browser.runtime.getURL('alloy-layout-worker.js'), job.signal);
      if (job.signal.aborted || this.trace !== trace || this.layoutJob !== job) return;
      installLayout(this.layout, result); this.fitPending = true; this.renderState();
      this.layoutStatus.textContent = `${this.layout.settings.algorithm === 'layered' ? 'Layered' : 'Force-directed'} layout · ${this.layout.settings.scope === 'trace' ? 'whole trace' : 'captured state'} · ${this.layout.pins.size} pinned${topology.truncated ? ' · layout display limit reached; use filters or tables' : ''}.`;
    } catch (error) { if (!job.signal.aborted) this.layoutStatus.textContent = `Layout failed: ${String(error)} Drag nodes to arrange manually or retry.`; }
    finally { if (this.layoutJob === job) this.layoutJob = null; }
  }
  private engineResult(data: EngineResult, snapshot: ExecutionSnapshot): void {
    if (data.diagnostic) {
      const diagnostic = data.diagnostic as { line: number; filename: string };
      const origin = snapshot.launch && !('root' in diagnostic && diagnostic.root === false) ? originalLocation(snapshot.launch, snapshot.selected, diagnostic.line) : null;
      this.status.textContent = `${String(data.error)}${origin ? `\n${origin.label} · original line ${origin.line}` : ''}`;
      return;
    }
    if (data.xml) {
      const metadata = { ...this.loadedMetadata, ...data }; const trace = validatedTrace(data.xml, metadata);
      this.evidence = snapshot; this.applyTrace(data.xml, metadata, trace);
      if (snapshot.payload.source !== this.sourceText.value) this.status.textContent += '\nThe active model selection changed after capture; this result belongs to the earlier captured selection.';
    }
    else if (data.outcome === 'no-instance' || data.outcome === 'no-counterexample') { this.pause(); this.layoutJob?.abort(); this.layoutStatus.textContent = ''; this.trace = null; this.xml = ''; this.result = data; this.renderState(); this.status.textContent = outcomeText(data); }
    else if (data.outcome === 'exhausted') this.status.textContent = outcomeText(data);
    else if (data.commands) this.loadedMetadata = data;
  }

  private buildFilters(): void {
    if (!this.trace) return;
    this.filters.replaceChildren(element('h2', '', 'Visible declarations'));
    for (const declaration of this.trace.declarations) {
      if (declaration.builtin) continue;
      const checked = element('input'); checked.type = 'checkbox';
      const key = declaration.kind === 'sig' ? 'hiddenSignatures' : 'hiddenRelations'; checked.checked = !this.profile[key].includes(declaration.id);
      checked.addEventListener('change', () => { this.profile = { ...this.profile, [key]: checked.checked ? this.profile[key].filter((id) => id !== declaration.id) : [...this.profile[key], declaration.id] }; this.visibilityChanged(); });
      const label = element('div', 'filter'); const visibility = element('label'); visibility.append(checked, document.createTextNode(`${declaration.label}${declaration.mutable ? declaration.kind === 'skolem' ? ' · varying' : ' · var' : ''}`)); label.append(visibility);
      if (declaration.kind !== 'sig') {
        const influence = element('input'); influence.type = 'checkbox'; influence.checked = !this.layout.settings.ignoredRelations.includes(declaration.id); influence.setAttribute('aria-label', `Use ${declaration.label} for layout`);
        influence.addEventListener('change', () => { const ignored = this.layout.settings.ignoredRelations.filter((id) => id !== declaration.id); this.layout.settings = { ...this.layout.settings, ignoredRelations: influence.checked ? ignored : [...ignored, declaration.id] }; void this.arrange(); });
        const option = element('label', 'layout-influence'); option.append(influence, document.createTextNode(' layout')); label.append(option);
        const relevant = element('input'); relevant.type = 'checkbox'; relevant.checked = !(this.profile.focus?.ignoredRelations ?? []).includes(declaration.id); relevant.setAttribute('aria-label', `Use ${declaration.label} for focus`);
        relevant.addEventListener('change', () => { const ignored = (this.profile.focus?.ignoredRelations ?? []).filter((id) => id !== declaration.id); this.updateFocus({ ignoredRelations: relevant.checked ? ignored : [...ignored, declaration.id] }); });
        const relevantLabel = element('label', 'focus-influence'); relevantLabel.append(relevant, document.createTextNode(' focus')); label.append(relevantLabel);
      }
      this.filters.append(label);
    }
    this.projection.replaceChildren(element('option', '', 'No projection'));
    this.projection.options[0].value = '';
    for (const atom of Array.from(new Set(this.trace.states.flatMap(stateAtoms))).slice(0, 20_000)) { const option = element('option', '', atom); option.value = atom; this.projection.append(option); }
    this.projection.value = this.profile.projection;
    this.filters.append(element('p', 'muted', 'Relation layout checkboxes choose which connections organize the graph; focus checkboxes choose which relation changes determine relevance. Unchecked relations remain visible. After changing visibility or projection, choose Arrange to reorganize.'), element('h3', '', 'Atom projection'), this.projection, element('p', 'muted', 'Projection keeps tuples containing the chosen atom. The graph omits that atom; tables retain every original column. Filters affect presentation only.'));
  }

  private renderState(): void {
    if (this.view !== 'timeline' && this.content.firstElementChild === this.sequence.root) this.sequence.leave();
    if (this.view !== 'timeline' && this.inspection.kind === 'timeline') { this.inspection = { kind: 'none' }; this.inspector.replaceChildren(); }
    if (this.view !== 'timeline' || this.content.firstElementChild !== this.sequence.root) this.content.replaceChildren(); this.timeline.replaceChildren();
    this.root.classList.toggle('timeline-active', this.view === 'timeline');
    this.stateSelect.disabled = !this.trace;
    for (const control of this.main.querySelectorAll<HTMLButtonElement>('.playback-controls button')) control.disabled = !this.trace;
    if (!this.trace) { this.content.replaceChildren(); this.inspection = { kind: 'none' }; this.inspector.replaceChildren(); this.stateSelect.replaceChildren(); this.colorPanel.replaceChildren(); this.focusStatus.textContent = ''; this.focusOverrides.replaceChildren(); this.legendProfile = null; this.content.append(element('p', 'empty', 'No satisfying trace loaded. Import Alloy XML without installing an engine, or load and run a local model.')); return; }
    const trace = this.trace; const current = trace.states[this.playback.index];
    this.renderColorLegends();
    const before = this.diffs && this.playback.previous !== null ? trace.states[this.playback.previous] : null;
    const nextFocus = traceFocus(trace, this.profile, this.playback.index, this.playback.previous);
    if (this.layoutJob && this.focusSelection && nextFocus !== this.focusSelection && nextFocus.options.mode === 'step') { this.layoutJob.abort(); this.layoutJob = null; this.layoutStatus.textContent = 'Focus transition changed. Choose Arrange graph to reorganize.'; }
    this.focusSelection = nextFocus; this.renderFocusStatus(current, before);
    this.stateSelect.value = String(this.playback.index);
    this.timeline.append(element('span', '', `State ${this.playback.index} / ${trace.states.length - 1} · `));
    for (let i = 0; i < trace.states.length; i++) {
      const state = button(String(i), () => { this.pause(); this.playback = { index: i, previous: i > 0 ? i - 1 : null, history: [] }; this.renderState(); });
      state.className = i === this.playback.index ? 'current-state' : ''; this.timeline.append(state);
    }
    this.timeline.append(element('strong', 'loop-label', isTemporalTimeline(trace) ? ` ↶ ${trace.loopStart} (infinite lasso loop)` : 'Single snapshot · no observed temporal loop'));
    if (this.view === 'timeline') {
      if (this.content.firstElementChild !== this.sequence.root) this.content.replaceChildren(this.sequence.root);
      this.sequence.update(trace, this.profile, this.result, this.playback, this.focusSelection);
      if (this.inspection.kind === 'atom') this.inspect(this.inspection.atom);
      return;
    }
    if (this.view === 'table') this.content.append(relationTables(trace, current, before, this.profile, (atom) => this.inspect(atom)));
    else if (this.view === 'source') { this.renderSources(); this.content.append(this.sourcePanel); }
    else {
      this.graphs[0].render(current, before, this.profile, this.focusSelection);
      if (this.view === 'compare') { const previous = trace.states[this.playback.previous ?? Math.max(0, this.playback.index - 1)]; this.graphs[1].render(previous, null, this.profile, this.focusSelection); const comparison = element('div', 'comparison'); comparison.append(panel(`Previous state ${this.playback.previous ?? Math.max(0, this.playback.index - 1)}`, this.graphs[1].svg), panel(`Current state ${this.playback.index}`, this.graphs[0].svg)); this.content.append(comparison); }
      else this.content.append(this.graphs[0].svg);
      if (this.fitPending) { this.graphs[0].fit(); if (this.view === 'compare') this.graphs[1].fit(); this.fitPending = false; }
      this.content.append(this.colorLegend);
      this.content.append(element('p', 'muted', 'Layout is stable during playback. Drag an atom to pin its position; inspect it to pin/unpin. Arrange uses visible declarations and preserves pins. Drag empty space to pan; Shift+wheel zooms. Green/red indicate added/removed values. Mutable relations are dashed. Use tables for exact tuples.'));
    }
    this.renderMemberships(current, before);
    if (this.inspection.kind === 'atom') this.inspect(this.inspection.atom);
  }
  /** Shared legend/control rendering uses the graph's resolver, including override provenance and inherited fills. */
  private renderColorLegends(): void {
    if (!this.trace || this.legendProfile === this.profile) return;
    this.legendProfile = this.profile;
    const colors = new SignatureColors(this.trace, this.profile);
    this.colorPanel.replaceChildren(signatureColorLegend(colors, (declaration, color) => {
      this.profile = customizeSignatureColor(this.trace!, this.profile, declaration, color); this.renderState();
    }));
    this.colorLegend.replaceChildren(element('summary', '', 'Signature color legend'), signatureColorLegend(colors));
  }
  private renderMemberships(state: AlloyTrace['states'][number], before: AlloyTrace['states'][number] | null): void {
    const details = element('details', 'memberships'); details.append(element('summary', '', 'Signature memberships'));
    details.append(element('p', 'muted', `Int: ${this.trace!.integerRange.min} … ${this.trace!.integerRange.max}${this.trace!.integerRange.enumerated ? '' : ' (implicit universe; only referenced integer atoms are materialized)'}`));
    for (const declaration of this.trace!.declarations.filter((declaration) => declaration.kind === 'sig' && !declaration.builtin && !this.profile.hiddenSignatures.includes(declaration.id))) {
      const values = state.signatures[declaration.id] ?? [];
      const delta = before ? tupleDifference((before.signatures[declaration.id] ?? []).map((atom) => [atom]), values.map((atom) => [atom])) : null;
      details.append(element('p', '', `${declaration.label}${declaration.mutable ? ' (var)' : ''}: ${values.join(', ') || '∅'}${delta ? ` · +${delta.added.map((tuple) => tuple[0]).join(', ') || '∅'} / −${delta.removed.map((tuple) => tuple[0]).join(', ') || '∅'}` : ''}`));
    }
    this.content.append(details);
    const provenance = element('details', 'provenance'); provenance.append(element('summary', '', 'Analysis provenance / captured inputs'), element('pre', '', JSON.stringify(this.result.provenance ?? { imported: true, filename: this.trace!.filename, buildDate: this.trace!.buildDate, command: this.trace!.command, bitwidth: this.trace!.bitwidth, minTrace: this.trace!.minTrace, maxTrace: this.trace!.maxTrace }, null, 2)));
    this.content.append(provenance);
  }

  private inspect(atom: string): void {
    if (!this.trace) return;
    this.sequence.clearSelection();
    this.inspection = { kind: 'atom', atom };
    const state = this.trace.states[this.playback.index]; this.inspector.replaceChildren(element('h2', '', atom));
    this.inspector.append(element('p', 'muted', `Stored state ${this.playback.index}`));
    const id = atomId(atom); const pinned = this.layout.pins.has(id);
    const pin = button(pinned ? 'Unpin atom' : 'Pin atom', () => { if (pinned) this.layout.pins.delete(id); else this.layout.pins.add(id); this.layoutChanged(); }); pin.disabled = !this.layout.positions.has(id); this.inspector.append(pin);
    const kept = (this.profile.focus?.alwaysShow ?? []).includes(atom);
    this.inspector.append(button(kept ? 'Stop always showing atom' : 'Always show atom', () => { if (kept) this.updateFocus({ alwaysShow: this.profile.focus!.alwaysShow.filter((value) => value !== atom) }); else this.keepAtoms([atom]); }), button('Reveal neighbors', () => { this.keepAtoms([...neighboringAtoms(this.trace!, this.trace!.states, this.profile, new Set([atom]))]); }));
    const memberships = this.trace.declarations.filter((declaration) => declaration.kind === 'sig' && state.signatures[declaration.id]?.includes(atom));
    this.inspector.append(element('p', '', `Membership: ${memberships.map((declaration) => declaration.label).join(', ') || 'not active in this state'}`));
    for (const declaration of memberships.filter((declaration) => !declaration.builtin)) this.inspector.append(button(`Source: ${declaration.label}`, () => this.showDeclaration(declaration.label)));
    for (const declaration of this.trace.declarations.filter((declaration) => declaration.kind !== 'sig')) {
      const tuples = (state.relations[declaration.id] ?? []).filter((tuple) => tuple.includes(atom));
      if (tuples.length) {
        const owner = this.trace.declarations.find((entry) => entry.id === declaration.parent);
        this.inspector.append(element('h3', '', declaration.label), button('Relation source', () => this.showDeclaration(owner ? `${owner.label}.${declaration.label}` : declaration.label)), element('pre', '', tuples.slice(0, 200).map((tuple) => tuple.join(' → ')).join('\n')));
      }
    }
  }
  private renderSources(): void {
    this.sourcePanel.replaceChildren(element('h2', '', 'Captured model sources'));
    const sources = this.trace?.sources.length ? this.trace.sources : this.evidence?.launch ? [{ filename: this.filename.value, content: composeModel(this.evidence.launch, this.evidence.selected).source }] : [];
    if (!sources.length) this.sourcePanel.append(element('p', 'muted', 'This imported result contains no embedded source. The active model selection is separate from the imported evidence.'));
    for (const source of sources) { const details = element('details'); details.open = source.filename === this.trace?.filename || sources.length === 1; details.dataset.filename = source.filename; details.append(element('summary', '', source.filename), element('pre', '', source.content)); this.sourcePanel.append(details); }
    const snapshot = this.evidence;
    if (snapshot?.launch) for (const part of snapshot.launch.parts.filter((part) => snapshot.selected.includes(part.id))) {
      const link = button(`Original: ${part.label} · line ${part.line}`, () => { if (/^(?:file|https?):/.test(part.sourceUrl)) void browser.tabs.create({ url: part.sourceUrl }); }); this.sourcePanel.append(link);
    }
  }
  private showDeclaration(label: string): void {
    this.view = 'source'; this.renderState();
    const canonical = label.replace(/^\$/, '');
    const location = this.result.declarations?.find((declaration) => declaration.label === label || declaration.label === canonical);
    const sources = this.trace?.sources ?? [];
    const simpleName = canonical.replace(/^this\//, '').split('.')[0];
    const source = sources.find((source) => source.filename === location?.filename) ?? sources.find((source) => parseAlloyDocument(source.content, 'file:///model.als').definitions.some((definition) => definition.name === simpleName));
    if (!source) return;
    const details = Array.from(this.sourcePanel.querySelectorAll('details')).find((details) => details.dataset.filename === source.filename);
    if (details) { details.open = true; details.scrollIntoView({ block: 'center' }); }
    const line = location?.line ?? parseAlloyDocument(source.content, 'file:///model.als').definitions.find((definition) => definition.name === simpleName)?.line;
    if (line) {
      this.sourcePanel.prepend(element('p', 'source-location', `${label}: ${source.filename}:${line}:${location?.column ?? 1}`));
      const text = details?.querySelector('pre')?.firstChild;
      if (text) {
        const start = source.content.split('\n').slice(0, line - 1).reduce((sum, part) => sum + part.length + 1, 0);
        const end = source.content.indexOf('\n', start);
        const range = document.createRange(); range.setStart(text, Math.min(start, source.content.length)); range.setEnd(text, end < 0 ? source.content.length : end);
        window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
        window.scrollBy({ top: range.getBoundingClientRect().top - innerHeight / 2, behavior: 'instant' });
      }
    }
  }

  private addWatch(): void {
    const expression = this.watchInput.value.trim(); if (!expression || this.profile.watches.length >= 10) return;
    this.profile = { ...this.profile, watches: [...this.profile.watches, expression] }; this.watchInput.value = ''; this.renderWatches();
  }
  private renderWatches(): void {
    this.watches.replaceChildren();
    for (const expression of this.profile.watches) { const row = element('div', 'watch'); row.dataset.expression = expression; row.append(element('code', '', expression), element('output', '', 'Not evaluated'), button('Remove', () => { this.profile = { ...this.profile, watches: this.profile.watches.filter((value) => value !== expression) }; this.renderWatches(); })); this.watches.append(row); }
  }
  private async evaluate(): Promise<void> {
    const state = this.playback.index;
    for (const row of this.watches.querySelectorAll<HTMLElement>('.watch')) {
      const output = row.querySelector('output')!;
      try { const result = await this.engine.evaluate(row.dataset.expression!, state); output.textContent = `State ${result.state}: ${result.value}`; }
      catch (error) { output.textContent = String(error); }
    }
  }
  private play(): void { if (this.timer) { this.pause(); return; } if (!this.trace) return; this.playButton.textContent = 'Pause trace'; this.timer = setInterval(() => { if (this.trace) { this.playback = stepForward(this.playback, this.trace); this.renderState(); } }, 800); }
  private pause(): void { if (this.timer) clearInterval(this.timer); this.timer = null; this.playButton.textContent = 'Play trace'; }

  private bundle(): Exploration {
    if (!this.xml) throw new Error('Load a satisfying trace before saving');
    const files = new Map<string, string>();
    const captured = this.evidence?.payload.files;
    if (Array.isArray(captured)) for (const file of captured) if (file && typeof file.path === 'string' && typeof file.content === 'string') files.set(file.path, file.content);
    const entry = typeof this.result.provenance?.entryFile === 'string' ? this.result.provenance.entryFile : this.trace!.filename.replace(/\\/g, '/').split('/').pop() ?? '';
    const filename = this.trace!.filename.replace(/\\/g, '/');
    const prefix = filename.endsWith(entry) ? filename.slice(0, -entry.length) : filename.slice(0, filename.lastIndexOf('/') + 1);
    for (const source of this.trace!.sources) {
      const path = source.filename.replace(/\\/g, '/');
      if (prefix && path.startsWith(prefix) && isAlloyModelFile(path)) files.set(path.slice(prefix.length), source.content);
    }
    return { format: 'openspec-alloy-viz', version: 1, label: this.caption.value || this.launch?.title || 'Alloy example', xml: this.xml, launch: this.evidence?.launch ?? null, selected: this.evidence?.selected ?? [], profile: this.profile, result: this.result, files: Array.from(files, ([path, content]) => ({ path, content })), graphLayout: this.layoutJob ? undefined : saveGraphLayout(this.layout), timelineBaseline: this.sequence.baselineBundle() };
  }
  private async save(): Promise<void> {
    try { const key = `alloy-snapshot:${crypto.randomUUID()}`; await browser.storage.local.set({ [key]: this.bundle() }); const all = await browser.storage.local.get(null); const keys = Object.keys(all).filter((key) => key.startsWith('alloy-snapshot:')); if (keys.length > 10) await browser.storage.local.remove(keys.slice(0, keys.length - 10)); await this.listSaved(); this.status.textContent = 'Snapshot saved locally with source, profile, and analysis provenance.'; }
    catch (error) { this.status.textContent = `${String(error)} Use Export bundle for results exceeding local storage capacity.`; }
  }
  private exportBundle(): void { try { download('alloy-exploration.json', JSON.stringify(this.bundle(), null, 2), 'application/json'); } catch (error) { this.status.textContent = String(error); } }
  private exportSvg(): void {
    if (!this.trace) { this.status.textContent = 'Load a satisfying trace before exporting an image.'; return; }
    if (this.view === 'timeline') { download('alloy-timeline.svg', this.sequence.exportSvg(), 'image/svg+xml'); return; }
    const previous = this.diffs && this.playback.previous !== null ? this.trace.states[this.playback.previous] : null;
    this.graphs[0].render(this.trace.states[this.playback.index], previous, this.profile, this.focusSelection);
    download('alloy-state.svg', this.graphs[0].exportSvg(), 'image/svg+xml');
  }
  private async listSaved(): Promise<void> {
    const all = await browser.storage.local.get(null); this.saved.replaceChildren(element('option', '', 'Open a saved exploration…')); this.saved.options[0].value = '';
    for (const key of Object.keys(all).filter((key) => key.startsWith('alloy-snapshot:'))) { const value = all[key] as Exploration; const option = element('option', '', typeof value.label === 'string' ? value.label : 'Saved exploration'); option.value = key; this.saved.append(option); }
  }
  private async openSaved(key: string): Promise<void> {
    try { const all = await browser.storage.local.get(key); const saved = readExploration(JSON.stringify(all[key])); const trace = validatedTrace(saved.xml, saved.result); this.sequence.setBaseline(saved.timelineBaseline); this.engine.invalidate(); if (saved.launch) this.setLaunch({ ...saved.launch, selected: saved.selected }); this.evidence = saved.launch ? { launch: saved.launch, selected: saved.selected, payload: {} } : null; this.files = [...(saved.files ?? [])]; this.updateRootChoices(); this.profile = saved.profile; this.caption.value = saved.label; this.applyTrace(saved.xml, saved.result, trace, saved.graphLayout, true); }
    catch (error) { this.status.textContent = String(error); }
  }
  private updateRootChoices(): void {
    this.rootChoice.replaceChildren(element('option', '', 'Choose an uploaded root model…')); this.rootChoice.options[0].value = '';
    for (const file of this.files) { const option = element('option', '', file.path); option.value = file.path; this.rootChoice.append(option); }
    this.rootChoice.hidden = !this.files.length;
  }
}

/** Native file pickers retain user control over local model/result selection. */
function fileControl(label: string, accept: string, multiple: boolean, selected: (files: readonly File[]) => void, directory = false): HTMLElement {
  const root = element('label', 'file-control'); root.append(document.createTextNode(label)); const input = element('input'); input.type = 'file'; input.accept = accept; input.multiple = multiple; if (directory) input.setAttribute('webkitdirectory', ''); input.setAttribute('aria-label', label); input.addEventListener('change', () => { selected(Array.from(input.files ?? [])); input.value = ''; }); root.append(input); return root;
}
/** Module declarations suggest a virtual filename without stripping or rewriting the model. */
function suggestedFilename(source: string, url?: string): string {
  const module = parseAlloyDocument(source, url ?? 'file:///model.als').definitions.find((definition) => definition.kind === 'module')?.name;
  if (module) return `${module}.als`;
  try { const name = decodeURIComponent(new URL(url ?? '').pathname).split('/').pop(); if (name?.endsWith('.als')) return name; } catch { /* uploaded/embedded model */ }
  return 'model.als';
}
/** Adjacent-state panes share identity/layout semantics but remain separate SVG documents. */
function panel(title: string, graph: SVGSVGElement): HTMLElement { const root = element('section'); root.append(element('h2', '', title), graph); return root; }

/** Validate before changing workspace model/evidence state so failed imports cannot relabel old results. */
function validatedTrace(xml: string, result: EngineResult): AlloyTrace {
  const trace = parseAlloyXml(xml);
  const expected = /^check\b/i.test(trace.command) ? 'counterexample' : 'example';
  if (result.outcome && result.outcome !== expected) throw new Error('Saved outcome disagrees with the satisfying Analyzer XML command');
  if (result.temporal === false && trace.states.length > 1) throw new Error('Static result metadata disagrees with a multi-state trace');
  return result.temporal === false ? { ...trace, traceKind: 'static' } : result.temporal === true ? { ...trace, traceKind: 'temporal' } : trace;
}

new Explorer();

import { button, element } from '../dom';
import { SignatureColors } from './colors';
import type { ViewProfile } from './types';
import type { TimelineProfile } from './timeline-profile';
import type { TimelineEvent, TimelineLane, TimelineModel, TimelineRow } from './timeline-model';
import { timelineAtomState } from './timeline-model';

const NS = 'http://www.w3.org/2000/svg';
const NARRATIVE = 260;
const LANE_WIDTH = 150;
export interface DiagramSelection { readonly from: number; readonly to: number; readonly event?: string }
export interface TimelineDiagramOptions {
  readonly select: (row: TimelineRow, event?: TimelineEvent) => void;
  readonly initial: () => void;
  readonly lane: (lane: TimelineLane) => void;
  readonly reorder: (source: TimelineLane, target: TimelineLane) => void;
  readonly expand: (row: TimelineRow) => void;
  readonly manualScroll: () => void;
}

/** Fixed participant lanes and atomic transition bands, with synchronized narrative and two-dimensional virtualization. */
export class TimelineDiagram {
  readonly root = element('div', 'sequence-scroll');
  private readonly board = element('div', 'sequence-board');
  private readonly header = element('div', 'sequence-headers');
  private readonly layer = element('div', 'sequence-rows');
  private model: TimelineModel | null = null;
  private settings: TimelineProfile | null = null;
  private colors: SignatureColors | null = null;
  private lanes: readonly TimelineLane[] = [];
  private rows: readonly TimelineRow[] = [];
  private offsets: number[] = [];
  private heights: number[] = [];
  private selection: DiagramSelection = { from: -1, to: 0 };
  private highlights: ReadonlySet<string> = new Set();
  private dragged: TimelineLane | null = null;
  private frame = 0;
  private alive: readonly ReadonlySet<string>[] = [];
  private readonly laneByAtom = new Map<string, number>();

  constructor(private readonly options: TimelineDiagramOptions) {
    this.root.tabIndex = 0; this.root.setAttribute('aria-label', 'Execution timeline; time flows top to bottom');
    this.board.append(this.header, this.layer); this.root.append(this.board);
    this.root.addEventListener('scroll', () => { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); }); });
    this.root.addEventListener('wheel', () => this.options.manualScroll(), { passive: true });
    this.root.addEventListener('touchmove', () => this.options.manualScroll(), { passive: true });
    new ResizeObserver(() => this.paint()).observe(this.root);
  }

  /** Reuse the scroll surface between cursor changes; only visible rows/lanes are materialized. */
  update(model: TimelineModel, profile: ViewProfile, settings: TimelineProfile, rows: readonly TimelineRow[], lanes: readonly TimelineLane[], selection: DiagramSelection, highlights: ReadonlySet<string>): void {
    if (this.model !== model) {
      this.alive = model.trace.states.map((state) => new Set(model.trace.declarations.filter((d) => d.kind === 'sig' && !d.builtin).flatMap((d) => state.signatures[d.id] ?? [])));
      this.root.scrollTop = 0;
    }
    this.model = model; this.settings = settings; this.rows = rows; this.lanes = lanes; this.selection = selection; this.highlights = highlights;
    this.laneByAtom.clear(); lanes.forEach((lane, index) => lane.members.forEach((atom) => this.laneByAtom.set(atom, index)));
    if (!this.colors || this.colors.profile !== profile || this.colors.trace !== model.trace) this.colors = new SignatureColors(model.trace, profile);
    const zoom = settings.zoom; let top = 84 * zoom; this.offsets = []; this.heights = [];
    for (const row of rows) {
      this.offsets.push(top);
      const expanded = row.transitions.some((t) => settings.expandedGroups.includes(`transition:${t.id}`));
      const detail = settings.detail !== 'summary' || expanded;
      const height = row.collapsed || !detail ? 82 * zoom : (48 + Math.max(1, Math.min(8, row.events.length)) * 30) * zoom;
      this.heights.push(height); top += height;
    }
    this.board.style.width = `${NARRATIVE + Math.max(1, lanes.length) * LANE_WIDTH * zoom}px`;
    this.board.style.height = `${top + 80 * zoom}px`; this.header.style.height = `${64 * zoom}px`;
    this.paint();
  }

  /** Follow or search navigation uses exact source/target pairs, including closing transitions to a nonzero loop state. */
  jump(from: number, to: number): void {
    const index = this.rows.findIndex((row) => row.transitions.some((t) => t.from === from && t.to === to));
    if (index >= 0) this.root.scrollTop = Math.max(0, this.offsets[index] - 100);
    else if (from < 0) this.root.scrollTop = 0;
    this.paint();
  }

  /** Draw only a bounded viewport plus overscan; offscreen participants stay in the model and can be scrolled into view. */
  private paint(): void {
    if (!this.model || !this.settings || !this.colors) return;
    const width = this.root.clientWidth || 900; const height = this.root.clientHeight || 600; const zoom = this.settings.zoom;
    const startLane = Math.max(0, Math.floor((this.root.scrollLeft - NARRATIVE) / (LANE_WIDTH * zoom)) - 1);
    const endLane = Math.min(this.lanes.length, startLane + Math.ceil(width / (LANE_WIDTH * zoom)) + 3);
    const visible = this.lanes.slice(startLane, endLane);
    this.header.replaceChildren(); this.layer.replaceChildren();
    const heading = element('div', 'sequence-narrative-heading', 'Transition / explanation'); heading.style.width = `${NARRATIVE}px`; this.header.append(heading);
    for (const [offset, lane] of visible.entries()) this.header.append(this.laneHeader(lane, startLane + offset));
    if (this.root.scrollTop < 160) this.layer.append(this.initialRow(visible, startLane));
    for (let i = 0; i < this.rows.length; i++) {
      if (this.offsets[i] + this.heights[i] < this.root.scrollTop - 150 || this.offsets[i] > this.root.scrollTop + height + 150) continue;
      this.layer.append(this.paintRow(this.rows[i], i, visible, startLane));
    }
  }

  /** Lane headers expose hide/focus/group/reorder controls through a shared participant menu. */
  private laneHeader(lane: TimelineLane, index: number): HTMLElement {
    const head = button(lane.label, () => this.options.lane(lane)); head.className = 'sequence-lane-header'; head.dataset.lane = lane.id;
    const zoom = this.settings!.zoom; head.style.left = `${NARRATIVE + index * LANE_WIDTH * zoom}px`; head.style.width = `${LANE_WIDTH * zoom - 8}px`; head.style.height = `${56 * zoom}px`;
    if (lane.members[0]) { const color = this.colors!.atom(lane.members[0], timelineAtomState(this.model!.trace, lane.members[0])); head.style.backgroundColor = color.fill; head.style.color = color.foreground; }
    head.title = `${lane.label}${lane.signature ? ` · ${lane.signature}` : ''}${lane.uncertain ? '\nStructural alignment only; participant identity is unconfirmed.' : ''}\nClick for participant actions; drag to reorder. Colors identify types/relevance, not unique lane identity.`;
    head.draggable = lane.id !== 'global' && !lane.placeholder; head.addEventListener('dragstart', () => { this.dragged = lane; }); head.addEventListener('dragover', (e) => e.preventDefault());
    head.addEventListener('drop', (e) => { e.preventDefault(); if (this.dragged && this.dragged.id !== lane.id) this.options.reorder(this.dragged, lane); this.dragged = null; }); return head;
  }

  /** Initial context is a snapshot, not an invented transition/action, including legacy static XML. */
  private initialRow(lanes: readonly TimelineLane[], start: number): HTMLElement {
    const row = element('div', 'sequence-row sequence-initial'); row.style.top = '0'; row.style.height = `${80 * this.settings!.zoom}px`;
    const explanation = element('div', 'sequence-explanation'); explanation.append(button('Initial state 0', this.options.initial), element('small', '', this.model!.temporal ? 'Captured state before the first transition' : this.model!.trace.traceKind === 'unknown' ? 'Single snapshot; no explicit temporal loop metadata' : 'Single snapshot; no observed transitions'));
    const svg = this.rowSvg(lanes, start, 80 * this.settings!.zoom);
    for (const [index, lane] of lanes.entries()) {
      const x = (index + .5) * LANE_WIDTH * this.settings!.zoom;
      if (lane.id === 'global' || lane.members.some((atom) => this.alive[0].has(atom))) { svg.append(this.create('line', { x1: x, x2: x, y1: 20, y2: 80 * this.settings!.zoom, stroke: '#9aabb4' })); svg.append(this.create('circle', { cx: x, cy: 22, r: 4, fill: '#778b98' })); }
    }
    row.append(explanation, svg); return row;
  }

  /** Every row keeps its original transition range and hidden-count explanation even when all events are suppressed. */
  private paintRow(row: TimelineRow, index: number, lanes: readonly TimelineLane[], start: number): HTMLElement {
    const root = element('div', 'sequence-row'); root.dataset.row = row.id; root.style.top = `${this.offsets[index]}px`; root.style.height = `${this.heights[index]}px`;
    if (row.id.startsWith('alignment:') && this.settings!.showDifferences) root.dataset.comparison = row.id.split(':').at(-1);
    if (row.transitions.some((t) => t.from === this.selection.from && t.to === this.selection.to)) root.classList.add('sequence-current');
    const narrative = element('div', 'sequence-explanation'); const first = row.transitions[0];
    if (!first) { narrative.append(element('strong', '', '◇ No corresponding transition'), element('small', '', 'Alignment gap; no stutter or action inferred.')); root.classList.add('sequence-gap'); root.append(narrative); return root; }
    if (root.dataset.comparison) narrative.append(element('small', 'sequence-comparison-badge', `${root.dataset.comparison === 'same' ? '✓' : '◇'} ${root.dataset.comparison}`));
    narrative.append(button(row.collapsed ? `States ${row.from}…${row.to} · ${row.transitions.length} local steps` : `State ${first.from} → ${first.to}${row.loop ? ' ↶ closing loop' : ''}`, () => this.options.select(row)));
    const expanded = row.transitions.some((t) => this.settings!.expandedGroups.includes(`transition:${t.id}`)); const detailed = this.settings!.detail !== 'summary' || expanded;
    if (row.collapsed) narrative.append(button(`Expand ${row.events.length || row.transitions.length} local events`, () => this.options.expand(row)));
    else if (!row.events.length) narrative.append(element('small', '', row.hidden ? `No displayed changes · ${row.hidden} changes hidden` : 'Stutter · no observed changes'));
    else if (!detailed) narrative.append(button(row.events.length === 1 ? row.events[0].label : `${row.events.length} changes in one atomic transition`, () => this.options.select(row, row.events.length === 1 ? row.events[0] : undefined)));
    else for (const event of row.events.slice(0, 8)) { const entry = button(this.settings!.detail === 'evidence' ? `${event.label} · ${event.provenance}` : event.label, () => this.options.select(row, event)); entry.dataset.event = event.id; entry.classList.toggle('sequence-match', this.highlights.has(event.id)); narrative.append(entry); }
    if (row.events.length > 8 && detailed) narrative.append(button(`Inspect all ${row.events.length} events`, () => this.options.select(row)));
    if (row.hidden) narrative.append(element('small', '', `${row.hidden} changes omitted by current filters`));
    const svg = this.rowSvg(lanes, start, this.heights[index]);
    this.lifelines(svg, row, lanes, this.heights[index]);
    const events = row.collapsed || !detailed ? [row.events.length === 1 ? row.events[0] : undefined] : row.events.slice(0, 8);
    events.forEach((event, eventIndex) => this.eventGlyph(svg, row, event, lanes, (detailed && !row.collapsed ? 42 + eventIndex * 30 : 40) * this.settings!.zoom));
    if (row.loop) { const loop = this.create('text', { x: 8, y: this.heights[index] - 6, fill: '#087c69', 'font-size': 12 }); loop.textContent = `↶ Return to state ${row.to} · repeated temporal region`; svg.append(loop); }
    root.append(narrative, svg); return root;
  }

  /** Birth/death markers shorten lifelines using captured membership, not action-name heuristics. */
  private lifelines(svg: SVGSVGElement, row: TimelineRow, lanes: readonly TimelineLane[], height: number): void {
    lanes.forEach((lane, index) => {
      const before = lane.id === 'global' || lane.members.some((atom) => this.alive[row.from].has(atom)); const after = lane.id === 'global' || lane.members.some((atom) => this.alive[row.to].has(atom));
      if (!before && !after) return;
      const x = (index + .5) * LANE_WIDTH * this.settings!.zoom;
      svg.append(this.create('line', { x1: x, x2: x, y1: before ? 0 : height / 2, y2: after ? height : height / 2, stroke: '#9aabb4', 'stroke-width': 1 }));
      if (before !== after) { const marker = this.create('text', { x: x + 11, y: height / 2, fill: after ? '#199a73' : '#cb5260', 'font-size': 12 }); marker.textContent = after ? '+ appears' : '× ends'; svg.append(marker); }
    });
  }

  /** Neutral tuple connectors show co-participation; only explicit communication mappings receive arrowheads. */
  private eventGlyph(svg: SVGSVGElement, row: TimelineRow, event: TimelineEvent | undefined, lanes: readonly TimelineLane[], y: number): void {
    const plotted = (e: TimelineEvent) => e.provenance === 'observed' ? e.participants : [e.sender, e.receiver].filter((atom): atom is string => !!atom);
    const participants = new Set(event ? plotted(event) : row.events.flatMap(plotted));
    const total = [...new Set(event?.participants ?? row.events.flatMap((e) => e.participants))];
    const visible = lanes.map((lane, index) => ({ lane, x: (index + .5) * LANE_WIDTH * this.settings!.zoom })).filter(({ lane }) => lane.members.some((atom) => participants.has(atom)));
    if (!visible.length && lanes.some((l) => l.id === 'global')) visible.push({ lane: lanes.find((l) => l.id === 'global')!, x: (lanes.findIndex((l) => l.id === 'global') + .5) * LANE_WIDTH * this.settings!.zoom });
    const group = this.create('g', { tabindex: 0, role: 'button', 'aria-label': event?.label ?? `${row.events.length} changes; inspect transition` });
    if (event) { group.dataset.event = event.id; group.classList.toggle('sequence-match', this.highlights.has(event.id)); group.classList.toggle('sequence-selected-event', this.selection.event === event.id); }
    const activate = () => this.options.select(row, event); group.addEventListener('click', activate); group.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
    if (event && visible.length > 1) {
      group.append(this.create('line', { x1: visible[0].x, x2: visible.at(-1)!.x, y1: y, y2: y, stroke: event.evidence.every((e) => e.change === 'removed') ? '#cb5260' : '#778b98', 'stroke-width': 2, 'stroke-dasharray': event.provenance === 'observed' ? '3 3' : '' }));
      if (event.kind === 'communication' && event.sender && event.receiver) {
        const receiver = visible.find(({ lane }) => lane.members.includes(event.receiver!)); const sender = visible.find(({ lane }) => lane.members.includes(event.sender!));
        if (receiver && sender) { const direction = receiver.x > sender.x ? 1 : -1; group.append(this.create('path', { d: `M ${receiver.x - direction * 11} ${y - 6} L ${receiver.x - direction * 3} ${y} L ${receiver.x - direction * 11} ${y + 6}`, fill: 'none', stroke: '#778b98', 'stroke-width': 2 })); }
      }
    }
    for (const { lane, x } of visible) {
      const atom = lane.members.find((a) => participants.has(a)); const state = event?.evidence[0]?.state ?? row.to;
      const color = atom ? this.colors!.atom(atom, timelineAtomState(this.model!.trace, atom, state)) : { fill: '#dce6ea', foreground: '#233942' };
      group.append(this.create('circle', { cx: x, cy: y, r: row.collapsed ? 15 : event ? 8 : 11, fill: color.fill, stroke: '#526b77', 'stroke-width': 2 }));
      if (row.collapsed || !event) { const count = this.create('text', { x, y: y + 4, 'text-anchor': 'middle', 'font-size': 11, fill: color.foreground }); count.textContent = String(row.events.filter((e) => lane.id === 'global' ? !plotted(e).some((a) => this.laneByAtom.has(a)) : plotted(e).some((a) => lane.members.includes(a))).length || row.transitions.length); group.append(count); }
    }
    const hidden = total.filter((atom) => !this.laneByAtom.has(atom) || !participants.has(atom)).length;
    if (hidden) { const note = this.create('text', { x: 5, y: y - 14, fill: '#607783', 'font-size': 11 }); note.textContent = `${hidden} hidden/non-lane arguments · inspect/reveal`; group.append(note); }
    const title = this.create('title'); title.textContent = event ? `${event.label}\n${event.provenance} · State ${event.from} → ${event.to}\n${event.evidence.map((e) => `${e.change}: ${e.label}(${e.tuple.join(', ')})`).join('\n')}` : `${row.events.length} changes, ${row.transitions.length} transitions. No order within an atomic transition is implied.`; group.append(title); svg.append(group);
  }

  /** Viewport SVGs use bounded pixel widths even when thousands of participant lanes are available horizontally. */
  private rowSvg(lanes: readonly TimelineLane[], start: number, height: number): SVGSVGElement {
    const svg = this.create('svg', { width: Math.max(1, lanes.length) * LANE_WIDTH * this.settings!.zoom, height });
    svg.style.position = 'absolute'; svg.style.left = `${NARRATIVE + start * LANE_WIDTH * this.settings!.zoom}px`; svg.setAttribute('aria-label', 'Transition participants'); return svg;
  }
  /** Model-provided text is inserted only with textContent, never parsed as markup. */
  private create<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
    const node = document.createElementNS(NS, tag); for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value)); return node;
  }

  /** Export the visible window, including explanations/headers, with an explicit viewport label and embedded theme colors. */
  exportSvg(): string {
    const width = this.root.clientWidth || 900; const height = this.root.clientHeight || 600; const theme = getComputedStyle(this.root);
    const svg = this.create('svg', { xmlns: NS, width, height: height + 30, viewBox: `0 0 ${width} ${height + 30}` });
    svg.setAttribute('style', `--paper:${theme.getPropertyValue('--paper')};--fg:${theme.getPropertyValue('--fg')};font-family:system-ui,sans-serif`);
    svg.append(this.create('rect', { width, height: height + 30, fill: theme.getPropertyValue('--paper').trim() || 'white' }));
    for (const row of this.layer.children) {
      const top = parseFloat((row as HTMLElement).style.top) - this.root.scrollTop + 64;
      if (top < -200 || top > height) continue;
      const original = row.querySelector('svg'); if (!original) continue;
      const group = this.create('g', { transform: `translate(${parseFloat(original.style.left) - this.root.scrollLeft} ${top})` }); for (const child of original.children) group.append(child.cloneNode(true)); svg.append(group);
      const text = this.create('text', { x: 8, y: Math.max(80, top + 20), fill: theme.getPropertyValue('--fg').trim() || '#233942', 'font-size': 11 }); text.textContent = row.querySelector('.sequence-explanation')?.textContent?.slice(0, 42) ?? ''; svg.append(text);
    }
    for (const head of this.header.querySelectorAll<HTMLElement>('.sequence-lane-header')) {
      const x = parseFloat(head.style.left) - this.root.scrollLeft;
      svg.append(this.create('rect', { x, y: 0, width: parseFloat(head.style.width), height: 50, rx: 5, fill: head.style.backgroundColor || '#dce6ea' })); const text = this.create('text', { x: x + 8, y: 28, fill: head.style.color || '#233942', 'font-size': 12 }); text.textContent = head.textContent; svg.append(text);
    }
    const note = this.create('text', { x: 8, y: height + 20, fill: theme.getPropertyValue('--fg').trim() || '#233942', 'font-size': 11 }); note.textContent = 'Timeline visible window · atomic state transitions, not elapsed time'; svg.append(note);
    return new XMLSerializer().serializeToString(svg);
  }
}

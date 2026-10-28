import type { AlloyDeclaration, AlloyTrace, TraceState, ViewProfile } from './types';
import { stateAtoms, tupleDifference, visibleTuples } from './model';
import { argumentColumns, atomId, atomWidth, createGraphLayout, edgeId, graphAtoms, junctionId, layoutTopology, MAX_GRAPH_ATOMS, MAX_GRAPH_TUPLES, primarySignature } from './graph-layout';
import type { GraphLayout, Point } from './graph-layout';
import { SignatureColors, SUPPORT_COLORS } from './colors';
import { focusTupleVisible } from './focus';
import type { FocusSelection } from './focus';

const NS = 'http://www.w3.org/2000/svg';
let counter = 0;

/** Graph rendering has trace-local stable atom coordinates; independent solutions get fresh layouts. */
export class InstanceGraph {
  readonly svg = document.createElementNS(NS, 'svg');
  private trace: AlloyTrace | null = null;
  private current: TraceState | null = null;
  private before: TraceState | null = null;
  private profile: ViewProfile | null = null;
  private colors: SignatureColors | null = null;
  private focus: FocusSelection | undefined;
  private pan = { x: 0, y: 0, scale: 1 };
  private drag: { atom: string | null; x: number; y: number; moved: boolean } | null = null;
  private readonly arrow = `alloy-arrow-${counter++}`;

  constructor(private readonly inspect: (atom: string) => void, private readonly layout: GraphLayout = createGraphLayout(), private readonly layoutChanged: () => void = () => undefined) {
    this.svg.classList.add('instance-graph'); this.svg.setAttribute('viewBox', '0 0 1100 650');
    this.svg.setAttribute('role', 'img'); this.svg.setAttribute('aria-label', 'Alloy instance graph');
    this.svg.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const point = this.point(event.clientX, event.clientY);
      this.drag = { atom: (event.target as Element).closest<SVGElement>('[data-atom]')?.dataset.atom ?? null, x: point.x, y: point.y, moved: false };
      this.svg.setPointerCapture(event.pointerId);
    });
    this.svg.addEventListener('pointermove', (event) => {
      if (!this.drag) return;
      const point = this.point(event.clientX, event.clientY);
      const dx = point.x - this.drag.x; const dy = point.y - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.drag.moved = true;
      if (this.drag.atom) { const id = atomId(this.drag.atom); const position = this.layout.positions.get(id)!; position.x += dx / this.pan.scale; position.y += dy / this.pan.scale; if (this.drag.moved) { this.layout.pins.add(id); this.layoutChanged(); } }
      else { this.pan.x += dx; this.pan.y += dy; }
      this.drag.x = point.x; this.drag.y = point.y; this.draw();
    });
    this.svg.addEventListener('pointerup', () => { const drag = this.drag; this.drag = null; if (drag?.atom && !drag.moved) this.inspect(drag.atom); else if (drag?.atom && drag.moved) this.layoutChanged(); });
    this.svg.addEventListener('pointercancel', () => { this.drag = null; });
    this.svg.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { const atom = (event.target as SVGElement).dataset.atom; if (atom) { event.preventDefault(); this.inspect(atom); } } });
    this.svg.addEventListener('wheel', (event) => {
      if (!event.shiftKey) return;
      event.preventDefault(); const point = this.point(event.clientX, event.clientY); const next = Math.max(.2, Math.min(5, this.pan.scale * Math.exp(-event.deltaY * .002)));
      this.pan.x = point.x - (point.x - this.pan.x) * next / this.pan.scale;
      this.pan.y = point.y - (point.y - this.pan.y) * next / this.pan.scale;
      this.pan.scale = next; this.draw();
    }, { passive: false });
  }

  /** Shared positions are owned by the workspace and survive playback and comparison rendering. */
  setTrace(trace: AlloyTrace): void {
    this.trace = trace; this.colors = null; this.pan = { x: 0, y: 0, scale: 1 };
  }
  /** Render current values and optional added/removed values using the same stable layout. */
  render(current: TraceState, before: TraceState | null, profile: ViewProfile, focus?: FocusSelection): void { this.current = current; this.before = before; if (this.trace && (!this.colors || this.profile !== profile)) this.colors = new SignatureColors(this.trace, profile); this.profile = profile; this.focus = focus; this.draw(); }
  /** Reset pan/zoom without discarding manually pinned atom positions. */
  fit(): void {
    this.pan = { x: 0, y: 0, scale: 1 }; this.draw();
    const bounds = this.svg.querySelector<SVGGElement>('.graph-scene')?.getBBox();
    if (bounds && bounds.width && bounds.height) {
      // Include union geometry so later states do not reveal offscreen junctions or edge labels.
      const points: Point[] = [];
      if (this.layout.settings.scope === 'trace' && this.trace && this.profile) {
        const topology = layoutTopology(this.trace, this.profile, this.trace.states, [], this.focus);
        for (const node of topology.nodes) { const point = this.layout.positions.get(node.id); if (point) points.push({ x: point.x - node.width / 2, y: point.y - node.height / 2 }, { x: point.x + node.width / 2, y: point.y + node.height / 2 }); }
        for (const edge of topology.edges) {
          const route = this.layout.routes.get(edge.id); const source = this.layout.positions.get(edge.source); const target = this.layout.positions.get(edge.target);
          if (route && source && target && samePoint(route.source, source) && samePoint(route.target, target)) {
            const halfWidth = (edge.label.length * 7.5 + 12) / 2;
            points.push(...route.points, { x: route.label.x - halfWidth, y: route.label.y - 16 }, { x: route.label.x + halfWidth, y: route.label.y + 4 });
          }
        }
      }
      let minX = bounds.x; let minY = bounds.y; let maxX = bounds.x + bounds.width; let maxY = bounds.y + bounds.height;
      for (const point of points) { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); }
      this.svg.setAttribute('viewBox', `${minX - 50} ${minY - 60} ${Math.max(300, maxX - minX + 100)} ${Math.max(200, maxY - minY + 120)}`);
    }
    this.draw();
  }
  /** SVG output is self-contained and contains no model-provided HTML. */
  exportSvg(): string { return new XMLSerializer().serializeToString(this.svg); }

  private visibleAtoms(focused = true): string[] {
    if (!this.current || !this.trace || !this.profile) return [];
    return graphAtoms(this.trace, [this.current, ...(this.before ? [this.before] : [])], this.profile, focused ? this.focus : undefined);
  }

  private draw(): void {
    if (!this.trace || !this.current || !this.profile || !this.colors) return;
    const all = this.visibleAtoms(false); const eligible = this.focus?.active ? all.filter((atom) => this.focus!.allowed.has(atom)) : all; const atoms = eligible.slice(0, MAX_GRAPH_ATOMS); const visible = new Set(atoms);
    // Provisional positions cover newly revealed atoms until the user chooses Arrange.
    this.placeNewAtoms(atoms);
    const nodes = this.create('g'); const edges = this.create('g'); const top = this.create('g', { transform: `translate(${this.pan.x} ${this.pan.y}) scale(${this.pan.scale})` });
    top.classList.add('graph-scene');
    const defs = this.create('defs'); const marker = this.create('marker', { id: this.arrow, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' });
    marker.append(this.create('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#778b98' })); defs.append(marker);
    let count = 0; const lanes = new Map<string, number>(); const unary = new Map<string, number>();
    const active = new Set(stateAtoms(this.current));
    const previousAtoms = this.before ? new Set(stateAtoms(this.before)) : null;
    for (const declaration of this.trace.declarations.filter((declaration) => declaration.kind !== 'sig' && !this.profile!.hiddenRelations.includes(declaration.id))) {
      const current = visibleTuples(this.current, declaration.id, this.profile);
      const previous = this.before ? visibleTuples(this.before, declaration.id, this.profile) : [];
      const delta = tupleDifference(previous, current);
      for (const tuple of [...current, ...delta.removed]) {
        if (!focusTupleVisible(this.focus, tuple, this.profile.projection)) continue;
        const projected = tuple.filter((atom) => atom !== this.profile!.projection);
        if (!projected.length || projected.some((atom) => !visible.has(atom))) continue;
        if (count++ >= MAX_GRAPH_TUPLES) break;
        const removed = delta.removed.includes(tuple); const added = !!this.before && delta.added.includes(tuple);
        this.drawTuple(edges, declaration, tuple, projected, removed ? '#cb5260' : added ? '#199a73' : '#778b98', removed, lanes, unary);
      }
    }
    for (const atom of atoms) {
      const position = this.layout.positions.get(atomId(atom))!;
      const memberships = this.trace.declarations.filter((declaration) => declaration.kind === 'sig' && this.current!.signatures[declaration.id]?.includes(atom));
      const signature = primarySignature(this.trace, atom, this.current) ?? (this.before ? primarySignature(this.trace, atom, this.before) : null);
      const resolved = this.colors.atom(atom, this.current, this.before); const color = resolved.fill;
      const removed = !active.has(atom); const added = !!previousAtoms && active.has(atom) && !previousAtoms.has(atom);
      const group = this.create('g', { transform: `translate(${position.x} ${position.y})`, tabindex: '0', role: 'button', 'aria-label': `Inspect ${atom}` });
      group.dataset.atom = atom;
      group.dataset.traceRole = resolved.role;
      const context = !!this.focus?.active && !this.focus.seeds.has(atom);
      group.dataset.focus = this.focus?.active ? context ? 'context' : this.focus.changed.has(atom) ? 'changed' : 'always' : 'full';
      group.dataset.signature = signature?.label ?? resolved.declaration?.label ?? 'builtin'; group.dataset.colorSource = resolved.source;
      group.dataset.pinned = String(this.layout.pins.has(atomId(atom)));
      const width = atomWidth(atom);
      group.append(this.create('rect', { x: String(-width / 2), y: '-24', width: String(width), height: '48', rx: '9', fill: color, stroke: removed ? '#cb5260' : added ? '#199a73' : 'var(--fg, #233942)', 'stroke-width': removed || added ? '3' : this.focus?.active && this.focus.changed.has(atom) ? '2' : '1', 'stroke-dasharray': signature?.mutable || removed ? '5 3' : '' }));
      const label = this.create('text', { 'text-anchor': 'middle', y: '0', fill: resolved.foreground, 'font-size': '14', 'font-family': 'system-ui, sans-serif' }); label.textContent = atom; group.append(label);
      const type = this.create('text', { 'text-anchor': 'middle', y: '16', fill: resolved.foreground, 'font-size': '10', 'font-family': 'system-ui, sans-serif' }); type.textContent = (signature?.label ?? resolved.declaration?.label ?? 'builtin').split('/').pop()! + (context ? ' · context' : ''); group.append(type);
      const title = this.create('title'); title.textContent = `${memberships.map((d) => d.label).join(', ')}\nColor: ${resolved.source}${resolved.declaration ? ` · ${resolved.declaration.label}` : ''}\n${resolved.role === 'involved' ? 'Trace-relevant: changing, supporting context, or a static result' : 'Static context outside the trace relevance set'}`; group.append(title); nodes.append(group);
      if (removed || added) { const badge = this.create('text', { x: String(-width / 2), y: '-31', fill: removed ? '#cb5260' : '#199a73', 'font-size': '13' }); badge.textContent = removed ? '− removed' : '+ added'; group.append(badge); }
      if (this.layout.pins.has(atomId(atom))) { const pin = this.create('text', { x: String(width / 2 - 8), y: '-30', 'text-anchor': 'end', fill: color, 'font-size': '11' }); pin.textContent = 'pinned'; group.append(pin); }
      const subsets = memberships.filter((d) => d.subset && !this.profile!.hiddenSignatures.includes(d.id));
      if (subsets.length) { const annotation = this.create('text', { x: '0', y: '43', 'text-anchor': 'middle', 'font-size': '12', fill: '#607783' }); annotation.textContent = `(${subsets.map((d) => d.label).join(', ')})`; group.append(annotation); }
      if (this.before) {
        const changes = this.trace.declarations.filter((declaration) => declaration.kind === 'sig' && !declaration.builtin && declaration.mutable && !!this.current!.signatures[declaration.id]?.includes(atom) !== !!this.before!.signatures[declaration.id]?.includes(atom));
        if (changes.length) { const change = this.create('text', { x: '0', y: subsets.length ? '62' : '44', 'text-anchor': 'middle', 'font-size': '12' }); for (const d of changes) { const present = this.current.signatures[d.id]?.includes(atom); const part = this.create('tspan', { fill: present ? '#199a73' : '#cb5260' }); part.textContent = `${present ? '+' : '−'} ${d.label} `; change.append(part); } group.append(change); }
      }
    }
    top.append(edges, nodes);
    const note = this.create('text', { x: String(this.svg.viewBox.baseVal.x + 10), y: String(this.svg.viewBox.baseVal.y + 24), fill: '#778b98', 'font-size': '13' }); note.textContent = `${atoms.length} / ${all.length} visible atoms${this.focus?.active ? ` · ${this.focus.options.mode} focus` : ''}${eligible.length > MAX_GRAPH_ATOMS ? ' · graph limited to 400; use tables for complete values' : ''}${count >= MAX_GRAPH_TUPLES ? ' · edge display limit reached' : ''}`;
    this.svg.replaceChildren(defs, top, note);
  }

  /** Revealing context places only missing atoms near existing neighbors; established coordinates never move. */
  private placeNewAtoms(atoms: readonly string[]): void {
    const missing = new Set(atoms.filter((atom) => !this.layout.positions.has(atomId(atom))));
    if (!missing.size) return;
    const anchors = new Map<string, Point[]>();
    for (const state of [this.current!, ...(this.before ? [this.before] : [])]) for (const d of this.trace!.declarations) {
      if (d.kind === 'sig' || this.profile!.hiddenRelations.includes(d.id)) continue;
      for (const tuple of visibleTuples(state, d.id, this.profile!)) {
        const known = tuple.filter((a) => !missing.has(a)).map((a) => this.layout.positions.get(atomId(a))).filter((p): p is Point => !!p);
        if (!known.length) continue;
        for (const atom of tuple) if (missing.has(atom)) anchors.set(atom, [...(anchors.get(atom) ?? []), ...known].slice(0, 4));
      }
    }
    for (const [index, atom] of [...missing].entries()) {
      const neighbors = anchors.get(atom) ?? [];
      const center = neighbors.length ? { x: neighbors.reduce((n, p) => n + p.x, 0) / neighbors.length, y: neighbors.reduce((n, p) => n + p.y, 0) / neighbors.length } : { x: 550, y: 325 };
      let candidate = { ...center };
      for (let attempt = 0; attempt < 32; attempt++) {
        const angle = (index + attempt) * 2.4; const radius = 150 + attempt * 35;
        candidate = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
        if (![...this.layout.positions.values()].some((p) => Math.abs(p.x - candidate.x) < atomWidth(atom) / 2 + 100 && Math.abs(p.y - candidate.y) < 80)) break;
      }
      this.layout.positions.set(atomId(atom), candidate);
    }
  }

  private drawTuple(group: SVGGElement, declaration: AlloyDeclaration, original: readonly string[], tuple: readonly string[], color: string, removed: boolean, lanes: Map<string, number>, unary: Map<string, number>): void {
    const positions = tuple.map((atom) => this.layout.positions.get(atomId(atom))!);
    if (positions.some((position) => !position)) return;
    if (positions.length === 1) {
      const slot = unary.get(tuple[0]) ?? 0; unary.set(tuple[0], slot + 1);
      const label = this.create('text', { x: String(positions[0].x), y: String(positions[0].y + 52 + slot * 18), fill: color, 'font-size': '12', 'text-anchor': 'middle' }); label.textContent = declaration.label; group.append(label); return;
    }
    const junction = junctionId(declaration.id, original);
    const center = this.layout.positions.get(junction) ?? { x: positions.reduce((sum, point) => sum + point.x, 0) / positions.length + 100, y: positions.reduce((sum, point) => sum + point.y, 0) / positions.length + 100 };
    const columns = argumentColumns(original, this.profile!.projection);
    const binaryLabel = original.length === 2 ? declaration.label : `${declaration.label}[${columns.join('→')}]`;
    const segments = positions.length === 2 ? [{ from: positions[0], to: positions[1], source: atomId(tuple[0]), target: atomId(tuple[1]), label: binaryLabel }] : positions.map((point, index) => ({ from: center, to: point, source: junction, target: atomId(tuple[index]), label: `${declaration.label}[${columns[index]}]` }));
    for (const [column, segment] of segments.entries()) {
      const id = edgeId(declaration.id, original, column); const route = this.layout.routes.get(id);
      const pair = JSON.stringify([segment.source, segment.target].sort()); const lane = lanes.get(pair) ?? 0; lanes.set(pair, lane + 1);
      const valid = route && samePoint(route.source, segment.from) && samePoint(route.target, segment.to);
      const fallback = fallbackRoute(segment.from, segment.to, positions.length === 2 ? atomWidth(tuple[0]) : 12, atomWidth(tuple[positions.length === 2 ? 1 : column]), lane);
      const path = valid ? route.points.map((p, index) => `${index ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') : fallback.path;
      const labelPoint = valid ? route.label : fallback.label;
      const edge = this.create('path', { d: path, stroke: color, 'stroke-width': '2', 'stroke-dasharray': removed || declaration.mutable ? '5 3' : '', fill: 'none', 'marker-end': `url(#${this.arrow})` }); edge.dataset.edge = id; group.append(edge);
      const label = this.create('text', { x: String(labelPoint.x), y: String(labelPoint.y), fill: color, 'font-size': '12', 'text-anchor': 'middle', 'font-family': 'system-ui, sans-serif', 'paint-order': 'stroke', stroke: 'var(--paper, white)', 'stroke-width': '4', 'stroke-linejoin': 'round' }); label.textContent = segment.label; group.append(label);
    }
    if (positions.length > 2) { const dot = this.create('circle', { cx: String(center.x), cy: String(center.y), r: '6', fill: SUPPORT_COLORS.junction, stroke: color, 'stroke-width': '2' }); dot.dataset.junction = junction; const title = this.create('title'); title.textContent = `${declaration.label}: ${original.join(' → ')}`; dot.append(title); group.append(dot); }
  }
  private create<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string> = {}): SVGElementTagNameMap[K] {
    const node = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); return node;
  }
  private point(x: number, y: number): Point { const point = this.svg.createSVGPoint(); point.x = x; point.y = y; const matrix = this.svg.getScreenCTM(); return matrix ? point.matrixTransform(matrix.inverse()) : { x, y }; }
}

/** Routed edges remain valid until an endpoint moves; manual moves use separated curves immediately. */
function samePoint(a: Point, b: Point): boolean { return a.x === b.x && a.y === b.y; }
/** Clip a line to the rectangular atom/junction boundary. */
function boundary(from: Point, toward: Point, width: number): Point {
  const dx = toward.x - from.x; const dy = toward.y - from.y;
  const factor = Math.min(width / 2 / Math.max(Math.abs(dx), .001), (width === 12 ? 6 : 25) / Math.max(Math.abs(dy), .001));
  return { x: from.x + dx * factor, y: from.y + dy * factor };
}
/** Fallback curves distinguish self loops and parallel/reverse edges when a manual pin invalidates ELK routes. */
function fallbackRoute(from: Point, to: Point, sourceWidth: number, targetWidth: number, lane: number): { path: string; label: Point } {
  const dx = to.x - from.x; const dy = to.y - from.y; const length = Math.hypot(dx, dy);
  if (length < 2) {
    const rise = 95 + lane * 34;
    return { path: `M ${to.x - 20} ${to.y - 24} C ${to.x - 100} ${to.y - rise * 1.4} ${to.x + 100} ${to.y - rise * 1.4} ${to.x + 20} ${to.y - 24}`, label: { x: to.x, y: to.y - rise - 8 } };
  }
  const offset = 30 + lane * 38;
  const control = { x: (from.x + to.x) / 2 - dy / length * offset, y: (from.y + to.y) / 2 + dx / length * offset };
  const start = boundary(from, control, sourceWidth); const end = boundary(to, control, targetWidth);
  return { path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`, label: { x: (start.x + 2 * control.x + end.x) / 4, y: (start.y + 2 * control.y + end.y) / 4 - 8 } };
}

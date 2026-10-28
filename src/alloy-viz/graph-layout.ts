import type { ElkNode } from 'elkjs/lib/elk-api';
import type { AlloyTrace, TraceState, ViewProfile } from './types';
import { visibleTuples } from './model';
import { focusTupleVisible } from './focus';
import type { FocusSelection } from './focus';

export const MAX_GRAPH_ATOMS = 400;
export const MAX_GRAPH_TUPLES = 2000;
export const MAX_LAYOUT_EDGES = 8000;
export interface Point { x: number; y: number }
export interface LayoutSettings { algorithm: 'layered' | 'force'; direction: 'RIGHT' | 'DOWN'; scope: 'trace' | 'state'; ignoredRelations: readonly string[] }
export interface LayoutNode { id: string; width: number; height: number; atom?: string }
export interface LayoutEdge { id: string; source: string; target: string; label: string }
export interface LayoutTopology { nodes: LayoutNode[]; edges: LayoutEdge[]; truncated: boolean }
export interface EdgeRoute { points: Point[]; label: Point; source: Point; target: Point }
export interface GraphLayout {
  positions: Map<string, Point>;
  routes: Map<string, EdgeRoute>;
  pins: Set<string>;
  settings: LayoutSettings;
}
export interface SavedGraphLayout {
  settings: LayoutSettings;
  positions: { id: string; x: number; y: number }[];
  pins: string[];
  routes: { id: string; route: EdgeRoute }[];
}
export const DEFAULT_LAYOUT: LayoutSettings = { algorithm: 'layered', direction: 'RIGHT', scope: 'trace', ignoredRelations: [] };

/** Atom and tuple IDs occupy separate namespaces, even for model-supplied labels. */
export function atomId(atom: string): string { return JSON.stringify(['atom', atom]); }
/** Tuple identity includes the original columns, even after projection. */
export function junctionId(relation: string, tuple: readonly string[]): string { return JSON.stringify(['tuple', relation, tuple]); }
/** Each tuple argument has its own route, including repeated arguments. */
export function edgeId(relation: string, tuple: readonly string[], column: number): string { return JSON.stringify(['edge', relation, tuple, column]); }
/** Preserve original argument numbers when projection removes a tuple column. */
export function argumentColumns(tuple: readonly string[], projection: string): number[] { return tuple.flatMap((atom, index) => atom === projection ? [] : [index + 1]); }
/** Reserve enough width for long labels; SVG text uses the same dimensions. */
export function atomWidth(atom: string): number { return Math.max(152, atom.length * 9 + 24); }
/** New solutions get independent positions; comparison panes share this object. */
export function createGraphLayout(): GraphLayout { return { positions: new Map(), routes: new Map(), pins: new Set(), settings: { ...DEFAULT_LAYOUT } }; }

/** Select presentation atoms only, retaining the existing signature/projection semantics. */
export function graphAtoms(trace: AlloyTrace, states: readonly TraceState[], profile: ViewProfile, focus?: FocusSelection): string[] {
  const signatures = trace.declarations.filter((d) => d.kind === 'sig' && !d.builtin && !profile.hiddenSignatures.includes(d.id));
  let atoms = Array.from(new Set(states.flatMap((s) => signatures.flatMap((d) => s.signatures[d.id] ?? []))));
  const referenced = new Set(states.flatMap((s) => trace.declarations.filter((d) => d.kind !== 'sig' && !profile.hiddenRelations.includes(d.id)).flatMap((d) => visibleTuples(s, d.id, profile).flat())));
  const builtins = new Set(trace.declarations.filter((d) => d.builtin).flatMap((d) => states.flatMap((s) => s.signatures[d.id] ?? [])));
  atoms.push(...Array.from(referenced).filter((atom) => builtins.has(atom) || /^-?\d+$/.test(atom)));
  if (profile.projection) atoms = atoms.filter((atom) => atom !== profile.projection && referenced.has(atom));
  return Array.from(new Set(atoms)).filter((atom) => {
    if (focus?.active && !focus.allowed.has(atom)) return false;
    const signature = states.map((state) => primarySignature(trace, atom, state)).find(Boolean);
    return !signature || !profile.hiddenSignatures.includes(signature.id);
  }).sort();
}

/** Use the most specific non-subset signature for coloring and hidden-atom decisions. */
export function primarySignature(trace: AlloyTrace, atom: string, state: TraceState) {
  const members = trace.declarations.filter((d) => d.kind === 'sig' && !d.subset && !d.builtin && state.signatures[d.id]?.includes(atom));
  return members.find((candidate) => !members.some((other) => other.parent === candidate.id)) ?? members[0] ?? null;
}

/** Build a bounded union topology. Union edges influence placement, never which tuples are displayed. */
export function layoutTopology(trace: AlloyTrace, profile: ViewProfile, states: readonly TraceState[], ignoredRelations: readonly string[] = [], focus?: FocusSelection): LayoutTopology {
  const allAtoms = graphAtoms(trace, states, profile, focus);
  const atoms = allAtoms.slice(0, MAX_GRAPH_ATOMS); const visible = new Set(atoms);
  const nodes: LayoutNode[] = atoms.map((atom) => ({ id: atomId(atom), atom, width: atomWidth(atom), height: 48 }));
  const edges: LayoutEdge[] = []; const tuples = new Set<string>(); let truncated = allAtoms.length > atoms.length;
  outer: for (const state of states) for (const declaration of trace.declarations) {
    if (declaration.kind === 'sig' || profile.hiddenRelations.includes(declaration.id) || ignoredRelations.includes(declaration.id)) continue;
    for (const tuple of visibleTuples(state, declaration.id, profile)) {
      if (!focusTupleVisible(focus, tuple, profile.projection)) continue;
      const projected = tuple.filter((atom) => atom !== profile.projection);
      if (!projected.length || projected.some((atom) => !visible.has(atom))) continue;
      const key = junctionId(declaration.id, tuple);
      if (tuples.has(key)) continue;
      if (tuples.size >= MAX_GRAPH_TUPLES) { truncated = true; break outer; }
      if (edges.length + (projected.length > 2 ? projected.length : 1) > MAX_LAYOUT_EDGES) { truncated = true; break outer; }
      tuples.add(key);
      const columns = argumentColumns(tuple, profile.projection);
      if (projected.length === 2) edges.push({ id: edgeId(declaration.id, tuple, 0), source: atomId(projected[0]), target: atomId(projected[1]), label: tuple.length === 2 ? declaration.label : `${declaration.label}[${columns.join('→')}]` });
      else if (projected.length > 2) {
        nodes.push({ id: key, width: 12, height: 12 });
        projected.forEach((atom, index) => edges.push({ id: edgeId(declaration.id, tuple, index), source: key, target: atomId(atom), label: `${declaration.label}[${columns[index]}]` }));
      }
    }
  }
  return { nodes, edges, truncated };
}

/** ELK receives explicit node/label dimensions, separate parallel edges, and a deterministic seed. */
export function elkGraph(topology: LayoutTopology, settings: LayoutSettings): ElkNode {
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': settings.algorithm, 'elk.direction': settings.direction, 'elk.randomSeed': '1',
      'elk.edgeRouting': settings.algorithm === 'layered' ? 'ORTHOGONAL' : 'POLYLINE',
      'elk.padding': '[top=60,left=50,bottom=50,right=50]', 'elk.spacing.nodeNode': '70',
      'elk.spacing.edgeNode': '24', 'elk.spacing.edgeLabel': '12', 'elk.spacing.componentComponent': '80',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100', 'elk.layered.mergeEdges': 'false',
      'elk.force.iterations': '300', 'elk.separateConnectedComponents': 'true',
    },
    children: topology.nodes.map((node) => ({ id: node.id, width: node.width, height: node.height })),
    edges: topology.edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target], labels: [{ text: edge.label, width: edge.label.length * 7.5 + 12, height: 20 }] })),
  };
}

/** Install a completed layout atomically; pinned atoms retain exact coordinates and invalidate only affected routes. */
export function installLayout(layout: GraphLayout, graph: ElkNode): void {
  const old = new Map(layout.positions); const positions = new Map(layout.positions);
  for (const node of graph.children ?? []) {
    if (layout.pins.has(node.id) && old.has(node.id)) continue;
    positions.set(node.id, { x: (node.x ?? 0) + (node.width ?? 0) / 2, y: (node.y ?? 0) + (node.height ?? 0) / 2 });
  }
  if (layout.pins.size) avoidPinnedOverlaps(positions, layout.pins, graph);
  layout.positions = positions; layout.routes.clear();
  const nodes = new Map((graph.children ?? []).map((node) => [node.id, node]));
  const unchanged = (id: string, p: Point) => { const n = nodes.get(id); return n && p.x === (n.x ?? 0) + (n.width ?? 0) / 2 && p.y === (n.y ?? 0) + (n.height ?? 0) / 2; };
  for (const edge of graph.edges ?? []) {
    const section = edge.sections?.[0]; const label = edge.labels?.[0];
    const source = positions.get(edge.sources[0]); const target = positions.get(edge.targets[0]);
    if (!section || !source || !target || !unchanged(edge.sources[0], source) || !unchanged(edge.targets[0], target)) continue;
    layout.routes.set(edge.id, { points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint], label: { x: (label?.x ?? section.startPoint.x) + (label?.width ?? 0) / 2, y: (label?.y ?? section.startPoint.y) + 14 }, source: { ...source }, target: { ...target } });
  }
}

/** Treat pins as fixed obstacles; only unpinned nodes move, with a bounded downward collision sweep. */
function avoidPinnedOverlaps(positions: Map<string, Point>, pins: Set<string>, graph: ElkNode): void {
  const nodes = graph.children ?? [];
  const box = (node: typeof nodes[number]) => ({ point: positions.get(node.id)!, width: node.width ?? 12, height: node.height ?? 12 });
  const occupied = nodes.filter((n) => pins.has(n.id)).map(box);
  for (const node of nodes) {
    if (pins.has(node.id)) continue;
    const current = box(node);
    occupied.sort((a, b) => a.point.y + a.height / 2 - b.point.y - b.height / 2);
    for (const other of occupied) {
      if (Math.abs(current.point.x - other.point.x) < (current.width + other.width) / 2 + 24 && Math.abs(current.point.y - other.point.y) < (current.height + other.height) / 2 + 24) current.point.y = other.point.y + (current.height + other.height) / 2 + 30;
    }
    occupied.push(current);
  }
}

/** Serialize coordinates, pins, routes and options, with no executable visualization data. */
export function saveGraphLayout(layout: GraphLayout): SavedGraphLayout {
  return { settings: { ...layout.settings }, positions: Array.from(layout.positions, ([id, p]) => ({ id, ...p })).slice(0, 2400), pins: [...layout.pins], routes: Array.from(layout.routes, ([id, route]) => ({ id, route })).slice(0, MAX_LAYOUT_EDGES) };
}

/** Bound and validate untrusted saved geometry; old bundles simply receive the default layout. */
export function validateGraphLayout(value: unknown): SavedGraphLayout | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Partial<SavedGraphLayout>; const settings = v.settings;
  if (!settings || !['layered', 'force'].includes(settings.algorithm) || !['RIGHT', 'DOWN'].includes(settings.direction) || !['trace', 'state'].includes(settings.scope)) return undefined;
  const validPoint = (p: Point): boolean => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1e7 && Math.abs(p.y) <= 1e7;
  const positions = Array.isArray(v.positions) ? v.positions.slice(0, 2400).filter((p) => p && typeof p.id === 'string' && p.id.length <= 65536 && validPoint(p)) : [];
  const ids = new Set(positions.map((p) => p.id));
  const pins = Array.isArray(v.pins) ? v.pins.slice(0, MAX_GRAPH_ATOMS).filter((id) => typeof id === 'string' && ids.has(id)) : [];
  const routes = Array.isArray(v.routes) ? v.routes.slice(0, MAX_LAYOUT_EDGES).filter((r) => r && typeof r.id === 'string' && r.id.length <= 65536 && r.route && Array.isArray(r.route.points) && r.route.points.length >= 2 && r.route.points.length <= 100 && r.route.points.every(validPoint) && validPoint(r.route.label) && validPoint(r.route.source) && validPoint(r.route.target)) : [];
  const ignoredRelations = Array.isArray(settings.ignoredRelations) ? settings.ignoredRelations.slice(0, 2000).filter((id) => typeof id === 'string') : [];
  return { settings: { algorithm: settings.algorithm, direction: settings.direction, scope: settings.scope, ignoredRelations }, positions, pins, routes };
}

/** Restore validated geometry before rendering so reload never briefly rearranges a saved exploration. */
export function restoreGraphLayout(layout: GraphLayout, saved: SavedGraphLayout): void {
  layout.settings = { ...saved.settings }; layout.positions = new Map(saved.positions.map((p) => [p.id, { x: p.x, y: p.y }]));
  layout.pins = new Set(saved.pins); layout.routes = new Map(saved.routes.map((r) => [r.id, r.route]));
}

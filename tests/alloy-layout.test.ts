import { describe, expect, it } from 'vitest';
import ELK from 'elkjs/lib/elk.bundled';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { atomId, createGraphLayout, DEFAULT_LAYOUT, elkGraph, installLayout, junctionId, layoutTopology, restoreGraphLayout, saveGraphLayout, validateGraphLayout } from '../src/alloy-viz/graph-layout';
import type { LayoutTopology } from '../src/alloy-viz/graph-layout';
import { DEFAULT_PROFILE } from '../src/alloy-viz/types';
import { parseAlloyXml } from '../src/alloy-viz/xml';
import { readExploration } from '../src/alloy-viz/save';

const trace = parseAlloyXml(readFileSync('tests/fixtures/temporal.xml', 'utf8'), (xml) => new DOMParser().parseFromString(xml, 'application/xml'));
const chain: LayoutTopology = {
  nodes: ['A', 'B', 'C', 'Isolated'].map((id) => ({ id, width: 152, height: 64 })),
  edges: [{ id: 'ab', source: 'A', target: 'B', label: 'next' }, { id: 'bc', source: 'B', target: 'C', label: 'next' }, { id: 'parallel', source: 'A', target: 'B', label: 'owns' }], truncated: false,
};

/** Exercise the real ELK engine; the browser suite separately verifies extension-worker execution. */
async function compute(topology = chain, direction: 'RIGHT' | 'DOWN' = 'RIGHT'): Promise<ElkNode> {
  const elk = new ELK();
  return await elk.layout(elkGraph(topology, { ...DEFAULT_LAYOUT, direction }));
}

describe('Connection-aware Alloy layouts', () => {
  it('uses trace-union connections without adding absent tuples to a state', () => {
    const topology = layoutTopology(trace, DEFAULT_PROFILE, trace.states);
    expect(topology.nodes.filter((n) => n.atom)).toHaveLength(2);
    expect(topology.nodes.some((n) => n.id === junctionId('7', ['Clock$0', 'Node$0', 'Node$0']))).toBe(true);
    expect(topology.edges).toHaveLength(4);
    expect(new Set(topology.edges.map((edge) => edge.id)).size).toBe(4);
    expect(layoutTopology(trace, DEFAULT_PROFILE, [trace.states[0]]).edges).toHaveLength(0);
    expect(trace.states[0].relations['6']).toEqual([]);
    expect(layoutTopology(trace, DEFAULT_PROFILE, trace.states, ['7']).edges).toHaveLength(1);
    expect(layoutTopology(trace, { ...DEFAULT_PROFILE, hiddenRelations: ['6', '7'] }, trace.states).edges).toHaveLength(0);
    const projected = layoutTopology(trace, { ...DEFAULT_PROFILE, projection: 'Clock$0' }, trace.states);
    expect(projected.nodes.map((n) => n.atom)).toEqual(['Node$0']);
    expect(projected.edges).toHaveLength(1); // The ternary tuple projects to a binary self-loop.
  });

  it('orders a directed chain by connectivity, separates labels/parallel routes and packs isolated nodes', async () => {
    const graph = await compute(); const nodes = graph.children!;
    expect(nodes.find((n) => n.id === 'A')!.x!).toBeLessThan(nodes.find((n) => n.id === 'B')!.x!);
    expect(nodes.find((n) => n.id === 'B')!.x!).toBeLessThan(nodes.find((n) => n.id === 'C')!.x!);
    for (const a of nodes) for (const b of nodes) if (a.id !== b.id) {
      expect(a.x! + a.width! <= b.x! || b.x! + b.width! <= a.x! || a.y! + a.height! <= b.y! || b.y! + b.height! <= a.y!).toBe(true);
    }
    const first = graph.edges!.find((e) => e.id === 'ab')!; const second = graph.edges!.find((e) => e.id === 'parallel')!;
    expect(first.sections).not.toEqual(second.sections);
    expect([first.labels![0].x, first.labels![0].y]).not.toEqual([second.labels![0].x, second.labels![0].y]);
    for (const edge of graph.edges!) for (const label of edge.labels ?? []) for (const node of nodes) {
      expect(label.x! + label.width! <= node.x! || node.x! + node.width! <= label.x! || label.y! + label.height! <= node.y! || node.y! + node.height! <= label.y!).toBe(true);
    }
    const downward = await compute(chain, 'DOWN');
    expect(downward.children!.find((n) => n.id === 'A')!.y!).toBeLessThan(downward.children!.find((n) => n.id === 'B')!.y!);
    expect((await compute()).children!.map((n) => [n.id, n.x, n.y])).toEqual(nodes.map((n) => [n.id, n.x, n.y]));
  });

  it('respects exact pins, moves conflicting unpinned nodes, and round-trips routed geometry in bundles', async () => {
    const graph = await compute(); const layout = createGraphLayout(); installLayout(layout, graph);
    const b = { ...layout.positions.get('B')! }; layout.positions.set('A', b); layout.pins.add('A');
    installLayout(layout, graph);
    expect(layout.positions.get('A')).toEqual(b);
    expect(layout.positions.get('B')).not.toEqual(b);
    expect(layout.routes.has('ab')).toBe(false); // Manual endpoints use freshly clipped fallback curves.
    const saved = saveGraphLayout(layout);
    const bundle = readExploration(JSON.stringify({ format: 'openspec-alloy-viz', version: 1, label: 'Pinned', xml: readFileSync('tests/fixtures/temporal.xml', 'utf8'), launch: null, selected: [], profile: DEFAULT_PROFILE, result: {}, graphLayout: saved }));
    const restored = createGraphLayout(); restoreGraphLayout(restored, bundle.graphLayout!);
    expect(saveGraphLayout(restored)).toEqual(saved);
    expect(validateGraphLayout({ ...saved, positions: [{ id: 'bad', x: Infinity, y: 1 }], pins: ['bad'], routes: [{ id: 'bad', route: { points: [{ x: NaN, y: 0 }] } }] })?.positions).toEqual([]);
    expect(validateGraphLayout({ settings: { algorithm: 'executable-script' } })).toBeUndefined();
    expect(atomId('tuple')).not.toBe(junctionId('tuple', []));
  });

  it('routes repeated higher-arity arguments and self loops as distinct edges', async () => {
    const topology = layoutTopology(trace, DEFAULT_PROFILE, trace.states);
    const graph = await compute(topology); const layout = createGraphLayout(); installLayout(layout, graph);
    expect(layout.routes.size).toBe(4);
    expect(new Set([...layout.routes.values()].map((r) => `${r.label.x}:${r.label.y}`)).size).toBe(4);
    const elk = new ELK();
    const force = await elk.layout(elkGraph(topology, { ...DEFAULT_LAYOUT, algorithm: 'force' }));
    expect(force.children!.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });
});

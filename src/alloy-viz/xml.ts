import type { AlloyDeclaration, AlloyTrace, TraceState, Tuple } from './types';

export interface XmlElement {
  readonly nodeName: string;
  readonly parentNode: unknown;
  getAttribute(name: string): string | null;
  getElementsByTagName(name: string): ArrayLike<XmlElement>;
}
export interface XmlDocument { readonly documentElement: XmlElement | null; getElementsByTagName(name: string): ArrayLike<XmlElement> }
export type XmlParser = (source: string) => XmlDocument;
const MAX_XML = 16 * 1024 * 1024;

/** Only immediate children participate; temporal instances must never be flattened together. */
function children(node: XmlElement, tag: string): XmlElement[] {
  return Array.from(node.getElementsByTagName(tag)).filter((element) => element.parentNode === node);
}
/** Required identifiers/labels are bounded before allocating graph data. */
function attribute(node: XmlElement, name: string): string {
  const value = node.getAttribute(name);
  if (!value || value.length > 8192) throw new Error(`Missing or invalid ${name} on ${node.nodeName}`);
  return value;
}
/** Optional integer metadata has explicit range validation. */
function integer(node: XmlElement, name: string, fallback: number, min: number, max: number): number {
  const raw = node.getAttribute(name);
  const value = raw === null || raw === '' ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
}

/** Alloy 6 releases use either a loop-state index or a loop length in their XML format. */
function loopState(instance: XmlElement, length: number, fallback: number): number {
  const loopLength = instance.getAttribute('looplength');
  const fromLength = loopLength ? length - integer(instance, 'looplength', length, 1, length) : fallback;
  const index = integer(instance, 'backloop', fromLength, 0, length - 1);
  if (loopLength && index !== fromLength) throw new Error('Contradictory loop metadata');
  return index;
}

/** Build one state with typed declarations, retaining empty relations, subset membership, and skolems. */
function parseState(instance: XmlElement, declarations: Map<string, AlloyDeclaration>): TraceState {
  const signatures: Record<string, string[]> = Object.create(null);
  const relations: Record<string, Tuple[]> = Object.create(null);
  const seen = new Set<string>();
  for (const kind of ['sig', 'field', 'skolem'] as const) for (const node of children(instance, kind)) {
    const id = attribute(node, 'ID');
    if (seen.has(id)) throw new Error(`Duplicate declaration ID ${id}`);
    seen.add(id);
    const types = kind === 'sig' ? children(node, 'type').map((type) => [attribute(type, 'ID')]) : children(node, 'types').map((types) => children(types, 'type').map((type) => attribute(type, 'ID')));
    if (kind === 'sig') {
      signatures[id] = children(node, 'atom').map((atom) => attribute(atom, 'label'));
      if (signatures[id].length > 20_000) throw new Error('Signature exceeds atom limit');
    } else {
      relations[id] = children(node, 'tuple').map((tuple) => children(tuple, 'atom').map((atom) => attribute(atom, 'label')));
      if (relations[id].length > 100_000 || relations[id].some((tuple) => !tuple.length || tuple.length > 20)) throw new Error('Invalid relation size/arity');
      if (relations[id].some((tuple) => types.length && !types.some((type) => type.length === tuple.length))) throw new Error(`Tuple arity disagrees with types for ${id}`);
    }
    const declaration: AlloyDeclaration = { id, kind, label: attribute(node, 'label'), parent: node.getAttribute('parentID') || null, types,
      mutable: node.getAttribute('var') === 'yes', builtin: node.getAttribute('builtin') === 'yes', subset: kind === 'sig' && children(node, 'type').length > 0 };
    const previous = declarations.get(id);
    if (previous && (previous.kind !== kind || previous.label !== declaration.label || previous.parent !== declaration.parent || previous.mutable !== declaration.mutable)) throw new Error(`Declaration ${id} changes identity across states`);
    declarations.set(id, previous ? { ...declaration, types: Array.from(new Map([...previous.types, ...declaration.types].map((type) => [JSON.stringify(type), type])).values()) } : declaration);
    if (declarations.size > 2000) throw new Error('Too many declarations');
  }
  return { signatures, relations };
}

/** Expand signature inheritance bottom-up, including mutable universe membership, without recursion. */
function expand(state: TraceState, declarations: readonly AlloyDeclaration[], budget: { cells: number }): TraceState {
  const signatures: Record<string, string[]> = Object.fromEntries(Object.entries(state.signatures).map(([id, atoms]) => [id, [...atoms]]));
  const sigs = declarations.filter((declaration) => declaration.kind === 'sig');
  const byId = new Map(sigs.map((declaration) => [declaration.id, declaration]));
  const children = new Map<string, string[]>();
  for (const sig of sigs) if (sig.parent) children.set(sig.parent, [...(children.get(sig.parent) ?? []), sig.id]);
  const remaining = new Map(sigs.map((sig) => [sig.id, children.get(sig.id)?.length ?? 0]));
  const queue = sigs.filter((sig) => !remaining.get(sig.id)).map((sig) => sig.id);
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    signatures[id] = Array.from(new Set([...(signatures[id] ?? []), ...(children.get(id) ?? []).flatMap((child) => signatures[child] ?? [])]));
    budget.cells += signatures[id].length;
    if (budget.cells > 2_000_000) throw new Error('Trace exceeds expanded signature-membership limit');
    const parent = byId.get(id)?.parent;
    if (parent) { const count = remaining.get(parent)! - 1; remaining.set(parent, count); if (!count) queue.push(parent); }
  }
  if (queue.length !== sigs.length) throw new Error('Cyclic signature inheritance');
  return { signatures, relations: state.relations };
}

/** Read Alloy 4/5 static XML and Alloy 6 trace XML using state-local values and explicit lasso metadata. */
export function parseAlloyXml(xml: string, parser: XmlParser = (source) => new DOMParser().parseFromString(source, 'application/xml')): AlloyTrace {
  if (xml.length > MAX_XML || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('XML is too large or contains unsupported declarations');
  const document = parser(xml);
  const root = document.documentElement;
  if (!root || root.nodeName !== 'alloy' || document.getElementsByTagName('parsererror').length) throw new Error('Not a valid Alloy result');
  const instances = children(root, 'instance');
  if (!instances.length || instances.length > 500) throw new Error('Expected 1–500 trace states');
  const first = instances[0];
  if (first.getAttribute('metamodel') === 'yes') throw new Error('A metamodel is not a satisfying instance/trace');
  const length = integer(first, 'tracelength', instances.length, 1, 500);
  const loopStart = loopState(first, length, 0);
  if (length !== instances.length) throw new Error('Trace length does not match the number of instances');
  const command = attribute(first, 'command');
  const bitwidth = integer(first, 'bitwidth', 4, 0, 32);
  const declarations = new Map<string, AlloyDeclaration>();
  const raw = instances.map((instance) => {
    if (attribute(instance, 'command') !== command || integer(instance, 'bitwidth', bitwidth, 0, 32) !== bitwidth || loopState(instance, length, loopStart) !== loopStart || integer(instance, 'tracelength', length, 1, 500) !== length) throw new Error('Inconsistent trace metadata');
    return parseState(instance, declarations);
  });
  for (const declaration of declarations.values()) {
    if (declaration.kind === 'field' && !declaration.parent) throw new Error('Field has no owning signature');
    if (declaration.parent && declarations.get(declaration.parent)?.kind !== 'sig') throw new Error(`Unknown signature parent ${declaration.parent}`);
    for (const type of declaration.types.flat()) if (declarations.get(type)?.kind !== 'sig') throw new Error(`Unknown signature type ${type}`);
    if (raw.some((state) => !(declaration.id in (declaration.kind === 'sig' ? state.signatures : state.relations)))) throw new Error(`Declaration ${declaration.id} missing from a state`);
  }
  const values = Array.from(declarations.values());
  const min = bitwidth ? -(2 ** (bitwidth - 1)) : 0;
  const max = bitwidth ? 2 ** (bitwidth - 1) - 1 : -1;
  const integerSig = values.find((declaration) => declaration.builtin && declaration.label === 'Int');
  const sequenceSig = values.find((declaration) => declaration.builtin && declaration.label === 'seq/Int');
  for (const state of raw) {
    const signatures = state.signatures as Record<string, readonly string[]>;
    if (integerSig) signatures[integerSig.id] = bitwidth <= 12 ? Array.from({ length: max - min + 1 }, (_, index) => String(min + index)) : Array.from(new Set(Object.values(state.relations).flatMap((tuples) => tuples.flat()).filter((atom) => /^-?\d+$/.test(atom))));
    if (sequenceSig) signatures[sequenceSig.id] = Array.from({ length: Math.min(integer(first, 'maxseq', 0, 0, 1_000_000), bitwidth <= 12 ? Math.max(0, max + 1) : 4096) }, (_, index) => String(index));
  }
  const budget = { cells: 0 };
  const states = raw.map((state) => expand(state, values, budget));
  // Skolems/derived functions and univ may vary without an explicit var flag in exported XML.
  const enriched = values.map((declaration) => ({ ...declaration, mutable: declaration.mutable || ((declaration.kind === 'skolem' || declaration.label === 'univ') && states.some((state) => JSON.stringify(declaration.kind === 'sig' ? state.signatures[declaration.id] : state.relations[declaration.id]) !== JSON.stringify(declaration.kind === 'sig' ? states[0].signatures[declaration.id] : states[0].relations[declaration.id]))) }));
  const traceKind = instances.length > 1 || first.getAttribute('backloop') || first.getAttribute('looplength') ? 'temporal' : first.getAttribute('tracelength') ? 'unknown' : 'static';
  return { traceKind, command, filename: first.getAttribute('filename') ?? '', buildDate: root.getAttribute('builddate') ?? '', bitwidth, integerRange: { min, max, enumerated: bitwidth <= 12 },
    minTrace: integer(first, 'mintrace', 1, -1, 2_147_483_647), maxTrace: integer(first, 'maxtrace', length, -1, 2_147_483_647), loopStart,
    declarations: enriched, states, sources: children(root, 'source').map((source) => ({ filename: attribute(source, 'filename'), content: source.getAttribute('content') ?? source.getAttribute('source') ?? '' })),
  };
}

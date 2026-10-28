import { javaLanguage } from '@codemirror/lang-java';
import type { SyntaxNode, Tree } from '@lezer/common';
import { javaBlocks } from './java-comments';
import type { JavaBlock } from './java-comments';
import { jmlClauses, jmlTokens } from './jml';
import { simpleEnums } from './java-enums';
import type { JavaEnum } from './java-enums';

export interface JavaDefinition {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly title: string;
  readonly signature: string;
  readonly qualifiedName: string;
  readonly depth: number;
  readonly line: number;
  readonly from: number;
  readonly rangeFrom: number;
  readonly rangeTo: number;
}
export interface JavaDocument {
  readonly kind: 'java';
  readonly source: string;
  readonly codeSource: string;
  readonly title: string;
  readonly language: 'java' | 'jml';
  readonly artifact: 'Java source' | 'JML specification';
  readonly definitions: readonly JavaDefinition[];
  readonly blocks: readonly JavaBlock[];
  readonly blockOwners: ReadonlyMap<number, JavaDefinition>;
  readonly enums: readonly JavaEnum[];
}

/** Use qualified declaration names to make detached documentation and contract cards identifiable. */
export function javaBlockLabel(model: JavaDocument, block: JavaBlock): string {
  const owner = model.blockOwners.get(block.from);
  const prefix = block.kind === 'javadoc' ? 'Javadoc' : 'OpenJML contract';
  const name = owner?.kind === 'constructor' ? owner.qualifiedName.replace(/([^.(]+)\.\1(?=\()/, '$1') : owner?.qualifiedName;
  const target = owner ? `${owner.kind.replace(/-/g, ' ')} ${name}` : `file ${model.title}`;
  return `${prefix} · ${target}${block.conditional ? ' · conditional annotation' : ''}`;
}

/** Enum constants and enum-owned fields use ordinary prose, including enums rendered as source. */
export function javadocUsesSummary(model: JavaDocument, block: JavaBlock): boolean {
  const owner = model.blockOwners.get(block.from);
  if (owner?.kind === 'constant') return false;
  if (!owner || !['field', 'model-field', 'ghost-field'].includes(owner.kind)) return true;
  let scope: JavaDefinition | undefined;
  for (const definition of model.definitions) {
    if (!TYPES_RE.test(definition.kind) || definition.rangeFrom >= owner.from || definition.rangeTo <= owner.from) continue;
    if (!scope || definition.rangeTo - definition.rangeFrom < scope.rangeTo - scope.rangeFrom) scope = definition;
  }
  return scope?.kind !== 'enum';
}
const TYPES: Readonly<Record<string, string>> = { ClassDeclaration: 'class', InterfaceDeclaration: 'interface', EnumDeclaration: 'enum', RecordDeclaration: 'record', AnnotationTypeDeclaration: 'annotation' };
const MEMBERS: Readonly<Record<string, string>> = { MethodDeclaration: 'method', ConstructorDeclaration: 'constructor', CompactConstructorDeclaration: 'constructor', AnnotationTypeElementDeclaration: 'method', EnumConstant: 'constant', RecordComponent: 'component', StaticInitializer: 'initializer' };

/** Compact signatures for navigation, stripping annotations/comments without changing source offsets. */
function compact(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();
}

/** Count named enclosing types; method-local variables and calls never become member definitions. */
function owners(node: SyntaxNode, source: string): string[] {
  const names: string[] = [];
  for (let parent = node.parent, depth = 0; parent && depth < 256; parent = parent.parent, depth++) {
    if (!TYPES[parent.name]) continue;
    const name = parent.getChild('Definition') ?? parent.getChild('Identifier');
    if (name) names.unshift(source.slice(name.from, name.to));
  }
  return names;
}

/** Parameter types disambiguate overloads and match Javadoc references such as #add(int). */
function signature(node: SyntaxNode, name: string, source: string): string {
  const parameters = node.getChild('FormalParameters');
  if (!parameters) return node.name === 'CompactConstructorDeclaration' || node.name === 'AnnotationTypeElementDeclaration' ? `${name}()` : name;
  const types: string[] = [];
  for (let child = parameters.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'FormalParameter' && child.name !== 'SpreadParameter' && child.name !== 'ReceiverParameter') continue;
    const declared = child.getChild('Definition') ?? child.getChild('VariableDeclarator')?.getChild('Definition');
    const typeFrom = child.getChild('Modifiers')?.to ?? child.from;
    const type = compact(source.slice(typeFrom, declared?.from ?? child.to)).replace(/\bfinal\s+/g, '').replace(/\s+/g, '');
    const suffix = declared ? /^(?:\s*\[\s*\])*/.exec(source.slice(declared.to, child.to))?.[0].replace(/\s/g, '') ?? '' : '';
    types.push(type + suffix);
  }
  return `${name}(${types.join(', ')})`;
}

/** Collect structural Java declarations with hierarchy, including signatures in external .jml files. */
function nativeDefinitions(source: string, tree: Tree, lineAt: (offset: number) => number): JavaDefinition[] {
  const definitions: JavaDefinition[] = [];
  tree.iterate({ enter(ref) {
    const node = ref.node;
    const kind = TYPES[node.name] ?? MEMBERS[node.name] ?? (node.name === 'FieldDeclaration' ? 'field' : node.name === 'PackageDeclaration' ? 'package' : node.name === 'ImportDeclaration' ? 'import' : null);
    if (!kind) return;
    const owner = owners(node, source);
    const names = node.name === 'FieldDeclaration' ? node.getChildren('VariableDeclarator').flatMap((variable) => variable.getChild('Definition') ?? []) : [node.getChild('Definition') ?? node.getChild('Identifier') ?? node.getChild('ScopedIdentifier') ?? node];
    for (const nameNode of names) {
      const name = kind === 'initializer' ? 'static' : source.slice(nameNode.from, nameNode.to);
      const signed = kind === 'method' || kind === 'constructor' ? signature(node, name, source) : kind === 'import' ? compact(source.slice(node.from, node.to).replace(/^import\s+|;$/g, '')) : name;
      const identity = [kind, ...owner, signed].join('-').toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '-');
      definitions.push({ id: identity, kind, name, signature: signed, qualifiedName: [...owner, signed].join('.'), title: kind === 'initializer' ? 'static initializer' : `${kind} ${signed}`, depth: owner.length + 1, line: lineAt(nameNode.from), from: nameNode.from, rangeFrom: node.from, rangeTo: node.to });
    }
  } });
  return definitions;
}

/** Prefix documentation belongs to the next declaration; class/loop clauses stay with their scope. */
function documentationOwner(block: JavaBlock, definitions: readonly JavaDefinition[], source: string): JavaDefinition | undefined {
  const firstKeyword = jmlClauses(block.body)[0]?.keyword ?? '';
  const classClause = block.kind === 'jml' && /\b(?:invariant|constraint|initially|represents|model|ghost|axiom)\b/.test(firstKeyword);
  if (/\b(?:model|ghost)\b/.test(firstKeyword)) {
    const method = definitions.find((definition) => /^(?:method|constructor)$/.test(definition.kind) && definition.rangeFrom < block.from && block.to < definition.rangeTo);
    if (method) return method;
  }
  if (!classClause) {
    const next = definitions.find((definition) => definition.rangeFrom >= block.to);
    if (next && !compact(source.slice(block.to, next.rangeFrom))) return next;
  }
  return definitions.filter((definition) => definition.rangeFrom < block.from && block.to <= definition.rangeTo && (!classClause || TYPES_RE.test(definition.kind)))
    .sort((a, b) => (a.rangeTo - a.rangeFrom) - (b.rangeTo - b.rangeFrom))[0];
}
const TYPES_RE = /^(?:class|interface|enum|record|annotation)$/;

/** Index model/ghost declarations from JML comments without mistaking arbitrary clause text for Java. */
function specificationDefinitions(block: JavaBlock, owner: JavaDefinition | undefined, lineAt: (offset: number) => number): JavaDefinition[] {
  if (block.kind !== 'jml' || !/\b(?:model|ghost)\b/.test(block.body)) return [];
  const spaces = (value: string): string => value.replace(/[^\n]/g, ' ');
  let masked = block.raw.startsWith('//') ? block.raw.replace(/^[ \t]*\/\/(?:[+-][\w,+-]*)?@/gm, spaces)
    : block.raw.replace(/^\/\*(?:[+-][\w,+-]*)?@|@?\*\/$/g, spaces).replace(/^[ \t]*@/gm, spaces);
  masked = masked.replace(/\b(?:model|ghost|pure|spec_pure|strictly_pure|spec_public|spec_protected|nullable|non_null|instance)\b/g, spaces);
  const prefix = 'class Specification {\n';
  const wrapped = `${prefix}${masked}\n}`;
  const entries = nativeDefinitions(wrapped, javaLanguage.parser.parse(wrapped), () => 1);
  const result: JavaDefinition[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'field' && entry.kind !== 'method') continue;
    const relative = entry.from - prefix.length;
    if (relative < 0 || relative >= block.raw.length) continue;
    const previousClause = block.raw.lastIndexOf(';', relative - 1) + 1;
    const modifier = jmlTokens(block.raw.slice(previousClause, relative)).find((token) => token.style === 'keyword' && (token.text === 'model' || token.text === 'ghost'));
    if (!modifier) continue;
    const from = block.from + relative;
    const kind = `${modifier.text}-${entry.kind}`;
    const id = `${owner?.id ?? 'spec'}-${kind}-${entry.signature}`.toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '-');
    result.push({ ...entry, id, kind, qualifiedName: [owner?.qualifiedName, entry.signature].filter(Boolean).join('.'), title: `${modifier.text} ${entry.kind} ${entry.signature}`, depth: (owner?.depth ?? 0) + 1, line: lineAt(from), from, rangeFrom: block.from, rangeTo: block.to });
  }
  return result;
}

/** Build a binary-search source-line index rather than rescanning the file for every definition. */
function lineIndex(source: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length;
    while (low < high) { const mid = (low + high) >>> 1; if (starts[mid] <= offset) low = mid + 1; else high = mid; }
    return low;
  };
}

/** Preserve captured source; use Java syntax nodes plus source-mapped documentation/contract entries. */
export function parseJavaDocument(source: string, url: string): JavaDocument {
  const codeSource = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const tree = javaLanguage.parser.parse(codeSource);
  const blocks = javaBlocks(codeSource, tree);
  const lineAt = lineIndex(codeSource);
  const definitions = nativeDefinitions(codeSource, tree, lineAt);
  for (const block of blocks) definitions.push(...specificationDefinitions(block, documentationOwner(block, definitions, codeSource), lineAt));
  definitions.sort((a, b) => a.from - b.from);
  const indexed: JavaDefinition[] = [];
  const seen = new Set<string>();
  const sortAt = new Map<string, number>();
  const blockOwners = new Map<number, JavaDefinition>();
  for (const definition of definitions) {
    let id = definition.id;
    for (let i = 2; seen.has(id); i++) id = `${definition.id}-${i}`;
    seen.add(id);
    indexed.push({ ...definition, id });
    sortAt.set(id, definition.from);
  }
  const declarations = indexed.slice();
  for (const block of blocks) {
    const owner = documentationOwner(block, declarations, codeSource);
    if (owner) blockOwners.set(block.from, owner);
    if (!block.fullLine) continue;
    const keywords = Array.from(new Set(jmlClauses(block.body).map((clause) => clause.keyword).filter(Boolean))).slice(0, 3);
    const kind = block.kind === 'javadoc' ? 'javadoc' : 'contract';
    const id = `${kind}-${block.from}`;
    sortAt.set(id, owner?.from ?? block.from);
    indexed.push({ id, kind, name: kind, signature: kind, qualifiedName: owner?.qualifiedName ?? kind, title: kind === 'javadoc' ? 'Javadoc' : `JML: ${keywords.join(', ') || 'specification'}`, depth: (owner?.depth ?? 0) + 1, line: block.line, from: block.from, rangeFrom: block.from, rangeTo: block.to });
  }
  // Keep documentation entries directly below their owners, even when their comments precede the declaration.
  indexed.sort((a, b) => sortAt.get(a.id)! - sortAt.get(b.id)! || a.depth - b.depth || a.from - b.from);
  let filename = 'Java source';
  try { filename = decodeURIComponent(new URL(url).pathname).split('/').pop() || filename; } catch { /* detached fixture */ }
  const language = /\.jml$/i.test(filename) ? 'jml' : 'java';
  return { kind: 'java', source, codeSource, title: filename, language, artifact: language === 'jml' ? 'JML specification' : 'Java source', definitions: indexed, blocks, blockOwners, enums: simpleEnums(codeSource, tree, declarations, blocks, blockOwners) };
}

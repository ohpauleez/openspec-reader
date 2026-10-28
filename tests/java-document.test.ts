import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { parseJavaDocument } from '../src/java-document';
import { documentKind, isReaderUrl, isTextDocument } from '../src/detection';
import { jmlClauses, jmlTokens } from '../src/jml';
import { inlineJavadoc, javadocParts } from '../src/javadoc';

describe('Java and external JML document models', () => {
  it('detects .java/.jml paths and text MIME types without accepting binary/class files', () => {
    for (const url of ['file:///Counter.java', 'file:///Counter%2EJML#method-size', 'https://example.test/Counter.JAVA?q=1']) expect(documentKind(url)).toBe('java');
    for (const type of ['text/x-java-source', 'text/x-java', 'text/java', 'text/x-jml; charset=utf-8']) expect(isTextDocument(type)).toBe(true);
    expect(isReaderUrl('file:///Counter.class')).toBe(false);
    expect(isReaderUrl('file:///Counter.java/')).toBe(false);
    expect(isReaderUrl('file:///Counter.jml.exe')).toBe(false);
    expect(isTextDocument('application/java-vm')).toBe(false);
  });

  it('indexes nested types, overloads, constructors, fields and documentation without locals/calls', () => {
    const model = parseJavaDocument(readFileSync('tests/fixtures/Counter.java', 'utf8'), 'file:///Counter.java');
    const titles = model.definitions.map((definition) => definition.title);
    for (const title of ['package example', 'import java.util.Objects', 'class Counter', 'field value', 'model field total', 'constructor Counter(int)', 'method add(int)', 'method add(int, int)', 'record Snapshot', 'component value', 'constructor Snapshot()', 'enum Mode', 'constant OPEN', 'interface Resettable', 'method reset()', 'annotation Name', 'method value()']) expect(titles).toContain(title);
    expect(titles.some((title) => title.includes('Ghost') || title === 'field local')).toBe(false);
    expect(model.definitions.find((definition) => definition.name === 'Snapshot')?.depth).toBe(2);
    expect(new Set(model.definitions.map((definition) => definition.id)).size).toBe(model.definitions.length);
    for (const definition of model.definitions) expect(model.codeSource.slice(0, definition.from).split('\n').length).toBe(definition.line);
    expect(model.blocks.some((block) => block.kind === 'javadoc' && block.body.includes('@param amount'))).toBe(true);
    expect(model.blocks.filter((block) => block.conditional)).toHaveLength(1);
    expect(model.blocks.find((block) => block.body === 'spec_public')?.fullLine).toBe(false);
  });

  it('keeps .jml signature-only methods and constructors navigable and normalizes editor offsets', () => {
    const source = '\uFEFF' + readFileSync('tests/fixtures/Counter.jml', 'utf8').replace(/\n/g, '\r\n');
    const model = parseJavaDocument(source, 'file:///Counter.jml');
    expect(model.language).toBe('jml');
    expect(model.artifact).toBe('JML specification');
    expect(model.source).toBe(source);
    expect(model.codeSource).not.toContain('\r');
    expect(model.definitions.some((definition) => definition.signature === 'size()')).toBe(true);
    expect(model.definitions.some((definition) => definition.signature === 'Counter(int)')).toBe(true);
    expect(model.definitions.filter((definition) => definition.kind === 'contract').length).toBeGreaterThan(2);
  });

  it('uses parameter types rather than annotations/names to distinguish overloads', () => {
    const model = parseJavaDocument('class C { void read(@Nullable String value, final int numbers[]) {} void read(int value) {} }', 'file:///C.java');
    expect(model.definitions.filter((definition) => definition.kind === 'method').map((definition) => definition.signature)).toEqual(['read(String, int[])', 'read(int)']);
  });

  it('groups active line annotations separately from conditional annotations and ordinary comments', () => {
    const source = 'class C {\n //@ requires true;\n //@ ensures true;\n //+ESC@ ensures false;\n // @ not an active annotation\n /* ordinary comment */\n int f() { return 0; }\n}';
    const model = parseJavaDocument(source, 'file:///C.java');
    expect(model.blocks).toHaveLength(2);
    expect(model.blocks[0].body).toBe('requires true;\nensures true;');
    expect(model.blocks[1].conditional).toBe(true);
    expect(model.blocks[1].body).toBe('ensures false;');
  });

  it('navigates ghost fields and model methods declared within specification comments', () => {
    const source = 'class C {\n /*@ public ghost int count; @*/\n /** Model query documentation. */\n /*@ public model pure int read(int value) { return value; } @*/\n int actual() { return 1; }\n}';
    const model = parseJavaDocument(source, 'file:///C.jml');
    expect(model.definitions.some((entry) => entry.title === 'ghost field count')).toBe(true);
    expect(model.definitions.some((entry) => entry.title === 'model method read(int)')).toBe(true);
    const method = model.definitions.find((entry) => entry.title === 'model method read(int)')!;
    expect(source.slice(method.from).startsWith('read(int')).toBe(true);
    const documented = model.definitions.findIndex((entry) => entry.title === 'model method read(int)');
    expect(model.definitions[documented + 1].kind).toBe('javadoc');
    expect(model.definitions[documented + 1].depth).toBe(method.depth + 1);
  });

  it('does not parse fake declarations or annotations from generated string/comment noise', () => {
    fc.assert(fc.property(fc.array(fc.constantFrom('// class Ghost {}\n', '/* void ghost() {} */\n', 'String text = "/*@ ensures false; @*/ class Ghost {}";\n'), { maxLength: 25 }), (noise) => {
      const model = parseJavaDocument(`class Real {\n${noise.join('')} public int size() { return 1; }\n}`, 'file:///Real.java');
      expect(model.definitions.some((definition) => definition.name === 'Real')).toBe(true);
      expect(model.definitions.some((definition) => definition.signature === 'size()')).toBe(true);
      expect(model.definitions.some((definition) => /Ghost|ghost/.test(definition.name))).toBe(false);
      expect(model.blocks).toHaveLength(0);
    }), { numRuns: 50 });
  });
});

describe('Javadoc and OpenJML presentation data', () => {
  it('preserves quantifier semicolons and separates behavior cases from their clauses', () => {
    const clauses = jmlClauses('public normal_behavior\n requires a != null; ensures (\\forall int i; 0 <= i < a.length; a[i] >= 0); also public exceptional_behavior requires bad; signals (Exception e) true;');
    expect(clauses.map((clause) => clause.keyword)).toEqual(['public normal_behavior', 'requires', 'ensures', 'also', 'public exceptional_behavior', 'requires', 'signals']);
    expect(clauses[2].expression).toContain('int i; 0 <= i < a.length;');
    const text = 'ensures \\result == \\old(value) + 1 ==> true;';
    expect(jmlTokens(text).map((token) => token.text).join('')).toBe(text);
    expect(jmlTokens(text).filter((token) => token.style === 'special').map((token) => token.text)).toEqual(['\\result', '\\old']);
  });

  it('extracts readable Javadoc tags, escaping literal/code text and resolving overloaded references', () => {
    const parts = javadocParts('A <strong>counter</strong>.\n@param <T> element type\n@param amount the amount\n continued\n@return a value\n@custom unknown tags remain visible');
    expect(parts.tags[0]).toEqual({ tag: 'param', name: '<T>', description: 'element type' });
    expect(parts.tags[1].description).toContain('continued');
    expect(parts.tags.at(-1)?.tag).toBe('custom');
    const model = parseJavaDocument('class C { int add(int x) { return x; } int add(String x) { return 1; } }', 'file:///C.java');
    const html = inlineJavadoc('{@code <C>} {@literal <unsafe>} {@link #add(int) integer overload}', model.definitions);
    expect(html).toContain('<code>&lt;C&gt;</code>');
    expect(html).toContain('&lt;unsafe&gt;');
    expect(html).toContain(`<a href="#${model.definitions.find((definition) => definition.signature === 'add(int)')?.id}"><code>integer overload</code></a>`);
  });

  it('keeps Java annotations and braces inside Javadoc code examples rather than making block tags', () => {
    const parts = javadocParts('<pre>{@code\n@Override\npublic void run() { }\n}</pre>\n@param value the input');
    expect(parts.description).toContain('@Override');
    expect(parts.tags.map((tag) => tag.tag)).toEqual(['param']);
    expect(inlineJavadoc(parts.description, [])).toContain('@Override');
  });
});

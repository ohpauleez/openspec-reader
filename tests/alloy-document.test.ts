import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { parseAlloyDocument } from '../src/alloy-document';
import { documentKind, isReaderUrl, isMarkdownUrl, isTextDocument } from '../src/detection';

describe('Alloy file detection', () => {
  it('recognizes encoded/case-insensitive .als paths while retaining Markdown and MIME checks', () => {
    for (const url of ['file:///tmp/reader.als#pred-node-reachable', 'file:///tmp/reader%2EALS', 'https://example.test/reader.als?v=1']) {
      expect(documentKind(url)).toBe('alloy');
      expect(isReaderUrl(url)).toBe(true);
      expect(isMarkdownUrl(url)).toBe(false);
    }
    expect(documentKind('file:///tmp/spec.md')).toBe('markdown');
    for (const url of ['file:///reader.als/', 'file:///reader.als.exe', 'about:reader.als', 'file:///bad%xx.als']) expect(isReaderUrl(url)).toBe(false);
    expect(isTextDocument('text/x-alloy; charset=utf-8')).toBe(true);
    expect(isTextDocument('text/alloy')).toBe(true);
    expect(isTextDocument('application/octet-stream')).toBe(false);
  });
});

describe('Alloy definition outline', () => {
  it('indexes modules, imports, signatures, enums, facts, receiver definitions, and commands', () => {
    const source = readFileSync('tests/fixtures/reader.als', 'utf8');
    const model = parseAlloyDocument(source, 'file:///reader.als');
    expect(model.title).toBe('outline/reader');
    expect(model.source).toBe(source);
    expect(model.definitions.map((definition) => definition.title)).toEqual([
      'module outline/reader', 'open util/ordering as order', 'sig Node', 'sig Leaf', 'sig State', 'enum Status',
      'fact StringExample', 'fact (anonymous, line 25)', 'pred Node.reachable', 'fun Node.successors', 'fun roots',
      'assert ReachabilityClosed', 'run sample', 'run reachable', 'check ReachabilityClosed',
    ]);
    for (const definition of model.definitions) {
      expect(model.codeSource.slice(0, definition.from).split('\n').length).toBe(definition.line);
      expect(model.codeSource.slice(definition.from)).toMatch(new RegExp(`^${(definition.name ?? definition.kind).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
  });

  it('keeps fake definitions in comments, strings, parameter lists, and bodies out of the outline', () => {
    const source = '// sig Ghost {}\n-- pred Ghost {}\n/* fun Ghost {} */\nsig Real {}\nfact { some "sig Ghost {} \\" pred Ghost {}" }\npred actual[x: Real] { some x }';
    expect(parseAlloyDocument(source, 'file:///reader.als').definitions.map((definition) => definition.name)).toEqual(['Real', null, 'actual']);
  });

  it('normalizes BOM/CRLF editor offsets without changing captured source', () => {
    const source = '\uFEFFmodule test\r\n\r\nsig A {}\r\npred ready {\r\n some A\r\n}\r\n';
    const model = parseAlloyDocument(source, 'file:///reader.als');
    expect(model.source).toBe(source);
    expect(model.codeSource).toBe('module test\n\nsig A {}\npred ready {\n some A\n}\n');
    expect(model.definitions.find((definition) => definition.name === 'ready')?.from).toBe(model.codeSource.indexOf('ready'));
    expect(model.definitions.find((definition) => definition.name === 'ready')?.line).toBe(4);
  });

  it('handles anonymous/labeled commands, import arguments, repeated names, and incomplete files', () => {
    const model = parseAlloyDocument('open util/ordering[Node]\nas ord\nsig A {}\nsig A {}\nsig A\'2 {}\ntrial: run valid for 3\nrun {} for 3\ncheck valid for 3\n/* unfinished pred Ghost {}', 'file:///my%20model.als');
    expect(model.title).toBe('my model.als');
    expect(new Set(model.definitions.map((definition) => definition.id)).size).toBe(model.definitions.length);
    expect(model.definitions[0].title).toBe('open util/ordering as ord');
    expect(model.definitions.some((definition) => definition.title === 'run trial: valid')).toBe(true);
    expect(model.definitions.filter((definition) => definition.kind === 'run').map((definition) => definition.name)).toEqual(['trial', null]);
    expect(parseAlloyDocument('', 'file:///empty.als').definitions).toEqual([]);
  });

  it('preserves definition order and provenance across generated comment noise', () => {
    fc.assert(fc.property(fc.array(fc.constantFrom('// sig Ghost {}\n', '-- pred Ghost {}\n', '/*\n fun Ghost {}\n*/\n'), { maxLength: 40 }), (comments) => {
      const source = comments.map((comment, index) => `${comment}sig Node${index} {\n next: set Node${index}\n}\n`).join('');
      const model = parseAlloyDocument(source, 'file:///reader.als');
      expect(model.definitions.map((definition) => definition.name)).toEqual(comments.map((_, index) => `Node${index}`));
      for (let i = 0; i < model.definitions.length; i++) {
        const definition = model.definitions[i];
        expect(source.slice(definition.from).startsWith(`Node${i}`)).toBe(true);
        expect(source.slice(0, definition.from).split('\n').length).toBe(definition.line);
        if (i > 0) expect(definition.from).toBeGreaterThan(model.definitions[i - 1].from);
      }
    }), { numRuns: 100 });
  });

  it('indexes an existing project model including multiline signature lists and assertions', () => {
    const path = '../spec-check/openspec/changes/archive/2026-06-22-merge-delta-spec-logic/specs/merged-capability-analysis/alloy/merge.als';
    const model = parseAlloyDocument(readFileSync(path, 'utf8'), `file://${path}`);
    expect(model.title).toBe('merge');
    expect(model.definitions.some((definition) => definition.name === 'FinalizedDeltaHeadingIgnored')).toBe(true);
    expect(model.definitions.some((definition) => definition.kind === 'assert')).toBe(true);
    expect(model.definitions.some((definition) => definition.kind === 'check')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DOMParser } from '@xmldom/xmldom';
import { readFileSync } from 'node:fs';
import { parseAlloyXml } from '../src/alloy-viz/xml';
import { composeModel, originalLocation, stepForward, stepBack, tupleDifference } from '../src/alloy-viz/model';
import { validateLaunch, validateProfile } from '../src/alloy-viz/types';
import { NativeFrames, nativeFrame } from '../native/protocol';
import { modulePath } from '../native/engine';
import { isAlloyModelFile, modelFileLaunch } from '../src/alloy-viz/model-files';
import { readExploration } from '../src/alloy-viz/save';

const parser = (source: string) => new DOMParser().parseFromString(source, 'application/xml');
const state = (active: string) => `<instance command="Run sample" filename="temporal.als" bitwidth="4" tracelength="2" backloop="0"><sig ID="0" label="univ" builtin="yes"/><sig ID="1" label="Node" parentID="0"><atom label="Node$0"/></sig><sig ID="2" label="Clock" parentID="0"><atom label="Clock$0"/></sig><field ID="3" label="active" parentID="2" var="yes">${active}<types><type ID="2"/><type ID="1"/></types></field></instance>`;
export const temporalXml = `<alloy builddate="2026-10-28">${state('')}${state('<tuple><atom label="Clock$0"/><atom label="Node$0"/></tuple>')}</alloy>`;

describe('Trace import and temporal semantics', () => {
  it('keeps state-local tuples, mutable metadata, inheritance, and loop target', () => {
    const trace = parseAlloyXml(temporalXml, parser);
    expect(trace.states).toHaveLength(2);
    expect(trace.loopStart).toBe(0);
    expect(trace.states[0].relations['3']).toEqual([]);
    expect(trace.states[1].relations['3']).toEqual([['Clock$0', 'Node$0']]);
    expect(trace.states[0].signatures['0']).toEqual(['Node$0', 'Clock$0']);
    expect(trace.declarations.find((declaration) => declaration.id === '3')?.mutable).toBe(true);
    const first = { index: 0, previous: null, history: [] };
    const second = stepForward(first, trace);
    const loop = stepForward(second, trace);
    expect(loop.index).toBe(0); expect(loop.previous).toBe(1);
    expect(stepBack(loop).index).toBe(1);
  });
  it('accepts a legacy Sterling XML instance without inventing temporal states', () => {
    const trace = parseAlloyXml(readFileSync('../sterling/src/main/resources/public/examples/river-crossing.xml', 'utf8'), parser);
    expect(trace.states).toHaveLength(1);
    expect(trace.loopStart).toBe(0);
    expect(trace.declarations.some((declaration) => declaration.label === 'near')).toBe(true);
  });
  it('reads Alloy 6 looplength exports with nonzero loop starts', () => {
    const frame = state('').replace('tracelength="2" backloop="0"', 'tracelength="3" looplength="2"');
    const trace = parseAlloyXml(`<alloy>${frame}${frame}${frame}</alloy>`, parser);
    expect(trace.loopStart).toBe(1);
    expect(stepForward({ index: 2, previous: 1, history: [0, 1] }, trace).index).toBe(1);
  });
  it('rejects malformed or contradictory trace metadata and XML declarations', () => {
    for (const xml of [temporalXml.replace('backloop="0"', 'backloop="4"'), temporalXml.replace('tracelength="2"', 'tracelength="3"'), '<alloy/>', '<!DOCTYPE alloy><alloy/>', temporalXml.replace('parentID="2"', 'parentID="99"')]) expect(() => parseAlloyXml(xml, parser)).toThrow();
  });
  it('preserves ordered n-ary tuples when computing differences', () => {
    fc.assert(fc.property(fc.array(fc.array(fc.string({ maxLength: 8 }), { minLength: 1, maxLength: 5 }), { maxLength: 30 }), (tuples) => {
      const result = tupleDifference([], tuples);
      expect(result.added).toEqual(tuples);
      expect(tupleDifference(tuples, tuples)).toEqual({ added: [], removed: [] });
    }));
  });
});

describe('Execution snapshots and native protocol', () => {
  it('composes selected fences in document order with original source-line mappings', () => {
    const launch = { title: 'Spec', selected: ['a', 'c'], parts: [{ id: 'a', label: 'Purpose', source: 'sig A {}', sourceUrl: 'file:///spec.md#purpose', line: 10 }, { id: 'b', label: 'Other model', source: 'sig B {}', sourceUrl: 'file:///spec.md', line: 20 }, { id: 'c', label: 'Requirement', source: 'pred valid {\n some A\n}', sourceUrl: 'file:///spec.md#requirement', line: 30 }] };
    expect(composeModel(launch, ['c', 'a']).source).toBe('sig A {}\n\npred valid {\n some A\n}');
    expect(originalLocation(launch, ['a', 'c'], 4)?.line).toBe(31);
    expect(validateLaunch(launch)).toEqual(launch);
    expect(validateLaunch({ ...launch, parts: [{ ...launch.parts[0], line: -1 }] })).toBeNull();
    expect(validateProfile({ colors: { A: 'url(javascript:bad)', B: '#ff00aa' } }).colors).toEqual({ B: '#ff00aa' });
  });
  it('decodes split/multiple UTF-8 native messages and enforces frame limits', () => {
    const message = { text: 'Node → 🦊', value: 1 }; const bytes = nativeFrame(message); const frames = new NativeFrames();
    const result: unknown[] = [];
    for (const byte of bytes) result.push(...frames.push(Buffer.from([byte])));
    expect(result).toEqual([message]);
    expect(frames.push(Buffer.concat([bytes, bytes]))).toEqual([message, message]);
    expect(() => frames.push(Buffer.from([255, 255, 255, 255]))).toThrow();
  });
  it('keeps module writes inside the disposable snapshot', () => {
    for (const path of ['../other.als', '/etc/model.als', 'C:/model.als', 'a\\b.als', 'a/../b.als']) expect(() => modulePath(path)).toThrow();
    expect(modulePath('models/domain.als')).toBe('models/domain.als');
    expect(modulePath('openspec/specs/clock/spec.md')).toBe('openspec/specs/clock/spec.md');
    expect(modulePath('SPEC.MD')).toBe('SPEC.MD');
    expect(() => modulePath('../spec.md')).toThrow();
    expect(() => modulePath('document.txt')).toThrow();
  });
  it('keeps whole Markdown models, filenames and original lines intact through saved bundles', () => {
    const content = readFileSync('tests/fixtures/literate-spec.md', 'utf8');
    for (const filename of ['spec.md', 'models/SPEC.MD', 'model.als']) expect(isAlloyModelFile(filename)).toBe(true);
    expect(isAlloyModelFile('model.md.exe')).toBe(false);
    const launch = modelFileLaunch({ path: 'spec.md', content });
    expect(validateLaunch(launch)?.filename).toBe('spec.md');
    expect(composeModel(launch, ['file']).source).toBe(content);
    const line = content.split('\n').findIndex((line) => line.startsWith('run sample')) + 1;
    expect(originalLocation(launch, ['file'], line)?.line).toBe(line);
    const saved = readExploration(JSON.stringify({ format: 'openspec-alloy-viz', version: 1, label: 'Literate spec', xml: temporalXml, launch, selected: ['file'], profile: {}, result: {}, files: [{ path: 'spec.md', content }] }));
    expect(saved.launch?.filename).toBe('spec.md');
    expect(saved.launch?.parts[0].source).toBe(content);
    expect(saved.files?.[0].content).toBe(content);
  });
});

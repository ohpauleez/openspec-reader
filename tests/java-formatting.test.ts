import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { javaBlockLabel, parseJavaDocument } from '../src/java-document';
import { summaryLength } from '../src/javadoc-summary';

describe('Documentation declarations and enum tables', () => {
  it('labels documentation and contracts with qualified types, methods, and fields', () => {
    const model = parseJavaDocument(readFileSync('tests/fixtures/Formatting.java', 'utf8'), 'file:///Formatting.java');
    const labels = model.blocks.map((block) => javaBlockLabel(model, block));
    for (const label of ['Javadoc · class Formatting', 'Javadoc · field Formatting.label', 'Javadoc · method Formatting.read(int)', 'Javadoc · interface Formatting.Reader', 'Javadoc · method Formatting.Reader.next()', 'OpenJML contract · class Formatting', 'OpenJML contract · method Formatting.read(int)']) expect(labels).toContain(label);
    expect(model.enums).toHaveLength(1);
    expect(model.enums[0].definition.qualifiedName).toBe('Formatting.Mode');
    expect(model.enums[0].constants.map((constant) => constant.definition.name)).toEqual(['READY', 'PAUSED', 'CLOSED']);
    expect(model.enums[0].constants.every((constant) => constant.docs.length === 1)).toBe(true);
    expect(model.codeSource.slice(model.enums[0].from, model.enums[0].to)).toContain('public enum Mode');
  });

  it('keeps behavior-bearing, undocumented, inline, or JML-bearing enums in source form', () => {
    const source = '/** Arguments. */\nenum Arguments { A(1); Arguments(int n) {} }\n/** Body. */\nenum Body { A { public void run() {} } }\nenum Plain { A, B }\nclass C { /** Inline. */ enum Inline { A } }\n/** Specification. */\nenum Specified { A;\n //@ invariant true;\n}';
    expect(parseJavaDocument(source, 'file:///Enums.java').enums).toEqual([]);
  });

  it('includes undocumented constants in a documented simple enum without inventing descriptions', () => {
    const model = parseJavaDocument('/** States. */\npublic enum State { FIRST, SECOND; }', 'file:///State.java');
    expect(model.enums[0].constants).toHaveLength(2);
    expect(model.enums[0].constants.every((constant) => constant.docs.length === 0)).toBe(true);
  });
});

describe('Javadoc first-sentence summaries', () => {
  it('separates a complete sentence without splitting inline literals, decimals, or common abbreviations', () => {
    for (const text of ['A short summary. More details.', 'Returns 1.5 units. More details.', 'Returns e.g. a default value. More details.', 'Computes Dr. Smith\'s value. More details.']) {
      expect(text.slice(0, summaryLength([{ text, literal: false }]))).toBe(text.slice(0, text.indexOf(' More details.')));
    }
    const parts = [{ text: 'Calls ', literal: false }, { text: 'Foo. bar()', literal: true }, { text: ' safely. More details.', literal: false }];
    expect(parts.map((part) => part.text).join('').slice(0, summaryLength(parts))).toBe('Calls Foo. bar() safely.');
  });

  it('handles summaries with no terminal punctuation, Unicode, and exclamations', () => {
    for (const [text, expected] of [['A summary without a period', 'A summary without a period'], ['Returns 🦊 safely. More.', 'Returns 🦊 safely.'], ['Ready! Details follow.', 'Ready!']]) {
      expect(text.slice(0, summaryLength([{ text, literal: false }]))).toBe(expected);
    }
  });
});

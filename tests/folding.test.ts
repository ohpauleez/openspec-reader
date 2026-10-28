import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { EditorState } from '@codemirror/state';
import { ensureSyntaxTree, foldable, codeFolding } from '@codemirror/language';
import { alloyFoldRanges } from '../src/folding';
import { languageExtension, structuralFolding } from '../src/code';

const samples: Record<string, string> = {
  alloy: '// first comment\n// second comment\nsig A {\n  children: set A\n}\npred valid {\n  all a: A | {\n    a not in a.^children\n  }\n}\n/* block\ncomment */',
  typescript: '// first comment\n// second comment\nclass Reader {\n  read(value: string): void {\n    for (const c of value) {\n      console.log(c);\n    }\n  }\n}\n/* block\ncomment */',
  javascript: '// first comment\n// second comment\nclass Reader {\n  read(value) {\n    for (const c of value) {\n      console.log(c);\n    }\n  }\n}\n/* block\ncomment */',
  java: '// first comment\n// second comment\nclass Reader {\n  void read(String value) {\n    for (int i = 0; i < 10; i++) {\n      System.out.println(i);\n    }\n  }\n}\n/* block\ncomment */',
  rust: '// first comment\n// second comment\nimpl Reader {\n  fn read(&self) {\n    for i in 0..10 {\n      println!("{}", i);\n    }\n  }\n}\n/* block\ncomment */',
};

describe('mandatory structural folding', () => {
  for (const [language, source] of Object.entries(samples)) {
    it(`folds nested structures and comments in ${language}`, () => {
      const state = EditorState.create({ doc: source, extensions: [languageExtension(language), structuralFolding(language, source), codeFolding()] });
      expect(ensureSyntaxTree(state, source.length, 1000)).not.toBeNull();
      const ranges = [];
      for (let i = 1; i <= state.doc.lines; i++) {
        const line = state.doc.line(i);
        const range = foldable(state, line.from, line.to);
        if (range) ranges.push(range);
      }
      expect(ranges.length).toBeGreaterThanOrEqual(5);
      for (const range of ranges) {
        expect(range.from).toBeLessThan(range.to);
        expect(range.to).toBeLessThanOrEqual(source.length);
      }
    });
  }
});

describe('Alloy lexical folding', () => {
  it('ignores braces inside quoted strings and comments', () => {
    const source = 'pred demo {\n  "escaped \\" }"\n  // }\n  -- }\n  /* } */\n  some univ\n}\n';
    const ranges = alloyFoldRanges(source);
    expect(ranges.some((range) => range.from === source.indexOf('{') + 1 && range.to === source.lastIndexOf('}'))).toBe(true);
  });

  it('accepts malformed or unfinished source without inventing closing delimiters', () => {
    expect(alloyFoldRanges('pred x {\n some univ')).toEqual([]);
    expect(alloyFoldRanges('"unterminated {\n}')).toEqual([]);
  });

  it('preserves valid nested fold intervals across generated comments and strings', () => {
    fc.assert(fc.property(fc.array(fc.constantFrom('// }\n', '-- {\n', '/* { } */\n', '"{ }"\n', 'some univ\n'), { maxLength: 60 }), (parts) => {
      const source = `pred outer {\n${parts.join('')}  {\n    some univ\n  }\n}`;
      const braces = alloyFoldRanges(source).filter((range) => source[range.to] === '}');
      expect(braces).toHaveLength(2);
      expect(braces[0].from).toBe(12);
      expect(braces[0].to).toBe(source.length - 1);
      expect(braces[1].from).toBeGreaterThan(braces[0].from);
      expect(braces[1].to).toBeLessThan(braces[0].to);
    }), { numRuns: 150 });
  });
});

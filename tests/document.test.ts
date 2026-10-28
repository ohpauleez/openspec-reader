import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocument, artifactKind } from '../src/document';
import { isMarkdownUrl, isTextDocument } from '../src/detection';

describe('Firefox detection boundary', () => {
  it('accepts encoded local Markdown paths and rejects non-documents', () => {
    for (const url of ['file:///tmp/a%20b.MD#heading', 'file:///tmp/a%2Emd', 'https://example.test/a.markdown?q=1']) expect(isMarkdownUrl(url)).toBe(true);
    for (const url of ['file:///tmp/folder.md/', 'about:config', 'https://example.test/a.md.exe', 'file:///tmp/%xx.md']) expect(isMarkdownUrl(url)).toBe(false);
    expect(isTextDocument('text/plain; charset=utf-8')).toBe(true);
    expect(isTextDocument('text/html')).toBe(false);
  });
});

describe('OpenSpec document model', () => {
  it('preserves lines and section ownership across front matter and non-heading code', () => {
    const source = '---\ntitle: Example\n---\n## Requirements\n### Requirement: Read [R-1]\nThe reader SHALL work.\n#### Scenario: Open [S-1]\n- **WHEN** opened\n- **THEN** shown\n```alloy\n### Requirement: Not a heading\nsig A {}\n```\n### Requirement: Other [R-2]\nOther prose.\n';
    const model = parseDocument(source, 'file:///openspec/specs/reader/spec.md');
    expect(model.title).toBe('Example');
    expect(model.sections).toHaveLength(4);
    expect(model.sections[1].line).toBe(5);
    expect(model.sections[1].endLine).toBe(14);
    expect(model.sections[2].parentId).toBe(model.sections[1].id);
    expect(model.fences[0].line).toBe(10);
    expect(model.diagnostics).toEqual([]);
    const html = model.parser.renderer.render(model.tokens, model.parser.options, {});
    expect(html).toContain('osr-kw-shall');
    expect(html).toContain('data-osr-fence="code-0"');
  });

  it('does not recognize requirements inside fences or highlight inline code', () => {
    const model = parseDocument('```md\n### Requirement: fake\n```\nText `SHALL` SHALL.', 'file:///notes.md');
    expect(model.isOpenSpec).toBe(false);
    expect(model.sections).toHaveLength(0);
    const spec = parseDocument('### Requirement: Real\n`SHALL` SHALL.', 'file:///notes.md');
    const html = spec.parser.renderer.render(spec.tokens, spec.parser.options, {});
    expect(html).toContain('<code>SHALL</code>');
    expect(html.match(/osr-kw-shall/g)).toHaveLength(1);
  });

  it('recognizes artifacts, delta headings, task progress, and explicit mode overrides', () => {
    expect(artifactKind('file:///p/openspec/changes/new/specs/a/spec.md')).toBe('Delta spec');
    for (const name of ['proposal', 'tasks', 'design']) expect(artifactKind(`file:///p/openspec/changes/new/${name}.md`)).not.toBe('Markdown');
    const model = parseDocument('## ADDED Requirements\n### Requirement: Work\nProse\n- [x] Done\n- [ ] Todo\n```md\n- [x] Not a task\n```', 'file:///p/spec.md');
    expect(model.sections[0].kind).toBe('delta');
    expect(model.tasks).toEqual({ done: 1, total: 2 });
    expect(parseDocument('### Requirement: Work', 'file:///p/spec.md', 'never').isOpenSpec).toBe(false);
  });

  it('reports duplicate IDs and malformed scenarios without interpreting code as steps', () => {
    const source = '#### Scenario: Orphan [X]\nNo steps\n### Requirement: Work [X]\nWorks\n#### Scenario: Bad\n```text\nWHEN x THEN y\n```';
    const model = parseDocument(source, 'file:///spec.md');
    expect(model.diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toMatch(/Duplicate identifier X/);
    expect(model.diagnostics.filter((diagnostic) => diagnostic.message.includes('WHEN'))).toHaveLength(2);
    expect(model.diagnostics.some((diagnostic) => diagnostic.message.includes('not nested'))).toBe(true);
  });

  it('makes every section ID unique, including slug-suffix collisions', () => {
    const model = parseDocument('# Foo\n# Foo\n# Foo-2\n# Foo\n# Foo-2', 'file:///notes.md');
    expect(new Set(model.sections.map((section) => section.id)).size).toBe(model.sections.length);
  });

  it('maintains heading interval and parent invariants for generated documents', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 1, max: 6 }), { maxLength: 80 }), (depths) => {
      const source = depths.map((depth, index) => `${'#'.repeat(depth)} Heading ${index}\nBody ${index}\n`).join('');
      const model = parseDocument(source, 'file:///notes.md');
      expect(model.sections).toHaveLength(depths.length);
      for (let i = 0; i < model.sections.length; i++) {
        const section = model.sections[i];
        // Independent interval oracle: first following heading of <= depth.
        const following = model.sections.slice(i + 1).find((candidate) => candidate.depth <= section.depth);
        expect(section.endLine).toBe(following?.line ?? source.split('\n').length + 1);
        if (section.parentId) {
          const parent = model.sections.find((candidate) => candidate.id === section.parentId)!;
          expect(parent.depth).toBeLessThan(section.depth);
          expect(parent.endLine).toBeGreaterThanOrEqual(section.endLine);
        }
      }
    }), { numRuns: 100 });
  });

  it('parses all supplied real-world OpenSpec specs with valid provenance', () => {
    const corpus = resolve('../spec-check/openspec/specs');
    const capabilities = readdirSync(corpus);
    let fenceCount = 0;
    for (const capability of capabilities) {
      const file = resolve(corpus, capability, 'spec.md');
      const source = readFileSync(file, 'utf8');
      const model = parseDocument(source, `file://${file}`);
      expect(model.isOpenSpec).toBe(true);
      expect(model.sections.some((section) => section.kind === 'requirement')).toBe(true);
      for (const fence of model.fences) expect(source.split('\n')[fence.line - 1]).toMatch(/^\s*```/);
      fenceCount += model.fences.length;
    }
    expect(fenceCount).toBeGreaterThan(30);
  });
});

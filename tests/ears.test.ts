import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseDocument } from '../src/document';

/** Render the actual document pipeline, retaining the source for preservation checks. */
function render(source: string, keywords = true): string {
  const model = parseDocument(source, 'file:///openspec/specs/reader/spec.md', 'auto', keywords);
  expect(model.source).toBe(source);
  return model.parser.renderer.render(model.tokens, model.parser.options, {});
}

describe('EARS clause layout', () => {
  it('starts the response on a new line and underlines only the complete system label', () => {
    const html = render('WHEN input arrives, THE spec-check tool SHALL render it.');
    expect(html.match(/osr-ears-break/g)).toHaveLength(1);
    expect(html).toContain('<br class="osr-ears-break"><span class="osr-keyword osr-kw-the">THE</span> <span class="osr-ears-subject">spec-check tool</span>');
    expect(html).toContain('tool</span> <span class="osr-keyword osr-kw-shall">SHALL</span> render it.');
  });

  it('formats all condition and scenario clause starters without separating the modal response', () => {
    const html = render('WHILE active, WHERE configured, IF input fails, THEN THE reader SHALL report AND preserve data BUT continue. GIVEN a retry WHEN ready THEN respond.');
    expect(html.match(/osr-ears-break/g)).toHaveLength(9);
    expect(html).toContain('reader</span> <span class="osr-keyword osr-kw-shall">SHALL</span>');
  });

  it('supports subjects split across emphasis, links, and inline code without invalid nesting', () => {
    const html = render('WHEN ready, **THE** [Markdown reader](./reader.md) tool SHALL render it.\n\nTHE `spec-check` tool MUST NOT alter source.');
    expect(html).toContain('<strong><br class="osr-ears-break"><span class="osr-keyword osr-kw-the">THE</span></strong> ');
    expect(html).not.toContain('osr-ears-subject">THE');
    expect(html).toContain('<a href="./reader.md"><span class="osr-ears-subject">Markdown reader</span></a>');
    expect(html).toContain('<span class="osr-ears-subject"><code>spec-check</code></span>');
    expect(html).toContain('tool</span> <span class="osr-keyword osr-kw-must">MUST NOT</span>');
  });

  it('does not underline THE inside a condition, require a preceding condition, or duplicate hard breaks', () => {
    const html = render('WHEN THE network fails, THE reader SHOULD retry.\n\nTHE reader MAY continue.\n\nWHEN ready,  \nTHE reader SHALL work.');
    expect(html).not.toMatch(/osr-ears-subject[^]*?network fails/);
    expect(html.match(/osr-ears-subject/g)).toHaveLength(3);
    expect(html.match(/osr-ears-break/g)).toHaveLength(1);
  });

  it('leaves headings, code, HTML, and ordinary prose in their existing layout', () => {
    const html = render('# WHEN ready THE reader SHALL render\n\nThe keywords WHEN and THEN are documented.\n\n`WHEN ready, THE code SHALL stay code.`\n\n<span>WHEN ready, THE reader SHALL work.</span>\n\n```text\nWHEN ready, THE code SHALL stay code.\n```');
    expect(html).not.toContain('osr-ears-break');
    expect(html).not.toContain('osr-ears-subject');
    expect(render('WHEN ready THE reader SHALL work.', false)).not.toContain('osr-ears-');
    const ordinary = parseDocument('WHEN ready THE reader SHALL work.', 'file:///notes.md');
    expect(ordinary.parser.renderer.render(ordinary.tokens, ordinary.parser.options, {})).not.toContain('osr-ears-');
  });

  it('preserves visible text and URLs across generated Markdown-formatted subjects', () => {
    fc.assert(fc.property(fc.array(fc.constantFrom('reader', 'tool', 'system', 'service'), { minLength: 1, maxLength: 6 }), (words) => {
      const source = `WHEN ready, **THE** [${words.join(' ')}](./target.md) SHALL render it.`;
      const model = parseDocument(source, 'file:///spec.md');
      const text = model.tokens.filter((token) => token.type === 'inline').flatMap((token) => token.children ?? [])
        .filter((token) => token.type === 'text' || token.type === 'code_inline').map((token) => token.content).join('');
      expect(text).toBe(`WHEN ready, THE ${words.join(' ')} SHALL render it.`);
      expect(model.source).toBe(source);
    }), { numRuns: 50 });
  });
});

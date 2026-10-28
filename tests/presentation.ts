import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import type { Locator, Page } from 'playwright';
import { launchExtension } from './firefox';

const session = await launchExtension();
try {
  const page = await session.context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(resolve('tests/fixtures/presentation.md')).href);
  await page.waitForSelector('html[data-osr-reader="ready"]');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.osr-diagram > [role="status"]')).every((node) => !node.textContent?.includes('loading')));
  const expected = [
    ['Local Markdown', 'OpenSpec structure', 'Foldable reader', 'parse source'],
    ['Awaiting input', 'Ready', 'input accepted'],
    ['MarkdownReader', 'String source', 'render()', 'LocalDocument', 'reads'],
    ['Markdown reader', 'Spec parser', 'Parse local document', 'Structured sections'],
    ['Markdown document', 'First line', 'Second line', 'read locally'],
  ];
  await checkLabels(page, expected);
  const diagram = page.locator('.osr-diagram').first();
  await checkZoom(page, diagram);
  await checkEars(page);
  await mkdir('test-results', { recursive: true });
  await page.locator('.osr-requirement').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/ears-layout.png' });
  await page.locator('.osr-diagram').nth(1).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/diagram-labels.png' });
  const oldIds = await page.locator('.osr-diagram svg').evaluateAll((nodes) => nodes.map((node) => node.id));
  await page.getByRole('button', { name: '◐ Theme', exact: true }).click();
  await page.waitForFunction((ids) => Array.from(document.querySelectorAll('.osr-diagram svg')).every((node, index) => node.id !== ids[index]), oldIds);
  await checkLabels(page, expected);
  await page.setViewportSize({ width: 1000, height: 900 });
  await diagram.scrollIntoViewIfNeeded();
  assert.ok(await diagram.locator('svg').evaluate((svg) => svg.getBoundingClientRect().width <= svg.closest('.osr-diagram-viewport')!.clientWidth));

  // Verify a real project diagram in addition to the focused label regressions.
  await page.goto(pathToFileURL(resolve('../spec-check/openspec/changes/archive/2026-10-21-support-opencode-v2/design.md')).href);
  await page.waitForSelector('.osr-diagram svg');
  await checkLabels(page, [['Resolve config and model selection', 'Bounded OpenCode version probe', 'Existing phase-schema validation']]);
  assert.deepEqual(errors, []);
  console.log('Firefox presentation checks passed: diagram labels, button/wheel zoom, pan, theme/resize, EARS line layout and underlining.');
} finally {
  await session.close();
}

/** Check rendered SVG text, not style text or merely the existence of an SVG container. */
async function checkLabels(page: Page, expected: readonly (readonly string[])[]): Promise<void> {
  for (let i = 0; i < expected.length; i++) {
    const diagram = page.locator('.osr-diagram').nth(i);
    assert.equal(await diagram.locator('> [role="status"]').textContent(), '');
    const labels = await diagram.locator('svg text').evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent?.replace(/\s+/g, ''), width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
    const rendered = labels.map((label) => label.text).join('');
    for (const label of expected[i]) assert.ok(rendered.includes(label.replace(/\s+/g, '')), `Diagram ${i} is missing label: ${label}`);
    assert.ok(labels.every((label) => !label.text || (label.width > 0 && label.height > 0)), `Diagram ${i} has invisible labels`);
    assert.equal(await diagram.locator('foreignObject, script, [onclick], [onerror]').count(), 0);
  }
}

/** Measure actual zoom geometry; exercise physical wheel/drag events and leave normal scrolling intact. */
async function checkZoom(page: Page, diagram: Locator): Promise<void> {
  const svg = diagram.locator('svg');
  const viewport = diagram.locator('.osr-diagram-viewport');
  const zoomIn = diagram.locator('button[title="Zoom in"]');
  const reset = diagram.getByRole('button', { name: 'Reset', exact: true });
  const initial = (await svg.boundingBox())!.width;
  await zoomIn.click();
  assert.ok(Math.abs((await svg.boundingBox())!.width / initial - 1.2) < 0.01);
  assert.equal(await diagram.locator('output').textContent(), '120%');
  await reset.click();
  assert.ok(Math.abs((await svg.boundingBox())!.width - initial) < 1);
  await diagram.locator('button[title="Zoom out"]').click();
  assert.ok((await svg.boundingBox())!.width < initial);
  await reset.click();
  await viewport.scrollIntoViewIfNeeded();
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + 40);
  await viewport.evaluate((node) => node.addEventListener('wheel', (event) => { (node as HTMLElement).dataset.testWheel = String(event.defaultPrevented); }, { once: true }));
  await page.mouse.wheel(0, 40);
  await page.waitForFunction(() => document.querySelector<HTMLElement>('.osr-diagram-viewport')?.dataset.testWheel === 'false');
  assert.equal(await diagram.locator('output').textContent(), '100%');
  await viewport.scrollIntoViewIfNeeded();
  const next = (await viewport.boundingBox())!;
  await page.mouse.move(next.x + 80, next.y + 40);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Shift');
  await page.waitForFunction(() => document.querySelector('output.osr-diagram-scale')?.textContent !== '100%');
  assert.ok((await svg.boundingBox())!.width > initial);
  for (let i = 0; i < 12; i++) await zoomIn.click();
  assert.equal(await diagram.locator('output').textContent(), '400%');
  const before = await viewport.evaluate((node) => node.scrollLeft);
  const pan = (await viewport.boundingBox())!;
  await page.mouse.move(pan.x + 150, pan.y + 40);
  await page.mouse.down();
  await page.mouse.move(pan.x + 80, pan.y + 40, { steps: 4 });
  await page.mouse.up();
  assert.ok(await viewport.evaluate((node) => node.scrollLeft) > before + 50);
  for (let i = 0; i < 18; i++) await diagram.locator('button[title="Zoom out"]').click();
  assert.equal(await diagram.locator('output').textContent(), '25%');
  await reset.click();
}

/** Inspect rendered line boxes and computed underlining, including Markdown-formatted subjects. */
async function checkEars(page: Page): Promise<void> {
  const paragraph = page.locator('.osr-requirement p').first();
  assert.equal(await paragraph.locator('.osr-ears-subject').textContent(), 'spec-check tool');
  const positions = await paragraph.evaluate((node) => {
    const subject = node.querySelector<HTMLElement>('.osr-ears-subject')!;
    const condition = node.querySelector<HTMLElement>('.osr-kw-when')!;
    const modal = node.querySelector<HTMLElement>('.osr-kw-shall')!;
    const the = node.querySelector<HTMLElement>('.osr-kw-the')!;
    return { subject: subject.getBoundingClientRect().top, condition: condition.getBoundingClientRect().top, modal: modal.getBoundingClientRect().top, underline: getComputedStyle(subject).textDecorationLine, theUnderlined: !!the.closest('.osr-ears-subject') || getComputedStyle(the).textDecorationLine.includes('underline') };
  });
  assert.ok(positions.subject > positions.condition + 10);
  assert.ok(Math.abs(positions.subject - positions.modal) < 5);
  assert.equal(positions.underline, 'underline');
  assert.equal(positions.theUnderlined, false);
  assert.equal(await page.locator('.osr-requirement p').nth(1).locator('br.osr-ears-break').count(), 6);
  assert.equal(await page.locator('.osr-requirement p').nth(2).locator('.osr-ears-subject').allTextContents().then((text) => text.join('')), 'Markdown reader');
  assert.equal(await page.locator('.osr-requirement p').nth(3).locator('.osr-ears-subject').allTextContents().then((text) => text.join('')), 'spec-check tool');
  assert.equal(await page.locator('code .osr-ears-subject, .osr-editor .osr-ears-break, summary .osr-ears-break').count(), 0);
}

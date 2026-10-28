import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
import { launchExtension } from './firefox';

const session = await launchExtension();
try {
  const page = await session.context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(pathToFileURL(resolve('tests/fixtures/Formatting.java')).href);
  await page.waitForSelector('.osr-javadoc-summary');
  const docs = page.locator('.osr-javadoc-note').first();
  assert.ok((await docs.locator('> summary').textContent())?.includes('class Formatting'));
  assert.equal(await docs.locator('.osr-javadoc-summary').first().textContent(), 'A reader that returns java.lang.String values.');
  assert.equal(await docs.locator('.osr-javadoc-summary strong').textContent(), 'reader');
  const layout = await docs.evaluate((node) => {
    const summary = node.querySelector<HTMLElement>('.osr-javadoc-summary')!;
    const prose = node.querySelector<HTMLElement>('.osr-javadoc-description p')!;
    return { summaryFont: parseFloat(getComputedStyle(summary).fontSize), proseFont: parseFloat(getComputedStyle(prose).fontSize), summaryBottom: summary.getBoundingClientRect().bottom, proseTop: prose.getBoundingClientRect().top, proseHeight: prose.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(prose).lineHeight), width: node.getBoundingClientRect().width, proseOverflow: prose.scrollWidth - prose.clientWidth };
  });
  assert.ok(layout.summaryFont > layout.proseFont);
  assert.ok(layout.proseTop >= layout.summaryBottom);
  assert.ok(layout.proseHeight > layout.lineHeight * 2);
  assert.ok(layout.proseOverflow <= 1);
  assert.ok(layout.width < 750);

  const scrollbar = page.getByRole('slider', { name: 'Scroll code horizontally', exact: true });
  await scrollbar.waitFor({ state: 'visible' });
  const bounds = (await scrollbar.boundingBox())!;
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 900);
  await scrollbar.click({ position: { x: bounds.width - 15, y: bounds.height / 2 } });
  await page.waitForFunction(() => (document.querySelector<HTMLElement>('.cm-scroller')?.scrollLeft ?? 0) > 100);
  // Wrapping and placement remain readable after horizontally panning the underlying code.
  const visible = await docs.boundingBox();
  assert.ok(visible && visible.x >= 300 && visible.x + visible.width <= 1100);
  await page.locator('.cm-scroller').evaluate((node) => { node.scrollLeft = 0; });
  await page.waitForFunction(() => document.querySelector<HTMLInputElement>('.osr-floating-code-scroll')?.value === '0');
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/java-formatting-firefox.png' });

  const outline = page.getByRole('navigation', { name: 'Java definitions' });
  await outline.getByRole('link', { name: 'enum Mode', exact: true }).click();
  await page.waitForSelector('.osr-enum-table');
  const table = page.getByRole('table', { name: 'Formatting.Mode constants' });
  assert.equal(await table.locator('tbody tr').count(), 3);
  assert.equal(await table.locator('.osr-javadoc-summary').count(), 0);
  const enumProse = await table.locator('.osr-javadoc-description p').first().evaluate((node) => ({ size: getComputedStyle(node).fontSize, weight: getComputedStyle(node).fontWeight }));
  assert.equal(enumProse.size, '14px');
  assert.equal(enumProse.weight, '400');
  assert.ok((await table.textContent())?.includes('Further details for the ready state'));
  assert.equal(await page.locator('.osr-enum-note').count(), 1);
  await outline.getByRole('link', { name: 'constant CLOSED', exact: true }).click();
  const row = table.locator('tbody tr').filter({ hasText: 'Fully closed.' });
  await page.waitForFunction(() => {
    const row = Array.from(document.querySelectorAll('.osr-enum-table tbody tr')).find((row) => row.querySelector('code')?.textContent === 'CLOSED');
    const box = row?.getBoundingClientRect();
    return !!box && box.top >= 50 && box.bottom <= innerHeight;
  });
  assert.ok((await row.textContent())?.includes('Fully closed.'));
  await page.screenshot({ path: 'test-results/java-enum-table-firefox.png' });
  await outline.getByRole('link', { name: 'field code', exact: true }).click();
  const enumField = page.locator('.osr-javadoc-note').filter({ hasText: 'Javadoc · field Formatting.Detailed.code' });
  await enumField.waitFor({ state: 'attached' });
  assert.equal(await enumField.locator('.osr-javadoc-summary').count(), 0);
  await page.getByRole('button', { name: 'Docs & contracts: rendered', exact: true }).click();
  await page.waitForSelector('.osr-enum-table', { state: 'detached' });
  await page.getByRole('button', { name: 'Docs & contracts: source', exact: true }).click();
  await page.waitForSelector('.osr-enum-table', { state: 'attached' });
  await outline.getByRole('link', { name: 'method read(int)', exact: true }).click();
  const contract = page.locator('.osr-jml-note').filter({ hasText: 'method Formatting.read(int)' });
  assert.ok(await contract.count() > 0);
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  assert.equal(await page.locator('.osr-raw').textContent(), await readFile('tests/fixtures/Formatting.java', 'utf8'));
  await page.evaluate(() => window.scrollTo(0, 0));
  const rawScroll = page.locator('.osr-raw .osr-floating-code-scroll');
  await rawScroll.waitFor({ state: 'visible' });
  await rawScroll.focus();
  await page.keyboard.press('End');
  await page.waitForFunction(() => (document.querySelector<HTMLElement>('.osr-raw')?.scrollLeft ?? 0) > 100);
  assert.deepEqual(errors, []);
  console.log('Firefox Java formatting checks passed: labeled headers, wrapped prose/summaries, enum tables/navigation, and floating horizontal scrolling.');
} finally {
  await session.close();
}

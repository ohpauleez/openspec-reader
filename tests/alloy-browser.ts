import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
import type { Page } from 'playwright';
import { launchExtension } from './firefox';

const session = await launchExtension();
try {
  const page = await session.context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const url = pathToFileURL(resolve('tests/fixtures/reader.als')).href;
  const source = await readFile('tests/fixtures/reader.als', 'utf8');
  await page.goto(url);
  await page.waitForSelector('html[data-osr-reader="ready"]');
  await page.waitForSelector('.osr-alloy-document .cm-editor');
  assert.equal(await page.title(), 'outline/reader');
  assert.equal(await page.locator('.osr-artifact').textContent(), 'Alloy model');
  assert.equal(await page.getByRole('navigation', { name: 'Alloy definitions' }).locator('a').count(), 15);
  assert.equal(await page.locator('.osr-outline').getByText(/Ghost/).count(), 0);
  assert.equal(await page.locator('.osr-document .osr-keyword, .osr-document h2').count(), 0);
  assert.equal(await page.locator('.cm-content').getAttribute('contenteditable'), 'false');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.cm-line span')).some((span) => span.textContent === 'module'));
  await page.getByRole('button', { name: 'Collapse definitions', exact: true }).click();
  assert.ok(await page.locator('.cm-foldPlaceholder').count() > 5);
  await page.getByRole('link', { name: 'pred Node.reachable', exact: true }).click();
  await page.waitForURL(/#pred-node-reachable$/);
  await assertVisibleLine(page, 'pred Node.reachable');

  // Searching inside a folded predicate reveals the original line in the full-file editor.
  await page.locator('.osr-search').fill('n in this.*next');
  await page.locator('.osr-search-results button').first().click();
  await assertVisibleLine(page, 'n in this.*next');
  await page.locator('.osr-search').fill('');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  assert.equal(await page.locator('.osr-raw').textContent(), source);
  await page.getByRole('link', { name: 'fun roots', exact: true }).click();
  await page.waitForURL(/#fun-roots$/);
  assert.equal(await page.locator('.osr-raw').isHidden(), true);
  await assertVisibleLine(page, 'fun roots');

  // Full-file fold offsets persist and a fragment can still reveal its definition after reload.
  await page.getByRole('button', { name: 'Collapse definitions', exact: true }).click();
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForSelector('html[data-osr-reader="ready"]');
  await page.waitForSelector('.cm-foldPlaceholder');
  await assertVisibleLine(page, 'fun roots');
  await page.getByRole('button', { name: 'Expand definitions', exact: true }).click();
  assert.equal(await page.locator('.cm-foldPlaceholder').count(), 0);
  await page.getByRole('button', { name: '◐ Theme', exact: true }).click();
  assert.equal(await page.locator('.osr-root').getAttribute('data-theme'), 'dark');

  // A real model exercises a long outline and multiline signature lists from the project corpus.
  const real = '../spec-check/openspec/changes/archive/2026-06-22-merge-delta-spec-logic/specs/merged-capability-analysis/alloy/merge.als';
  await page.goto(pathToFileURL(resolve(real)).href);
  await page.waitForSelector('html[data-osr-reader="ready"]');
  assert.equal(await page.title(), 'merge');
  assert.ok(await page.locator('.osr-outline-sig').count() > 20);
  const target = page.locator('.osr-outline-assert').last();
  const name = (await target.textContent())!;
  await target.click();
  await assertVisibleLine(page, name);
  await page.waitForFunction((needle) => Array.from(document.querySelectorAll('.cm-line')).some((line) => line.textContent?.includes(needle) && Array.from(line.querySelectorAll('span')).some((span) => span.textContent === 'assert')), name);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/alloy-reader-firefox.png' });
  assert.deepEqual(errors, []);
  console.log('Firefox Alloy file checks passed: .als URLs, definitions outline, navigation, full-file highlighting/folding/search, source view, state, and real model.');
} finally {
  await session.close();
}

/** Wait for CodeMirror virtualization and ensure outline/search really scrolls the target into view. */
async function assertVisibleLine(page: Page, text: string): Promise<void> {
  await page.waitForFunction((needle) => Array.from(document.querySelectorAll('.osr-alloy-document .cm-line')).some((line) => {
    const box = line.getBoundingClientRect();
    return line.textContent?.includes(needle) && box.top >= 50 && box.bottom <= innerHeight;
  }), text);
}

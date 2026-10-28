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
  page.on('console', (message) => { if (message.type() === 'error') console.error('Browser:', message.text()); });
  const javaUrl = pathToFileURL(resolve('tests/fixtures/Counter.java')).href;
  await page.goto(javaUrl);
  await page.waitForSelector('html[data-osr-reader="ready"]');
  try { await page.waitForSelector('.osr-javadoc-note'); }
  catch (error) { console.error('Java page:', await page.locator('body').textContent(), errors); throw error; }
  assert.equal(await page.title(), 'Counter.java');
  assert.equal(await page.locator('.osr-artifact').textContent(), 'Java source');
  const outline = page.getByRole('navigation', { name: 'Java definitions' });
  assert.equal(await outline.getByRole('link', { name: 'class Counter', exact: true }).count(), 1);
  assert.equal(await outline.getByRole('link', { name: 'method add(int)', exact: true }).count(), 1);
  assert.equal(await outline.getByRole('link', { name: 'method add(int, int)', exact: true }).count(), 1);
  assert.equal(await outline.getByText('Ghost').count(), 0);
  const docs = page.locator('.osr-javadoc-note').first();
  assert.equal(await docs.locator('.osr-javadoc-body strong', { hasText: 'counter' }).count(), 1);
  assert.equal(await docs.locator('.osr-javadoc-body li').count(), 2);
  assert.ok((await docs.locator('code').allTextContents()).includes('<Counter>'));
  assert.equal(await docs.locator('script, [onerror], [onclick]').count(), 0);
  assert.equal(await page.evaluate(() => 'osrJavaUnsafe' in window), false);
  await docs.locator('> summary').click();
  assert.equal(await docs.getAttribute('open'), null);
  await outline.locator('.osr-outline-javadoc').first().click();
  await page.waitForFunction(() => document.querySelector<HTMLDetailsElement>('.osr-javadoc-note')?.open);
  await docs.getByRole('link', { name: 'add', exact: true }).click();
  await assertVisibleLine(page, 'public int add(int amount)');
  await page.getByRole('button', { name: 'Collapse definitions', exact: true }).click();
  await page.waitForSelector('.cm-foldPlaceholder');
  await outline.locator('.osr-outline-contract').filter({ hasText: 'normal_behavior' }).first().click();
  await page.waitForSelector('.osr-jml-note');
  assert.ok(await page.locator('.osr-jml-token-keyword', { hasText: 'requires' }).count() > 0);

  await page.getByRole('button', { name: 'Expand definitions', exact: true }).click();
  await outline.getByRole('link', { name: 'method add(int)', exact: true }).click();
  await assertVisibleLine(page, 'public int add(int amount)');
  // Inspect the contract associated with add(), including old/result and exceptional cases.
  const contract = page.locator('.osr-jml-note').filter({ hasText: '\\old(value)' }).first();
  await contract.scrollIntoViewIfNeeded();
  assert.ok(await contract.locator('.osr-jml-case', { hasText: 'exceptional_behavior' }).count() > 0);
  assert.ok((await contract.locator('.osr-jml-token-special').allTextContents()).includes('\\result'));
  await contract.locator('summary', { hasText: 'Original source' }).click();
  assert.ok((await contract.locator('pre').textContent())?.includes('/*@ public normal_behavior'));

  const toggle = page.getByRole('button', { name: 'Docs & contracts: rendered', exact: true });
  await toggle.click();
  await page.waitForSelector('.osr-java-note', { state: 'detached' });
  await outline.getByRole('link', { name: 'method add(int)', exact: true }).click();
  await assertVisibleLine(page, 'public int add(int amount)');
  assert.ok(await page.locator('.osr-jml-source').count() > 0);
  await page.getByRole('button', { name: 'Docs & contracts: source', exact: true }).click();
  await page.waitForSelector('.osr-java-note');

  await page.getByRole('button', { name: 'Source', exact: true }).click();
  assert.equal(await page.locator('.osr-raw').textContent(), await readFile('tests/fixtures/Counter.java', 'utf8'));
  await outline.getByRole('link', { name: 'method size()', exact: true }).click();
  assert.equal(await page.locator('.osr-raw').isHidden(), true);
  await assertVisibleLine(page, 'int size()');
  await page.locator('.osr-search').fill('values[k] >= 0');
  await page.locator('.osr-search-results button').first().click();
  await page.waitForSelector('.osr-jml-note .osr-jml-expression');
  assert.ok(await page.locator('.osr-jml-note').filter({ hasText: '\\forall' }).count() > 0);
  await page.locator('.osr-search').fill('');
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/java-reader-firefox.png' });
  await page.getByRole('button', { name: 'Collapse definitions', exact: true }).click();
  assert.ok(await page.locator('.cm-foldPlaceholder').count() > 0);
  await page.evaluate(() => history.replaceState(null, '', location.href.split('#')[0]));
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForSelector('.cm-foldPlaceholder');
  await outline.getByRole('link', { name: 'method size()', exact: true }).click();
  await assertVisibleLine(page, 'int size()');
  await page.getByRole('button', { name: 'Expand definitions', exact: true }).click();
  await page.waitForSelector('.osr-javadoc-note');

  await page.goto(pathToFileURL(resolve('tests/fixtures/Counter.jml')).href);
  await page.waitForSelector('.osr-javadoc-note');
  assert.equal(await page.locator('.osr-artifact').textContent(), 'JML specification');
  await page.getByRole('link', { name: 'method size()', exact: true }).click();
  await assertVisibleLine(page, 'int size();');
  assert.equal(await page.locator('.cm-content').getAttribute('contenteditable'), 'false');
  await page.getByRole('button', { name: '◐ Theme', exact: true }).click();
  assert.equal(await page.locator('.osr-root').getAttribute('data-theme'), 'dark');
  await page.screenshot({ path: 'test-results/jml-reader-firefox.png' });

  // Real Javadoc/JML-rich source from the supplied steering reference.
  await page.goto(pathToFileURL(resolve('../.opencode/steering/java_reference/src/main/java/org/example/util/Box.java')).href);
  await page.waitForSelector('.osr-javadoc-note');
  assert.ok((await page.locator('.osr-javadoc-body').first().textContent())?.includes('lightweight tagged wrapper'));
  await page.getByRole('navigation', { name: 'Java definitions' }).getByRole('link', { name: 'method get()', exact: true }).click();
  await assertVisibleLine(page, ' T get()');
  assert.deepEqual(errors, []);
  console.log('Firefox Java/JML checks passed: file URLs, hierarchy/overloads, rendered Javadoc/contracts, source toggles, folding, navigation, search, themes, and real source.');
} finally {
  await session.close();
}

/** Wait for source virtualization and measured block widgets before asserting a navigation target. */
async function assertVisibleLine(page: Page, text: string): Promise<void> {
  await page.waitForFunction((needle) => Array.from(document.querySelectorAll('.osr-java-document .cm-line')).some((line) => {
    const box = line.getBoundingClientRect();
    return line.textContent?.includes(needle) && box.top >= 50 && box.bottom <= innerHeight;
  }), text);
}

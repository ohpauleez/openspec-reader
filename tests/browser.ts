import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { Page } from 'playwright';
import { launchExtension } from './firefox';

const session = await launchExtension();
try {
  const context = session.context;
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.error('Browser:', message.text()); });
  await checkHeadingTooltips(page);
  const url = pathToFileURL(resolve('tests/fixtures/reader.md')).href;
  await page.goto(url);
  try { await page.waitForSelector('html[data-osr-reader="ready"]'); }
  catch (error) {
    console.error(await page.evaluate(() => ({ type: document.contentType, html: document.documentElement.outerHTML.slice(0, 1200), url: location.href })));
    throw error;
  }
  assert.equal(await page.title(), 'Reader acceptance spec');
  assert.equal(await page.locator('.osr-requirement').count(), 3);
  assert.equal(await page.locator('.osr-scenario').count(), 1);
  assert.equal(await page.locator('.osr-kw-shall').count(), 3);
  assert.equal(await page.locator('.osr-document input[type="checkbox"]:disabled').count(), 2);
  assert.equal(await page.locator('.osr-document [onerror], .osr-document script, .osr-document a[href^="javascript:"]').count(), 0);
  assert.equal(await page.evaluate(() => 'osrUnsafe' in window), false);
  assert.equal(await page.locator('[data-osr-fence]').count(), 0);
  assert.equal(await page.locator('img[alt="sample"]').evaluate((img) => (img as HTMLImageElement).naturalWidth), 90);

  for (const language of ['alloy', 'typescript', 'javascript', 'java', 'rust']) {
    const code = page.locator('.osr-code').filter({ has: page.locator('.osr-code-language', { hasText: new RegExp(`^${language}$`) }) });
    await code.getByRole('button', { name: 'Fold code', exact: true }).click();
    assert.ok(await code.locator('.cm-foldPlaceholder').count() > 0, `${language} folds`);
    await code.getByRole('button', { name: 'Expand code', exact: true }).click();
    assert.equal(await code.locator('.cm-foldPlaceholder').count(), 0, `${language} expands`);
    assert.equal(await code.locator('.cm-content').getAttribute('contenteditable'), 'false');
  }
  try { await page.waitForSelector('.osr-diagram svg', { timeout: 30_000 }); }
  catch (error) { console.error('Diagram:', await page.locator('.osr-diagram').textContent(), await page.locator('.osr-diagram [role="status"]').getAttribute('title')); throw error; }
  assert.ok(await page.locator('.osr-diagram svg').textContent());
  await page.getByRole('button', { name: 'Collapse sections', exact: true }).click();
  assert.equal(await page.locator('.osr-section[open]').count(), 0);
  await page.locator('.osr-search').fill('hidden-evidence-needle');
  await page.locator('.osr-search-results button').first().click();
  assert.equal(await page.locator('.osr-evidence').getAttribute('open'), '');
  assert.equal(await page.locator('.osr-requirement').first().getAttribute('open'), '');
  await page.locator('.osr-search').fill('');
  assert.equal(await page.locator('.osr-search-results button').count(), 0);
  await page.getByRole('button', { name: 'Expand sections', exact: true }).click();
  await page.locator('.osr-outline-requirement').first().click();
  await page.waitForURL(/#requirement-read-structured-documents-read-1$/);

  // Persist both a document fold and an internal code fold, then reload the same file.
  const alloy = page.locator('.osr-code[data-code-id="code-0"]');
  await alloy.getByRole('button', { name: 'Fold code', exact: true }).click();
  await page.locator('.osr-evidence > summary').click();
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForSelector('html[data-osr-reader="ready"]');
  await alloy.scrollIntoViewIfNeeded();
  await page.waitForSelector('[data-code-id="code-0"] .cm-foldPlaceholder');
  assert.equal(await page.locator('.osr-evidence').getAttribute('open'), null);
  await page.getByRole('button', { name: '◐ Theme', exact: true }).click();
  assert.equal(await page.locator('.osr-root').getAttribute('data-theme'), 'dark');
  await page.waitForSelector('.osr-diagram svg');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  assert.ok((await page.locator('.osr-raw').textContent())?.includes('pred acyclic'));
  await page.getByRole('button', { name: 'Rendered', exact: true }).click();

  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/reader-firefox.png' });
  await page.getByRole('link', { name: 'relative navigation' }).click();
  await page.waitForSelector('html[data-osr-reader="ready"]');
  assert.equal(await page.title(), 'Linked local document');
  await page.goBack();
  await page.waitForSelector('html[data-osr-reader="ready"]');
  await page.locator('.osr-code[data-code-id="code-1"]').getByRole('button', { name: 'Fold code', exact: true }).click();
  await page.locator('.osr-search').fill('console.log(character)');
  await page.locator('.osr-search-results button').first().click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-code-id="code-1"] .cm-line')).some((line) => line.textContent?.includes('console.log(character)')));

  // Exercise a substantial real OpenSpec artifact, not only the acceptance fixture.
  await page.goto(pathToFileURL(resolve('../spec-check/openspec/specs/claim-graph-and-coverage/spec.md')).href);
  await page.waitForSelector('html[data-osr-reader="ready"]');
  assert.equal(await page.locator('.osr-requirement').count(), 8);
  await page.getByRole('button', { name: 'Fold code', exact: true }).first().click();
  assert.ok(await page.locator('.cm-foldPlaceholder').count() > 0);
  assert.deepEqual(errors, []);
  console.log('Firefox extension checks passed: file URLs, five languages, OpenSpec, Mermaid, search, state, relative resources, sanitization, and real corpus.');
} finally {
  await session.close();
}

/** Check original-file lines and tooltip boundaries in real Markdown and OpenSpec rendering. */
async function checkHeadingTooltips(page: Page): Promise<void> {
  const temp = await mkdtemp('/tmp/opencode/openspec-reader-headings-');
  const lines = [
    '---', 'title: Heading tooltips', '---', '',
    '# Heading *emphasis* `code` [H-1]', '', '',
    'Setext heading', '--------------', '', 'Nested prose.',
    '###### Deep heading', '',
  ];
  try {
    for (const [name, newline] of [['notes.md', '\n'], ['spec.md', '\r\n']]) {
      const file = resolve(temp, name);
      await writeFile(file, lines.join(newline));
      await page.goto(pathToFileURL(file).href);
      await page.waitForSelector('html[data-osr-reader="ready"]');
      const sections = page.locator('.osr-section');
      assert.equal(await sections.count(), 3);
      for (const [index, line] of [5, 8, 12].entries()) {
        const section = sections.nth(index);
        const text = section.locator(':scope > summary > :is(h1,h2,h3,h4,h5,h6) > .osr-heading-text');
        await text.hover();
        assert.equal(await text.getAttribute('title'), `Line: ${line}`);
        assert.equal(await text.evaluate((node) => node.parentElement!.closest('[title]') === null), true);
        const permalink = section.locator(':scope > summary > .osr-permalink');
        await permalink.hover();
        assert.equal(await permalink.getAttribute('title'), `Link to ${lines[line - 1].replace(/^#+ /, '')}`);
        assert.equal(await permalink.evaluate((node) => node.parentElement!.closest('[title]') === null), true);
      }
      const first = sections.first();
      assert.equal(await first.locator('.osr-heading-text em').textContent(), 'emphasis');
      assert.equal(await first.locator('.osr-heading-text code').textContent(), 'code');
      const badge = first.locator('.osr-id-label');
      assert.equal(await badge.evaluate((node) => node.closest('[title]') === null), true);
      await first.locator(':scope > summary > h1 > .osr-heading-text').click();
      assert.equal(await first.getAttribute('open'), null);
      await first.locator(':scope > summary > .osr-permalink').click();
      await page.waitForURL(/#heading-emphasis-code-h-1$/);
      assert.equal(await first.getAttribute('open'), '');
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

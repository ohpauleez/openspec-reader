import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchExtension } from './firefox';
import { timelineXml } from './fixtures/timeline';

const session = await launchExtension(); const target = '/alloy.html';
const evaluate = (script: string) => session.debug.evaluate(target, script);
const wait = (script: string) => session.debug.wait(target, script);
const click = (text: string) => evaluate(`const button=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)});if(!button)throw new Error('Missing button '+${JSON.stringify(text)});button.click();return true;`);
const choose = (label: string, value: string) => evaluate(`const input=document.querySelector('[aria-label="${label}"]');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
const fill = (label: string, value: string) => evaluate(`const input=document.querySelector('[aria-label="${label}"]');input.value=${JSON.stringify(value)};return true;`);
const key = (label: string) => JSON.stringify(['field', 'this/Actor', label]);
const upload = (label: string, text: string, filename = 'protocol.xml') => evaluate(`const input=document.querySelector('[aria-label="${label}"]');const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(text)}],${JSON.stringify(filename)}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
const assertInspectorClosed = async () => assert.deepEqual(await evaluate(`const pane=document.querySelector('.inspector');return {empty:pane.childNodes.length===0,display:getComputedStyle(pane).display,width:pane.getBoundingClientRect().width};`), { empty: true, display: 'none', width: 0 });

try {
  const reader = await session.context.newPage(); await reader.goto(pathToFileURL(resolve('tests/fixtures/temporal.als')).href);
  await reader.waitForSelector('html[data-osr-reader="ready"]'); await reader.getByRole('button', { name: 'Explore model', exact: true }).click();
  await wait(`return !!document.querySelector('input[aria-label="Import result / saved bundle"]');`);
  await upload('Import result / saved bundle', timelineXml());
  await wait(`return document.querySelector('[aria-label="Trace state"]').options.length===4;`);
  await click('Toggle sidebar'); await click('Timeline');
  await wait(`return document.querySelectorAll('.sequence-lane-header').length>=3;`);
  assert.equal(await evaluate(`return document.querySelectorAll('.sequence-scroll').length;`), 1);
  assert.ok(String(await evaluate(`return document.querySelector('.sequence-status').textContent;`)).includes('4 stored transitions'));
  assert.ok(String(await evaluate(`return document.querySelector('.sequence-rows').textContent;`)).includes('closing loop'));
  assert.equal(await evaluate(`const header=[...document.querySelectorAll('.sequence-lane-header')].find(h=>h.textContent==='Actor$0');const rect=header.getBoundingClientRect();return rect.width>100&&rect.height>30;`), true);
  // Initial-state inspection has no retained event selection, but still belongs exclusively to Timeline.
  await click('Initial state 0'); assert.equal(await evaluate(`return document.querySelector('.inspector h2').textContent;`), 'Initial state 0');
  await click('Open state in Graph'); await assertInspectorClosed();
  await click('Timeline'); await assertInspectorClosed();
  await choose('Timeline detail', 'changes');
  await evaluate(`const button=[...document.querySelectorAll('.sequence-explanation [data-event]')].find(b=>b.textContent.startsWith('Add pending'));button.click();return true;`);
  assert.equal(await evaluate(`return document.querySelector('[aria-label="Trace state"]').value;`), '1');
  assert.ok(String(await evaluate(`return document.querySelector('.inspector').textContent;`)).includes('[3] Resource$0'));
  assert.ok(String(await evaluate(`return document.querySelector('.inspector').textContent;`)).includes('Observed state-difference'));
  await click('Event source'); assert.ok(String(await evaluate(`return document.querySelector('.source-panel').textContent;`)).includes('protocol.als'));
  await assertInspectorClosed();
  await click('Timeline');
  assert.ok(String(await evaluate(`return document.querySelector('.inspector h2').textContent;`)).startsWith('Add pending'));
  // Restored event details must reclaim Timeline ownership on every round trip.
  for (const view of ['Graph', 'Table', 'Adjacent states']) {
    await click(view); await assertInspectorClosed();
    await click('Timeline'); assert.ok(String(await evaluate(`return document.querySelector('.inspector h2').textContent;`)).startsWith('Add pending'));
  }
  await click('Graph'); await assertInspectorClosed();
  await evaluate(`document.querySelector('.instance-graph [data-atom="Actor$0"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return true;`);
  await click('Timeline');
  assert.equal(await evaluate(`return document.querySelector('.inspector h2').textContent;`), 'Actor$0'); // A newer atom selection supersedes the older retained Timeline event.
  await evaluate(`const scroll=document.querySelector('.sequence-scroll');scroll.scrollTop=scroll.scrollHeight;scroll.dispatchEvent(new Event('scroll'));return true;`);
  await wait(`return [...document.querySelectorAll('.sequence-explanation button')].some(b=>b.textContent.startsWith('State 3 → 1'));`);
  await evaluate(`[...document.querySelectorAll('.sequence-explanation button')].find(b=>b.textContent.startsWith('State 3 → 1')).click();return true;`);
  await click('Table');
  await assertInspectorClosed();
  assert.equal(await evaluate(`return document.querySelector('table[aria-label="owner"] tr.removed')?.textContent.includes('Actor$1');`), true);
  await click('Timeline');
  await evaluate(`[...document.querySelectorAll('.sequence-lane-header')].find(b=>b.textContent==='Actor$1').click();return true;`);
  await click('Graph'); await assertInspectorClosed(); await click('Fit graph'); await assertInspectorClosed();
  await click('Timeline');
  await evaluate(`[...document.querySelectorAll('.sequence-lane-header')].find(b=>b.textContent==='Actor$1').click();return true;`);
  await click('Hide lane');
  assert.equal(await evaluate(`return [...document.querySelectorAll('.sequence-lane-header')].some(b=>b.textContent==='Actor$1');`), false);
  assert.equal(await evaluate(`return [...document.querySelectorAll('.sequence-row svg g[data-event]')].some(g=>g.querySelector('title')?.textContent.startsWith('Add pending')&&g.textContent.includes('hidden/non-lane'));`), true);
  await evaluate(`document.querySelector('.sequence-participants').open=true;return true;`); await click('Restore all lanes');
  assert.equal(await evaluate(`return [...document.querySelectorAll('.sequence-lane-header')].some(b=>b.textContent==='Actor$1');`), true);
  // Atom inspection is shared: it remains valid when opened from a Timeline participant menu.
  await click('Inspect participant');
  for (const view of ['Graph', 'Timeline', 'Graph', 'Timeline']) {
    await click(view);
    assert.equal(await evaluate(`return document.querySelector('.inspector h2').textContent;`), 'Actor$1');
    assert.equal(await evaluate(`return [...document.querySelectorAll('.inspector button')].some(b=>b.textContent==='Pin atom'||b.textContent==='Unpin atom');`), true);
    assert.equal(await evaluate(`return [...document.querySelectorAll('.inspector button')].some(b=>b.textContent==='Hide lane');`), false);
  }

  await fill('Timeline search', 'relation:pending change:added'); await click('Search timeline');
  await wait(`return document.querySelector('.sequence-results strong')?.textContent.includes('matches');`);
  assert.ok(String(await evaluate(`return document.querySelector('.sequence-results strong').textContent;`)).startsWith('3 matches'));
  await click('Next match'); assert.ok(String(await evaluate(`return document.querySelector('.inspector h2').textContent;`)).startsWith('Add pending'));
  await click('Clear timeline search');
  await evaluate(`document.querySelector('.sequence-mapping-editor').open=true;return true;`);
  await choose('Timeline mapping relation', key('phase')); await choose('Timeline mapping kind', 'state');
  await click('Preview interpretation'); assert.ok(String(await evaluate(`return document.querySelector('.sequence-mapping-editor output').textContent;`)).includes('columns:'));
  await click('Apply interpretation');
  assert.equal(await evaluate(`return [...document.querySelectorAll('.sequence-explanation [data-event]')].some(b=>b.textContent.includes('phase {"Idle"} → {"Busy"}'));`), true);
  await choose('Timeline mapping relation', key('messages')); await choose('Timeline mapping kind', 'communication'); await choose('Timeline mapping changes', 'added'); await choose('Timeline correlation column', '2'); await fill('Timeline label template', 'RPC {0} → {1} #{2}'); await click('Apply interpretation');
  assert.equal(await evaluate(`return [...document.querySelectorAll('.sequence-row svg g[data-event]')].some(g=>g.querySelector('title')?.textContent.startsWith('RPC ')&&g.querySelectorAll('path').length>0);`), true);
  await choose('Timeline mapping relation', key('pending')); await choose('Timeline mapping kind', 'communication'); await choose('Timeline mapping changes', 'added'); await fill('Timeline label template', 'Forward {0} → {1} ({2})'); await click('Apply interpretation');
  assert.equal(await evaluate(`return [...document.querySelectorAll('.sequence-row svg g[data-event]')].filter(g=>g.querySelector('title')?.textContent.startsWith('Forward ')).every(g=>g.querySelectorAll('circle').length===2);`), true); // Payload resource remains evidence, not a third communicating actor.
  await evaluate(`[...document.querySelectorAll('.sequence-mapping')].find(row=>row.textContent.includes('Forward {0}')).querySelector('button').click();return true;`);
  await choose('Timeline mapping relation', key('action')); await choose('Timeline mapping kind', 'recorded'); await choose('Timeline mapping changes', 'present'); await fill('Timeline label template', '{2}({0}, {1})'); await click('Apply interpretation');
  await evaluate(`[...document.querySelectorAll('.sequence-explanation [data-event]')].find(b=>b.textContent===${JSON.stringify('"Acquire"(Actor$0, Resource$0)')}).click();return true;`);
  assert.ok(String(await evaluate(`return document.querySelector('.inspector').textContent;`)).includes('does not prove a source predicate invocation'));
  await choose('Timeline pattern', 'request-response'); await click('Find timeline pattern');
  assert.ok(String(await evaluate(`return document.querySelector('.sequence-results strong').textContent;`)).includes('Correlated communication pair matches'));
  await evaluate(`document.querySelector('.sequence-pattern-editor').open=true;return true;`); await click('Add pattern event'); await click('Add pattern event');
  await evaluate(`for(const [label,value] of [['Pattern relation 1','messages'],['Pattern relation 2','messages'],['Pattern change (added/removed/present) 1','added'],['Pattern change (added/removed/present) 2','added'],['Actor variable 1','A'],['Peer variable 1','B'],['Actor variable 2','B'],['Peer variable 2','A']]){const input=document.querySelector('[aria-label="'+label+'"]');input.value=value;input.dispatchEvent(new Event('change'));}return true;`);
  await click('Find custom pattern'); assert.ok(String(await evaluate(`return document.querySelector('.sequence-results strong').textContent;`)).includes('custom pattern matches'));
  assert.equal(await evaluate(`return document.querySelectorAll('.sequence-pattern-node').length;`), 2);

  await upload('Compare Timeline file', timelineXml({ rename: true }), 'renamed.xml');
  await wait(`return document.querySelectorAll('.sequence-scroll').length===2;`);
  assert.ok(String(await evaluate(`return document.querySelector('.sequence-comparison-summary').textContent;`)).includes('tentative'));
  await choose('Timeline identity field', key('id')); await choose('Current participant identity', 'Resource$0'); await choose('Baseline participant identity', 'Resource$9'); await click('Confirm participant pair');
  assert.equal(await evaluate(`return [...document.querySelectorAll('.sequence-row[data-comparison]')].every(row=>row.dataset.comparison==='same');`), true);
  await fill('Timeline search', 'participant:Actor$9'); await click('Search timeline'); await wait(`return document.querySelector('.sequence-results strong')?.textContent.includes('across both executions');`);
  await click('Next match'); assert.ok(String(await evaluate(`return document.querySelector('.inspector').textContent;`)).includes('Baseline: renamed.xml'));
  await click('Clear timeline search');
  await click('Save snapshot'); await wait(`return document.querySelector('.workspace-status').textContent.includes('Snapshot saved');`);
  await click('Load saved executions'); await wait(`return !!document.querySelector('[aria-label="Execution grouping metric"]');`);
  assert.ok(String(await evaluate(`return document.querySelector('.sequence-discovered-patterns summary').textContent;`)).includes('structural motifs'));
  await evaluate(`const motifs=document.querySelector('.sequence-discovered-patterns');motifs.open=true;motifs.querySelector('button').click();return true;`);
  assert.ok(String(await evaluate(`return document.querySelector('.inspector h2').textContent;`)).includes('structural pattern'));
  await click('Graph'); await assertInspectorClosed(); await click('Timeline');
  await choose('Execution grouping metric', 'divergence'); assert.ok(String(await evaluate(`return document.querySelector('.sequence-library').textContent;`)).includes('No structural divergence'));
  await click('Close Timeline comparison'); assert.equal(await evaluate(`return document.querySelectorAll('.sequence-scroll').length;`), 1);
  await evaluate(`const select=document.querySelector('[aria-label="Saved explorations"]');select.selectedIndex=1;select.dispatchEvent(new Event('change'));return true;`);
  await wait(`return document.querySelector('.layout-status').textContent==='Saved layout restored.';`);
  assert.equal(await evaluate(`return document.querySelectorAll('.sequence-scroll').length;`), 2);
  assert.equal(await evaluate(`return document.querySelectorAll('.sequence-mapping').length;`), 3);
  assert.equal(await evaluate(`return [...document.querySelectorAll('.sequence-row[data-comparison]')].every(row=>row.dataset.comparison==='same');`), true);
  await click('Close Timeline comparison');
  // Capture the real generated Blob before the download transport, without altering Timeline rendering/export code.
  await evaluate(`const original=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download==='alloy-timeline.svg'){fetch(this.href).then(r=>r.text()).then(text=>window.timelineSvg=text);return;}return original.call(this);};return true;`);
  await click('Export SVG'); await wait(`return typeof window.timelineSvg==='string';`);
  assert.equal(await evaluate(`return window.timelineSvg.includes('Timeline visible window');`), true);
  assert.equal(await evaluate(`return window.timelineSvg.includes('Actor$0');`), true);
  assert.equal(await evaluate(`return !new DOMParser().parseFromString(window.timelineSvg,'image/svg+xml').querySelector('parsererror');`), true);

  await upload('Import result / saved bundle', timelineXml({ static: true })); await wait(`return document.querySelector('.sequence-status').textContent.includes('Single captured snapshot');`);
  assert.equal(await evaluate(`return document.querySelectorAll('.sequence-row:not(.sequence-initial)').length;`), 0);
  await upload('Import result / saved bundle', timelineXml({ selfLoop: true })); await wait(`return document.querySelector('.sequence-status').textContent.includes('1 stored transitions');`);
  assert.ok(String(await evaluate(`return document.querySelector('.sequence-rows').textContent;`)).includes('State 0 → 0'));
  assert.ok(String(await evaluate(`return document.querySelector('.sequence-rows').textContent;`)).includes('Stutter'));
  const localXml = (count: number) => `<alloy>${Array.from({ length: count }, (_, i) => `<instance command="Run local" filename="local.als" bitwidth="4" tracelength="${count}" looplength="2"><sig ID="u" label="univ" builtin="yes"/><sig ID="a" label="this/Actor" parentID="u" var="yes"><atom label="Actor$0"/>${i % 2 ? '' : '<atom label="Actor$1"/>'}</sig></instance>`).join('')}</alloy>`;
  await upload('Import result / saved bundle', localXml(4));
  await wait(`return document.querySelector('.sequence-rows').textContent.includes('3 local steps');`);
  await evaluate(`[...document.querySelectorAll('.sequence-explanation button')].find(b=>b.textContent.includes('3 local steps')).click();return true;`);
  assert.equal(await evaluate(`return document.querySelector('[aria-label="Trace state"]').value;`), '1'); // First actual step, never a fabricated 0→3 transition.
  await evaluate(`[...document.querySelectorAll('.sequence-explanation button')].find(b=>b.textContent.startsWith('Expand ')).click();return true;`);
  assert.equal(await evaluate(`return [...document.querySelectorAll('.sequence-explanation button')].some(b=>b.textContent==='State 0 → 1');`), true);
  await upload('Import result / saved bundle', localXml(500)); await wait(`return document.querySelector('[aria-label="Trace state"]').options.length===500;`);
  await evaluate(`const collapse=document.querySelector('[aria-label="Collapse local events"]');collapse.checked=false;collapse.dispatchEvent(new Event('change'));return true;`);
  assert.equal(await evaluate(`return document.querySelectorAll('.sequence-row').length<30;`), true);
  await evaluate(`const scroll=document.querySelector('.sequence-scroll');scroll.scrollTop=scroll.scrollHeight;scroll.dispatchEvent(new Event('scroll'));return true;`);
  await wait(`return [...document.querySelectorAll('.sequence-explanation button')].some(b=>b.textContent.startsWith('State 499 → 498'));`);
  assert.equal(await evaluate(`return document.querySelectorAll('.sequence-row').length<30;`), true);
  const wideXml = `<alloy>${[false, true].map((active) => `<instance command="Run many" filename="many.als" bitwidth="4" tracelength="2" looplength="2"><sig ID="u" label="univ" builtin="yes"/><sig ID="a" label="this/Actor" parentID="u">${Array.from({ length: 1000 }, (_, i) => `<atom label="Actor$${i}"/>`).join('')}</sig><sig ID="active" label="this/Active" var="yes">${active ? Array.from({ length: 1000 }, (_, i) => `<atom label="Actor$${i}"/>`).join('') : ''}<type ID="a"/></sig></instance>`).join('')}</alloy>`;
  await upload('Import result / saved bundle', wideXml); await wait(`return document.querySelector('.sequence-status').textContent.includes('1000 participant lanes');`);
  assert.equal(await evaluate(`return document.querySelectorAll('.sequence-lane-header').length<25;`), true);
  await evaluate(`const scroll=document.querySelector('.sequence-scroll');scroll.scrollLeft=scroll.scrollWidth;scroll.dispatchEvent(new Event('scroll'));return true;`);
  await wait(`return [...document.querySelectorAll('.sequence-lane-header')].some(b=>b.textContent==='Actor$999');`);
  console.log('Firefox Timeline checks passed: inspector ownership/cleanup and atom preservation, real lane geometry, atomic deltas, n-ary evidence, source/state synchronization, closing loop selection, hiding/reveal, timed search worker, mappings, pattern builder, confirmed comparison identities, library motifs/grouping, saved comparison evidence, SVG and static/self-loop semantics.');
} catch (error) {
  console.error('Timeline status:', await evaluate(`return document.querySelector('.sequence-status')?.textContent;`));
  console.error('Timeline rows:', await evaluate(`return [...document.querySelectorAll('.sequence-explanation')].map(e=>e.textContent);`));
  throw error;
} finally { await session.close(); }

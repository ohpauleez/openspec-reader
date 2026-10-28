import { button, element } from '../dom';
import type { TimelineModel } from './timeline-model';
import { timelineDeclarationKey, timelineLabel } from './timeline-model';
import type { TimelineMapping, TimelinePatternNode, TimelineProfile } from './timeline-profile';

/** Small labelled controls follow the surrounding explorer's accessible form conventions. */
export function timelineField(label: string, input: HTMLElement): HTMLLabelElement {
  input.setAttribute('aria-label', label); const field = element('label', 'field'); field.append(document.createTextNode(label), input); return field;
}
/** Native selects carry stable declaration/atom values; model labels are plain text. */
export function timelineSelect(label: string, values: readonly [string, string][], value = ''): HTMLSelectElement {
  const select = element('select'); select.setAttribute('aria-label', label);
  for (const [key, text] of values) { const option = element('option', '', text); option.value = key; select.append(option); }
  select.value = value; return select;
}

/** Participant grouping/visibility is separate from shared declaration and focus filters. */
export function timelineParticipants(model: TimelineModel, settings: TimelineProfile, change: (patch: Partial<TimelineProfile>) => void): HTMLElement {
  const root = element('details', 'sequence-participants'); root.append(element('summary', '', `Participants · ${model.atoms.length} observed atoms · ${settings.hiddenLanes.length} explicitly hidden`));
  const signatures = [...new Set(model.signatures.values())].sort();
  const list = element('div', 'sequence-participant-list');
  for (const signature of signatures) {
    const row = element('div', 'sequence-participant-row'); const included = element('input'); included.type = 'checkbox'; included.checked = !settings.participantSignatures.length || settings.participantSignatures.includes(signature);
    included.addEventListener('change', () => { const selected = settings.participantSignatures.length ? [...settings.participantSignatures] : signatures; const next = included.checked ? [...new Set([...selected, signature])] : selected.filter((s) => s !== signature); change({ participantSignatures: next.length ? next : ['(none)'] }); });
    const label = element('label'); label.append(included, document.createTextNode(signature)); row.append(label);
    row.append(button(settings.collapsedSignatures.includes(signature) ? 'Expand lanes' : 'Group lanes', () => change({ collapsedSignatures: settings.collapsedSignatures.includes(signature) ? settings.collapsedSignatures.filter((s) => s !== signature) : [...settings.collapsedSignatures, signature] })));
    list.append(row);
  }
  const atom = timelineSelect('Timeline participant', [['', 'Choose any observed atom…'], ...model.atoms.slice(0, 20_000).map((a): [string, string] => [a, a])]);
  root.append(list, atom, button('Hide participant', () => { if (atom.value) change({ hiddenLanes: [...new Set([...settings.hiddenLanes, atom.value])] }); }), button('Reveal participant', () => { if (atom.value) change({ hiddenLanes: settings.hiddenLanes.filter((a) => a !== atom.value), participantSignatures: [], showIdle: true }); }), button('Restore all lanes', () => change({ hiddenLanes: [], participantSignatures: [], focusedLanes: [], collapsedSignatures: [], showIdle: true })), element('p', 'muted', 'Drag lane headers to reorder. Click a header to hide, focus, reveal partners, inspect, or group its signature. Hidden/non-lane arguments remain in event evidence.'));
  return root;
}

/** Interpretations reference recorded relations and tuple columns; applying a template never proves which predicate executed. */
export function timelineMappingEditor(model: TimelineModel, settings: TimelineProfile, change: (patch: Partial<TimelineProfile>) => void): HTMLElement {
  const root = element('details', 'sequence-mapping-editor'); root.append(element('summary', '', `Timeline interpretation · ${settings.mappings.length} mappings`));
  const declarations = model.trace.declarations.filter((d) => d.kind !== 'sig');
  const relation = timelineSelect('Timeline mapping relation', declarations.map((d) => [timelineDeclarationKey(model.trace, d), `${model.trace.declarations.find((s) => s.id === d.parent)?.label ?? ''}.${d.label}`])); if (relation.options.length) relation.selectedIndex = 0;
  const kind = timelineSelect('Timeline mapping kind', [['action', 'Mapped action label'], ['recorded', 'Recorded action/event value'], ['state', 'State-field summary'], ['communication', 'Explicit communication roles']], 'action');
  const when = timelineSelect('Timeline mapping changes', [['both', 'Added and removed tuples'], ['added', 'Added tuples'], ['removed', 'Removed tuples'], ['present', 'Captured relation values']], 'both');
  const state = timelineSelect('Timeline recorded value state', [['after', 'Target state'], ['before', 'Source state']], 'after');
  const columns = [['-1', 'No column / global event'], ...Array.from({ length: 20 }, (_, i): [string, string] => [String(i), `Column ${i + 1} · {${i}}`])] as [string, string][];
  const source = timelineSelect('Timeline actor column', columns, '0'); const target = timelineSelect('Timeline peer/state column', columns, '1'); const correlation = timelineSelect('Timeline correlation column', columns, '-1');
  const template = element('input'); template.placeholder = 'Acquire({0}, {1})'; const declaration = element('input'); declaration.placeholder = 'Optional qualified predicate/field source link';
  const status = element('output', 'status');
  const read = (): TimelineMapping => ({ declaration: relation.value, kind: kind.value as TimelineMapping['kind'], change: when.value as TimelineMapping['change'], state: state.value as TimelineMapping['state'], source: Number(source.value), target: Number(target.value), correlation: Number(correlation.value), template: template.value.slice(0, 500), sourceDeclaration: declaration.value.slice(0, 8192) });
  const preview = () => {
    const rule = read(); const d = declarations.find((d) => timelineDeclarationKey(model.trace, d) === rule.declaration);
    const tuple = d ? model.trace.states.find((s) => s.relations[d.id]?.length)?.relations[d.id][0] : undefined;
    status.textContent = tuple ? `${timelineLabel(rule.template, tuple, d!.label)} · columns: ${tuple.map((a, i) => `${i + 1}=${a}`).join(', ')} · ${rule.kind === 'recorded' ? 'recorded value, not an inferred predicate execution' : 'user-configured interpretation'}` : 'No captured tuple available for preview.';
  };
  root.append(element('p', 'muted', 'Without mappings, Timeline explains observed membership/tuple changes. Configure state fields, action labels, or sender/receiver roles below. Templates use zero-based {0}, {1}, … placeholders; column controls are numbered for readability. Recorded values and mapped labels remain distinguished from observed changes.'));
  const fields = element('div', 'sequence-editor-fields'); fields.append(timelineField('Timeline mapping relation', relation), timelineField('Timeline mapping kind', kind), timelineField('Timeline mapping changes', when), timelineField('Timeline recorded value state', state), timelineField('Timeline actor column', source), timelineField('Timeline peer/state column', target), timelineField('Timeline correlation column', correlation), timelineField('Timeline label template', template), timelineField('Timeline source declaration', declaration)); root.append(fields, button('Preview interpretation', preview), button('Apply interpretation', () => { const rule = read(); if (!rule.declaration) return; change({ mappings: [...settings.mappings.filter((m) => m.declaration !== rule.declaration), rule].slice(0, 100) }); }), status);
  for (const mapping of settings.mappings) { const row = element('div', 'sequence-mapping'); row.append(element('code', '', `${mapping.kind} · ${mapping.template || mapping.declaration} · ${mapping.change}`), button('Remove mapping', () => change({ mappings: settings.mappings.filter((m) => m !== mapping) }))); root.append(row); }
  return root;
}

/** A visual ordered-node pattern builder uses participant variables; arrows mean later transitions, not causality. */
export function timelinePatternEditor(settings: TimelineProfile, change: (patch: Partial<TimelineProfile>) => void, run: () => void): HTMLElement {
  const root = element('details', 'sequence-pattern-editor'); root.append(element('summary', '', 'Custom graphical pattern'));
  root.append(element('p', 'muted', 'Build 1–4 event nodes. Events match strictly later transitions; arrows do not assert happened-before. Reuse variables such as A/B to require the same participant. For communications, actor/peer use mapped sender/receiver; other events use original argument positions. Blank fields match anything.'));
  const canvas = element('div', 'sequence-pattern-canvas');
  settings.pattern.forEach((node, index) => {
    const card = element('section', 'sequence-pattern-node'); card.draggable = true; card.dataset.index = String(index);
    card.addEventListener('dragstart', (event) => event.dataTransfer?.setData('text/plain', String(index))); card.addEventListener('dragover', (event) => event.preventDefault());
    card.addEventListener('drop', (event) => { event.preventDefault(); const from = Number(event.dataTransfer?.getData('text/plain')); if (!Number.isInteger(from) || from < 0 || from >= settings.pattern.length) return; const nodes = [...settings.pattern]; const [moved] = nodes.splice(from, 1); nodes.splice(index, 0, moved); change({ pattern: nodes }); });
    card.append(element('strong', '', `Event ${index + 1}`));
    const edit = (field: keyof TimelinePatternNode, label: string) => { const input = element('input'); input.value = node[field]; input.addEventListener('change', () => change({ pattern: settings.pattern.map((n, i) => i === index ? { ...n, [field]: input.value.slice(0, 200) } : n) })); return timelineField(`${label} ${index + 1}`, input); };
    card.append(edit('declaration', 'Pattern relation'), edit('action', 'Pattern action/text'), edit('change', 'Pattern change (added/removed/present)'), edit('actor', 'Actor variable'), edit('peer', 'Peer variable'), button(`Remove event ${index + 1}`, () => change({ pattern: settings.pattern.filter((_, i) => i !== index) })));
    if (index) canvas.append(element('span', 'sequence-pattern-arrow', '→ later')); canvas.append(card);
  });
  const add = button('Add pattern event', () => change({ pattern: [...settings.pattern, { declaration: '', action: '', change: '', actor: '', peer: '' }].slice(0, 4) })); add.disabled = settings.pattern.length >= 4;
  root.append(canvas, add, button('Find custom pattern', run)); return root;
}

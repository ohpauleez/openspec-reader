import { button, element } from '../dom';
import { tupleDifference, tupleKey, visibleTuples } from './model';
import type { AlloyTrace, TraceState, ViewProfile } from './types';

/** Relation tables always keep every original column, even when the graph uses an atom projection. */
export function relationTables(trace: AlloyTrace, state: TraceState, before: TraceState | null, profile: ViewProfile, inspect: (atom: string) => void): HTMLElement {
  const root = element('div', 'relation-tables');
  for (const declaration of trace.declarations.filter((declaration) => declaration.kind !== 'sig' && !profile.hiddenRelations.includes(declaration.id))) {
    const current = visibleTuples(state, declaration.id, profile);
    const previous = before ? visibleTuples(before, declaration.id, profile) : [];
    const delta = tupleDifference(previous, current);
    const added = new Set(delta.added.map(tupleKey));
    const rows = [...current.map((tuple) => ({ tuple, change: before && added.has(tupleKey(tuple)) ? 'added' : '' })), ...delta.removed.map((tuple) => ({ tuple, change: 'removed' }))];
    const section = element('details', 'relation'); section.open = true;
    const variability = declaration.kind === 'skolem' ? declaration.mutable ? 'varying derived/skolem' : 'derived/skolem' : declaration.mutable ? 'mutable' : 'static';
    section.append(element('summary', '', `${declaration.label} · ${variability} · ${current.length} tuples${before ? ` · +${delta.added.length} / −${delta.removed.length}` : ''}`));
    const table = element('table'); table.setAttribute('aria-label', declaration.label);
    const header = element('tr');
    const arity = declaration.types[0]?.length ?? rows[0]?.tuple.length ?? 1;
    header.append(element('th', '', 'Δ'));
    for (let column = 0; column < arity; column++) {
      const labels = Array.from(new Set(declaration.types.map((type) => trace.declarations.find((entry) => entry.id === type[column])?.label ?? `Column ${column + 1}`)));
      header.append(element('th', '', labels.join(' / ') || `Column ${column + 1}`));
    }
    const head = element('thead'); head.append(header); const body = element('tbody'); table.append(head, body);
    let page = 0;
    const status = element('span', 'muted');
    const draw = (): void => {
      body.replaceChildren();
      for (const { tuple, change } of rows.slice(page * 200, (page + 1) * 200)) {
        const row = element('tr', change); row.append(element('td', '', change === 'added' ? '+' : change === 'removed' ? '−' : ''));
        for (const atom of tuple) { const cell = element('td'); cell.append(button(atom, () => inspect(atom))); row.append(cell); }
        body.append(row);
      }
      status.textContent = rows.length ? `${page * 200 + 1}–${Math.min((page + 1) * 200, rows.length)} of ${rows.length} displayed rows` : 'Empty relation';
    };
    const controls = element('div', 'table-controls');
    controls.append(button('Previous rows', () => { if (page) { page--; draw(); } }), status, button('Next rows', () => { if ((page + 1) * 200 < rows.length) { page++; draw(); } }));
    section.append(table, controls); root.append(section); draw();
  }
  if (!root.childElementCount) root.append(element('p', 'muted', 'No relations selected.'));
  return root;
}

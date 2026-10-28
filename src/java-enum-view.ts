import { WidgetType } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import type { JavaEnum } from './java-enums';
import type { JavaDocument } from './java-document';
import { renderJavadoc } from './javadoc';
import { element } from './dom';

/** A simple enum table keeps source offsets and links intact while presenting constant documentation. */
export class EnumWidget extends WidgetType {
  constructor(readonly enumeration: JavaEnum, readonly model: JavaDocument) { super(); }
  /** Reuse unchanged table DOM and its disclosures across unrelated editor transactions. */
  eq(other: EnumWidget): boolean { return this.enumeration === other.enumeration; }
  /** Table links and disclosures are ordinary read-only browser controls. */
  ignoreEvent(): boolean { return true; }
  /** Render a labeled table with safe documentation, source provenance, and original enum text. */
  toDOM(view: EditorView): HTMLElement {
    const root = element('details', 'osr-java-note osr-enum-note');
    root.open = true;
    root.dataset.javaEnum = String(this.enumeration.from);
    const heading = element('summary', 'osr-java-note-heading');
    heading.append(element('strong', '', `enum ${this.enumeration.definition.qualifiedName}`), element('span', 'osr-muted', `${this.enumeration.constants.length} constants · L${this.enumeration.definition.line}`));
    const table = element('table', 'osr-enum-table');
    table.setAttribute('aria-label', `${this.enumeration.definition.qualifiedName} constants`);
    const head = element('thead');
    const labels = element('tr');
    for (const label of ['Constant', 'Documentation']) { const cell = element('th', '', label); cell.scope = 'col'; labels.append(cell); }
    head.append(labels);
    const body = element('tbody');
    for (const constant of this.enumeration.constants) {
      const row = element('tr');
      row.dataset.javaDefinition = constant.definition.id;
      const name = element('th');
      name.scope = 'row';
      const link = element('a');
      link.href = `#${constant.definition.id}`;
      link.append(element('code', '', constant.definition.name));
      name.append(link, element('div', 'osr-muted', `L${constant.definition.line}`));
      const documentation = element('td');
      for (const block of constant.docs) documentation.append(renderJavadoc(block, this.model.definitions, { summary: false }));
      if (!constant.docs.length) documentation.append(element('span', 'osr-muted', '—'));
      row.append(name, documentation);
      body.append(row);
    }
    table.append(head, body);
    const source = element('details', 'osr-java-note-source');
    source.append(element('summary', '', 'Original source'), element('pre', '', this.model.codeSource.slice(this.enumeration.from, this.enumeration.to)));
    source.addEventListener('toggle', () => view.requestMeasure());
    root.addEventListener('toggle', () => view.requestMeasure());
    root.append(heading, table, source);
    return root;
  }
}

import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension, Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { foldedRanges } from '@codemirror/language';
import type { JavaDocument } from './java-document';
import { javaBlockLabel, javadocUsesSummary } from './java-document';
import type { JavaBlock } from './java-comments';
import { jmlClauses, jmlTokens } from './jml';
import { renderJavadoc } from './javadoc';
import { element } from './dom';
import { EnumWidget } from './java-enum-view';

const presentationEffect = StateEffect.define<boolean>();
interface PresentationState { readonly rendered: boolean; readonly decorations: DecorationSet }
export interface JavaPresentation { readonly extension: Extension; toggle(view: EditorView): boolean; reveal(view: EditorView, offset: number): void }

/** Render JML as clause rows without ever treating specification expressions as HTML. */
function renderJml(body: string): HTMLElement {
  const root = element('div', 'osr-jml-clauses');
  for (const clause of jmlClauses(body)) {
    const row = element('div', `osr-jml-clause${clause.expression ? '' : ' osr-jml-case'}`);
    if (clause.keyword) row.append(element('strong', 'osr-jml-token-keyword', clause.keyword));
    if (clause.expression) {
      const expression = element('code', 'osr-jml-expression');
      for (const token of jmlTokens(clause.expression)) expression.append(element('span', `osr-jml-token-${token.style}`, token.text));
      row.append(expression);
    }
    root.append(row);
  }
  return root;
}

/** A rendered comment is a view-only replacement; the complete original text stays in EditorState. */
class CommentWidget extends WidgetType {
  constructor(readonly block: JavaBlock, readonly model: JavaDocument) { super(); }
  /** Stable block identity avoids rebuilding widgets when folds elsewhere change. */
  eq(other: CommentWidget): boolean { return this.block === other.block; }
  /** Widget controls retain ordinary browser interaction; CodeMirror must not edit their contents. */
  ignoreEvent(): boolean { return true; }
  /** Build a sanitized documentation card and an independently expandable original-source view. */
  toDOM(view: EditorView): HTMLElement {
    const root = element('details', `osr-java-note osr-${this.block.kind}-note`);
    root.open = true;
    root.dataset.javaBlock = String(this.block.from);
    const label = javaBlockLabel(this.model, this.block);
    root.setAttribute('aria-label', `${label} at line ${this.block.line}`);
    const heading = element('summary', 'osr-java-note-heading');
    heading.append(element('strong', '', label), element('span', 'osr-muted', `L${this.block.line}`));
    const source = element('details', 'osr-java-note-source');
    source.append(element('summary', '', 'Original source'), element('pre', '', this.block.raw));
    source.addEventListener('toggle', () => view.requestMeasure());
    root.addEventListener('toggle', () => view.requestMeasure());
    root.append(heading, this.block.kind === 'javadoc' ? renderJavadoc(this.block, this.model.definitions, { summary: javadocUsesSummary(this.model, this.block) }) : renderJml(this.block.body), source);
    return root;
  }
}

/** Style original annotation text, including inline modifiers that cannot become block widgets. */
function sourceDecorations(block: JavaBlock, state: EditorState, ranges: Range<Decoration>[]): void {
  const className = block.kind === 'jml' ? 'osr-jml-source' : 'osr-javadoc-source';
  ranges.push(Decoration.mark({ class: className }).range(block.from, block.to));
  if (block.kind === 'jml') {
    let offset = block.from;
    for (const token of jmlTokens(block.raw)) {
      if (token.style !== 'plain') ranges.push(Decoration.mark({ class: `osr-jml-token-${token.style}` }).range(offset, offset + token.text.length));
      offset += token.text.length;
    }
  }
  if (block.fullLine) for (let line = state.doc.lineAt(block.from).number; line <= state.doc.lineAt(block.to).number; line++) {
    ranges.push(Decoration.line({ class: `${className}-line` }).range(state.doc.line(line).from));
  }
}

/** Fold replacements take precedence over rich cards, preventing intersecting block replacements. */
function decorations(model: JavaDocument, state: EditorState, rendered: boolean): DecorationSet {
  if (state.doc.length !== model.codeSource.length) return Decoration.none;
  const folded: { from: number; to: number }[] = [];
  foldedRanges(state).between(0, state.doc.length, (from, to) => { folded.push({ from, to }); });
  const ranges: Range<Decoration>[] = [];
  const enums = rendered ? model.enums.filter((enumeration) => !folded.some((range) => range.from < enumeration.to && enumeration.from < range.to)) : [];
  for (const enumeration of enums) ranges.push(Decoration.replace({ widget: new EnumWidget(enumeration, model), block: true }).range(enumeration.from, enumeration.to));
  for (const block of model.blocks) {
    if (enums.some((enumeration) => enumeration.from <= block.from && block.to <= enumeration.to)) continue;
    const overlaps = folded.some((range) => range.from < block.to && block.from < range.to);
    if (rendered && block.fullLine && !overlaps) {
      const from = state.doc.lineAt(block.from).from;
      const to = state.doc.lineAt(block.to).to;
      ranges.push(Decoration.replace({ widget: new CommentWidget(block, model), block: true }).range(from, to));
    } else sourceDecorations(block, state, ranges);
  }
  return Decoration.set(ranges, true);
}

/** Switch between readable cards and annotated original source without changing source offsets. */
export function javaPresentation(model: JavaDocument): JavaPresentation {
  const field = StateField.define<PresentationState>({
    create: (state) => ({ rendered: true, decorations: decorations(model, state, true) }),
    update: (previous, transaction) => {
      let rendered = previous.rendered;
      for (const effect of transaction.effects) if (effect.is(presentationEffect)) rendered = effect.value;
      if (!transaction.docChanged && !transaction.effects.length) return previous;
      return { rendered, decorations: decorations(model, transaction.state, rendered) };
    },
    provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
  });
  return { extension: field, toggle: (view) => {
    const rendered = !view.state.field(field).rendered;
    view.dispatch({ effects: presentationEffect.of(rendered) });
    return rendered;
  }, reveal: (view, offset) => {
    const block = model.blocks.find((block) => block.from <= offset && offset < block.to);
    const enumeration = model.enums.find((enumeration) => enumeration.from <= offset && offset < enumeration.to);
    if (!block && !enumeration) return;
    requestAnimationFrame(() => {
      if (!view.dom.isConnected) return;
      const card = enumeration ? view.dom.querySelector<HTMLDetailsElement>(`[data-java-enum="${enumeration.from}"]`) : view.dom.querySelector<HTMLDetailsElement>(`[data-java-block="${block!.from}"]`);
      if (!card) return;
      card.open = true;
      view.requestMeasure();
      const constant = enumeration?.constants.find((constant) => (constant.definition.from <= offset && offset <= constant.definition.rangeTo) || constant.docs.some((doc) => doc.from <= offset && offset < doc.to));
      const row = constant ? card.querySelector<HTMLElement>(`[data-java-definition="${constant.definition.id}"]`) : null;
      (row ?? card).scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  } };
}

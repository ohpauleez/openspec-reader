import { button, element } from '../dom';
import type { AlloyDeclaration } from './types';
import { SignatureColors, SUPPORT_COLORS } from './colors';

/** Use the same resolved fill and provenance in the graph legend and editable sidebar. */
export function signatureColorLegend(colors: SignatureColors, change?: (declaration: AlloyDeclaration, color: string | null) => void): HTMLElement {
  const root = element('section', 'signature-color-legend'); root.setAttribute('aria-label', 'Signature color legend');
  root.append(element(change ? 'h2' : 'h3', '', 'Signature colors'));
  for (const declaration of colors.signatures.filter((d) => !d.builtin)) {
    const resolved = colors.signature(declaration); const explicit = colors.explicit(declaration); const membershipOnly = resolved.source === 'membership';
    const row = element('div', 'signature-color-row'); row.dataset.signature = declaration.label; row.dataset.colorSource = resolved.source;
    const swatch = element('span', `signature-color-swatch${membershipOnly ? ' membership-only' : ''}`); swatch.setAttribute('aria-hidden', 'true');
    if (!membershipOnly) { swatch.style.backgroundColor = resolved.fill; row.dataset.fill = resolved.fill; }
    const description = element('span', 'signature-color-description'); description.append(element('strong', '', declaration.label));
    const parent = declaration.parent ? colors.trace.declarations.find((d) => d.id === declaration.parent && !d.builtin) : null;
    const bases = declaration.subset ? declaration.types.flat().map((id) => colors.trace.declarations.find((d) => d.id === id)?.label).filter(Boolean).join(' + ') : '';
    const hierarchy = parent ? `extends ${parent.label}` : bases ? `in ${bases}` : 'top-level';
    const source = membershipOnly ? 'membership annotation · type fill unchanged' : resolved.source === 'inherited' ? `inherited from ${resolved.declaration?.label}` : resolved.source === 'custom' ? declaration.subset ? 'custom membership override' : 'custom' : 'automatic';
    description.append(element('small', '', `${hierarchy} · ${source}${colors.profile.hiddenSignatures.includes(declaration.id) ? ' · hidden' : ''}`));
    row.append(swatch, description);
    if (!membershipOnly) {
      const variants = element('span', 'signature-color-variants');
      for (const role of colors.roles(declaration)) {
        const variant = colors.signature(declaration, role); const item = element('span', 'signature-color-variant'); item.dataset.traceRole = role; item.dataset.fill = variant.fill;
        const chip = element('span', 'signature-color-swatch'); chip.style.backgroundColor = variant.fill; chip.setAttribute('aria-hidden', 'true');
        item.append(chip, document.createTextNode(role === 'involved' ? 'Trace-relevant' : 'Unrelated static context')); variants.append(item);
      }
      row.append(variants);
    }
    if (change) {
      if (!membershipOnly) {
        const input = element('input'); input.type = 'color'; input.value = resolved.fill; input.setAttribute('aria-label', `Color for ${declaration.label}`);
        input.addEventListener('change', () => change(declaration, input.value)); row.append(input);
      } else row.append(button(`Customize ${declaration.label} color`, () => change(declaration, SUPPORT_COLORS.unknown)));
      const reset = button('Reset', () => change(declaration, null)); reset.setAttribute('aria-label', `Reset color for ${declaration.label}`); reset.title = 'Remove this override; inherit an explicit ancestor color or use the automatic default.'; reset.disabled = !explicit; row.append(reset);
    }
    root.append(row);
  }
  const supporting = element('div', 'support-color-legend');
  for (const [label, fill] of [['Int / seq/Int', SUPPORT_COLORS.integer], ['String', SUPPORT_COLORS.string], ['Tuple junction', SUPPORT_COLORS.junction], ['Unclassified', SUPPORT_COLORS.unknown]]) {
    const item = element('span', 'support-color-item'); const swatch = element('span', 'signature-color-swatch'); swatch.style.backgroundColor = fill; swatch.setAttribute('aria-hidden', 'true'); item.append(swatch, document.createTextNode(label)); supporting.append(item);
  }
  root.append(supporting, element('p', 'muted', 'Soft reds, blues, yellows, greens, peach, mint and lavender identify trace-relevant atoms: changing atoms plus one hop of supporting relationships. Static or single-state results use soft colors throughout. Brighter purple/magenta variants identify static context outside that relevance set. Each type has distinct variants, stable during playback and filtering. Explicit color overrides apply to both variants. Subsets annotate membership unless customized; explicit ancestor colors are inherited. Multiple membership overrides resolve by qualified name. +/− and borders identify individual temporal changes.'));
  return root;
}

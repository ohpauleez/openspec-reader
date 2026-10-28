import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { colorForeground, customizeSignatureColor, prepareSignatureColors, SignatureColors, signatureColorKey, SUPPORT_COLORS } from '../src/alloy-viz/colors';
import { DEFAULT_PROFILE, validateProfile } from '../src/alloy-viz/types';
import type { AlloyDeclaration, AlloyTrace, TraceState } from '../src/alloy-viz/types';
import { readExploration } from '../src/alloy-viz/save';
import { readFileSync } from 'node:fs';
import { parseAlloyXml } from '../src/alloy-viz/xml';
import { DOMParser } from '@xmldom/xmldom';
import { focusXml } from './fixtures/focus';

/** Small typed model whose parent, subtype, subset and unrelated signatures have independent identities. */
function fixture(count = 16): AlloyTrace {
  const sig = (id: string, label: string, parent: string | null = 'univ', subset = false): AlloyDeclaration => ({ id, label, parent, subset, types: [], kind: 'sig', mutable: false, builtin: false });
  const declarations = [sig('univ', 'univ', null), sig('int', 'Int'), sig('string', 'String'), sig('entity', 'this/Entity'), sig('customer', 'this/Customer', 'entity'), sig('vip', 'this/VIP', 'customer'), { ...sig('selected', 'this/Selected', null, true), types: [['customer']], mutable: true }, sig('also', 'this/AlsoSelected', null, true), ...Array.from({ length: count }, (_, i) => sig(`type-${i}`, `domain/Type${i}`))];
  for (const d of declarations.slice(0, 3)) Object.assign(d, { builtin: true });
  const state: TraceState = { signatures: { univ: ['Customer$0', 'Customer$1', 'Customer$2', 'VIP$0'], entity: ['Customer$0', 'Customer$1', 'Customer$2', 'VIP$0'], customer: ['Customer$0', 'Customer$1', 'Customer$2', 'VIP$0'], vip: ['VIP$0'], selected: [], also: [], int: ['0'], string: ['"hello"'] }, relations: {} };
  const selected: TraceState = { ...state, signatures: { ...state.signatures, selected: ['Customer$0'], also: ['Customer$0'] } };
  return { declarations, states: [state, selected], sources: [], filename: 'domain.als', command: 'Run example', bitwidth: 4, integerRange: { min: -8, max: 7, enumerated: true }, buildDate: '', minTrace: 1, maxTrace: 2, loopStart: 0 };
}

describe('Semantic signature colors', () => {
  it('does not wrap its palette at the maximum supported declaration count', () => {
    const trace = fixture(1992); expect(trace.declarations).toHaveLength(2000);
    const theme = prepareSignatureColors(trace, DEFAULT_PROFILE).colorTheme!;
    expect(Object.keys(theme.automatic)).toHaveLength(1995); expect(Object.keys(theme.context!)).toHaveLength(1995);
    expect(new Set([...Object.values(theme.automatic), ...Object.values(theme.context!)]).size).toBe(3990);
  });
  it('distinguishes every primitive signature, including subtypes and empty signatures, beyond a finite palette', () => {
    const trace = fixture(64); const profile = prepareSignatureColors(trace, DEFAULT_PROFILE); const colors = new SignatureColors(trace, profile);
    const fills = colors.signatures.filter((d) => !d.builtin && !d.subset).map((d) => colors.signature(d).fill);
    expect(new Set(fills).size).toBe(fills.length);
    expect(fills.some((c) => Object.values(SUPPORT_COLORS).includes(c))).toBe(false);
    expect(colors.atom('Customer$0', trace.states[0]).fill).not.toBe(colors.atom('Customer$1', trace.states[0]).fill);
    expect(colors.atom('Customer$1', trace.states[0]).fill).toBe(colors.atom('Customer$2', trace.states[0]).fill);
    expect(colors.atom('VIP$0', trace.states[0]).fill).not.toBe(colors.atom('Customer$0', trace.states[0]).fill);
    expect(colors.atom('Customer$0', trace.states[1]).fill).toBe(colors.atom('Customer$0', trace.states[0]).fill);
    expect(colors.signature(trace.declarations.find((d) => d.id === 'selected')!).source).toBe('membership');
    expect(colors.atom('0', trace.states[0]).fill).toBe(SUPPORT_COLORS.integer);
    expect(colors.atom('"hello"', trace.states[0]).fill).toBe(SUPPORT_COLORS.string);
  });

  it('is independent of declaration/field order and XML IDs, and retains existing assignments when a type is added', () => {
    const trace = fixture(); const initial = prepareSignatureColors(trace, DEFAULT_PROFILE);
    const reordered = { ...trace, declarations: [...trace.declarations].reverse().map((d) => ({ ...d, id: `new-${d.id}`, parent: d.parent ? `new-${d.parent}` : null })) };
    const fresh = prepareSignatureColors(reordered, DEFAULT_PROFILE);
    expect(fresh.colorTheme!.automatic).toEqual(initial.colorTheme!.automatic);
    const larger = fixture(17); const retained = prepareSignatureColors(larger, initial);
    for (const [key, fill] of Object.entries(initial.colorTheme!.automatic)) expect(retained.colorTheme!.automatic[key]).toBe(fill);
    expect(new Set(Object.values(retained.colorTheme!.automatic)).size).toBe(Object.keys(retained.colorTheme!.automatic).length);
    const hidden = prepareSignatureColors(trace, { ...initial, hiddenSignatures: ['customer'], projection: 'Customer$0' });
    expect(hidden.colorTheme).toEqual(initial.colorTheme);
  });

  it('resolves explicit subset, primitive, and inherited overrides in deterministic order and resets correctly', () => {
    const trace = fixture(); const parent = trace.declarations.find((d) => d.id === 'entity')!; const child = trace.declarations.find((d) => d.id === 'customer')!;
    const subset = trace.declarations.find((d) => d.id === 'selected')!; const also = trace.declarations.find((d) => d.id === 'also')!;
    let profile = customizeSignatureColor(trace, DEFAULT_PROFILE, parent, '#123456');
    expect(new SignatureColors(trace, profile).signature(child)).toMatchObject({ fill: '#123456', source: 'inherited' });
    profile = customizeSignatureColor(trace, profile, child, '#ffffff');
    expect(new SignatureColors(trace, profile).atom('Customer$0', trace.states[0]).fill).toBe('#ffffff');
    profile = customizeSignatureColor(trace, profile, subset, '#000000');
    expect(new SignatureColors(trace, profile).atom('Customer$0', trace.states[0]).fill).toBe('#ffffff');
    expect(new SignatureColors(trace, profile).atom('Customer$0', trace.states[1]).fill).toBe('#000000');
    profile = customizeSignatureColor(trace, profile, also, '#ff00ff');
    expect(new SignatureColors({ ...trace, declarations: [...trace.declarations].reverse() }, profile).atom('Customer$0', trace.states[1]).fill).toBe('#ff00ff');
    profile = customizeSignatureColor(trace, profile, child, null);
    expect(new SignatureColors(trace, profile).atom('Customer$1', trace.states[0]).fill).toBe('#123456');
    profile = customizeSignatureColor(trace, profile, parent, null);
    expect(new SignatureColors(trace, profile).atom('Customer$1', trace.states[0]).source).toBe('automatic');
  });

  it('avoids newly customized colors while preserving all nonconflicting defaults; duplicate custom overrides remain intentional', () => {
    const trace = fixture(); const profile = prepareSignatureColors(trace, DEFAULT_PROFILE); const [a, b, c] = trace.declarations.filter((d) => d.id.startsWith('type-'));
    const stolen = profile.colorTheme!.automatic[signatureColorKey(b)]; const oldC = profile.colorTheme!.automatic[signatureColorKey(c)];
    const customized = customizeSignatureColor(trace, profile, a, stolen);
    expect(new SignatureColors(trace, customized).signature(a).fill).toBe(stolen);
    expect(new SignatureColors(trace, customized).signature(b).fill).not.toBe(stolen);
    expect(customized.colorTheme!.automatic[signatureColorKey(c)]).toBe(oldC);
    const shared = customizeSignatureColor(trace, customized, b, stolen);
    expect(new SignatureColors(trace, shared).signature(b).fill).toBe(new SignatureColors(trace, shared).signature(a).fill);
  });

  it('migrates legacy overrides once and round-trips the registry through validated saved bundles', () => {
    const trace = fixture(); const profile = prepareSignatureColors(trace, { ...DEFAULT_PROFILE, colors: { customer: '#ABCDEF' } });
    expect(profile.colors).toEqual({});
    expect(new SignatureColors(trace, profile).atom('Customer$0', trace.states[0]).fill).toBe('#abcdef');
    const saved = readExploration(JSON.stringify({ format: 'openspec-alloy-viz', version: 1, label: 'Colors', xml: readFileSync('tests/fixtures/temporal.xml', 'utf8'), launch: null, profile, selected: [], result: {} }));
    expect(saved.profile.colorTheme).toEqual(profile.colorTheme);
    expect(prepareSignatureColors(trace, saved.profile).colorTheme).toEqual(profile.colorTheme);
    const newModel = prepareSignatureColors(trace, profile, 'different-model.als');
    expect(newModel.colorTheme!.overrides).toEqual({});
    expect(validateProfile({ colorTheme: { model: 'x', automatic: { a: 'url(javascript:bad)', b: '#FFFFFF' }, overrides: { a: '#000000' } } }).colorTheme).toEqual({ model: 'x', automatic: { b: '#ffffff' }, overrides: { a: '#000000' } });
  });

  it('retains the previous type fill for removed atoms and changes it only for genuine primitive-type changes', () => {
    const trace = fixture(); const colors = new SignatureColors(trace, DEFAULT_PROFILE);
    const missing: TraceState = { signatures: {}, relations: {} };
    expect(colors.atom('Customer$0', missing, trace.states[0]).fill).toBe(colors.atom('Customer$0', trace.states[0]).fill);
    const changed: TraceState = { signatures: { univ: ['Customer$0'], 'type-0': ['Customer$0'] }, relations: {} };
    expect(colors.atom('Customer$0', changed, trace.states[0]).fill).not.toBe(colors.atom('Customer$0', trace.states[0]).fill);
  });

  it('provides normal-text AA contrast for arbitrary valid fills', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 0xffffff }), (rgb) => {
      const hex = `#${rgb.toString(16).padStart(6, '0')}`; const foreground = colorForeground(hex);
      const channels = [16, 8, 0].map((shift) => { const c = ((rgb >> shift) & 255) / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
      const l = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
      expect(foreground === '#000000' ? (l + .05) / .05 : 1.05 / (l + .05)).toBeGreaterThanOrEqual(4.5);
    }));
  });

  it('uses soft primary/lavender colors for changing and supporting atoms, reserving vivid colors for unrelated static context', () => {
    const trace = parseAlloyXml(focusXml(), (text) => new DOMParser().parseFromString(text, 'application/xml'));
    const profile = prepareSignatureColors(trace, DEFAULT_PROFILE); const colors = new SignatureColors(trace, profile);
    expect(colors.atom('A0', trace.states[0]).role).toBe('involved');
    for (const atom of ['C0', 'H0', 'R0']) expect(colors.atom(atom, trace.states[0])).toEqual(colors.atom('A0', trace.states[0]));
    expect(colors.atom('C1', trace.states[0]).role).toBe('uninvolved'); // One hop, not recursive closure.
    expect(colors.atom('Quiet0', trace.states[0]).role).toBe('uninvolved');
    expect(colors.atom('A0', trace.states[0]).fill).not.toBe(colors.atom('Quiet0', trace.states[0]).fill);
    expect(colors.atom('Quiet0', trace.states[0]).fill).toBe(colors.atom('Quiet1', trace.states[0]).fill);
    const hsl = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min;
      const hue = delta === 0 ? 0 : max === r ? 60 * (((g - b) / delta + 6) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
      return { hue, lightness: (max + min) / 2 };
    };
    for (const fill of Object.values(profile.colorTheme!.automatic)) {
      const { hue, lightness } = hsl(fill); expect(lightness).toBeGreaterThanOrEqual(.73);
      expect(hue <= 82 || hue >= 348 || (hue >= 93 && hue <= 162) || (hue >= 188 && hue <= 237) || (hue >= 243 && hue <= 287)).toBe(true);
    }
    for (const fill of Object.values(profile.colorTheme!.context!)) { const { hue, lightness } = hsl(fill); expect(hue).toBeGreaterThanOrEqual(243); expect(hue).toBeLessThanOrEqual(337); expect(lightness).toBeLessThanOrEqual(.70); }
    expect(colors.atom('A0', trace.states[2]).fill).toBe(colors.atom('A0', trace.states[0]).fill);
    const filtered = new SignatureColors(trace, { ...profile, hiddenRelations: ['active'], focus: { mode: 'step', context: 'none', alwaysShow: ['Quiet0'], ignoredRelations: ['active'], hideContextEdges: true } });
    expect(filtered.atom('A0', trace.states[2])).toEqual(colors.atom('A0', trace.states[0]));
    expect(filtered.atom('C0', trace.states[2])).toEqual(colors.atom('C0', trace.states[0]));
    expect(filtered.atom('Quiet0', trace.states[2]).role).toBe('uninvolved');
  });

  it('upgrades old automatic palettes once, preserves manual overrides, and validates both role palettes in saved profiles', () => {
    const trace = fixture(); const old = { ...DEFAULT_PROFILE, colorTheme: { model: trace.filename, palette: 'trace-role-v1' as const, automatic: { [signatureColorKey(trace.declarations[4])]: '#ff00ff' }, context: { [signatureColorKey(trace.declarations[4])]: '#ff00ff' }, overrides: { [signatureColorKey(trace.declarations[5])]: '#123456' } } };
    const profile = prepareSignatureColors(trace, old);
    expect(profile.colorTheme!.palette).toBe('trace-role-v2');
    expect(profile.colorTheme!.automatic[signatureColorKey(trace.declarations[4])]).not.toBe('#ff00ff');
    expect(new SignatureColors(trace, profile).signature(trace.declarations[5]).fill).toBe('#123456');
    expect(prepareSignatureColors(trace, profile).colorTheme).toEqual(profile.colorTheme);
    expect(validateProfile(JSON.parse(JSON.stringify(profile))).colorTheme).toEqual(profile.colorTheme);
    expect(validateProfile({ colorTheme: { model: 'x', palette: 'trace-role-v2', context: { bad: 'url(javascript:bad)', good: '#AA00BB' } } }).colorTheme!.context).toEqual({ good: '#aa00bb' });
  });

  it('gives every domain atom in static and single-state results a soft fill, including fixed participants and subtype atoms', () => {
    const original = fixture();
    for (const states of [[original.states[0]], [original.states[0], original.states[0]]]) {
      const trace = { ...original, states, loopStart: 0 }; const colors = new SignatureColors(trace, DEFAULT_PROFILE);
      for (const atom of ['Customer$0', 'Customer$1', 'Customer$2', 'VIP$0']) {
        const resolved = colors.atom(atom, states[0]); expect(resolved.role).toBe('involved');
        const rgb = [1, 3, 5].map((i) => parseInt(resolved.fill.slice(i, i + 2), 16) / 255);
        expect((Math.max(...rgb) + Math.min(...rgb)) / 2).toBeGreaterThanOrEqual(.73);
      }
      expect(colors.signature(trace.declarations.find((d) => d.id === 'type-0')!).role).toBe('involved');
    }
  });

  it('includes pastel lavender alongside soft primary colors in the automatic palette', () => {
    const colors = Object.values(prepareSignatureColors(fixture(), DEFAULT_PROFILE).colorTheme!.automatic);
    expect(colors).toContain('#d1c3e8');
    expect(colors).toContain('#acc9ec'); expect(colors).toContain('#eab3b3');
    expect(colors).toContain('#f0dda0'); expect(colors).toContain('#b7d7ad');
  });
});

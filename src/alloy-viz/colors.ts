import type { AlloyDeclaration, AlloyTrace, SignatureColorTheme, TraceState, ViewProfile } from './types';
import { primarySignature } from './graph-layout';
import { traceRelevantAtoms } from './focus';

// Trace-relevant atoms (including fixed support) use soft colors; unrelated static context uses vivid exotic colors.
const SOFT = ['#acc9ec', '#eab3b3', '#f0dda0', '#b7d7ad', '#d1c3e8', '#efd0b2', '#b7ddca'];
const EXOTIC = ['#e343d1', '#9a55e6', '#f04dac', '#7853e8', '#ce3ce8', '#b947a4'];
export const SUPPORT_COLORS = { integer: '#596675', string: '#887e70', unknown: '#707070', junction: '#778b98' };
interface Candidate { hex: string; lab: readonly number[] }
export type AtomColorRole = 'involved' | 'uninvolved';
export interface ResolvedColor { fill: string; foreground: string; source: 'automatic' | 'custom' | 'inherited' | 'membership' | 'builtin'; declaration: AlloyDeclaration | null; role: AtomColorRole }

/** Qualified signature identity is independent of XML IDs, field order, and atom membership. */
export function signatureColorKey(declaration: AlloyDeclaration): string { return JSON.stringify([declaration.subset ? 'set' : 'sig', declaration.label]); }
/** Convert validated sRGB to linear-light components for contrast and perceptual distance. */
function linearRgb(hex: string): number[] {
  return [1, 3, 5].map((offset) => { const c = parseInt(hex.slice(offset, offset + 2), 16) / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
}
/** OKLab distance guides overflow allocation instead of repeating a finite palette. */
function oklab(hex: string): readonly number[] {
  const [r, g, b] = linearRgb(hex);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
}
/** Every opaque fill gets at least WCAG AA normal-text contrast with black or white. */
export function colorForeground(hex: string): string {
  const [r, g, b] = linearRgb(hex); const luminance = .2126 * r + .7152 * g + .0722 * b;
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
}
/** Squared perceptual separation; bounded inputs are three-component OKLab vectors. */
function distance(a: readonly number[], b: readonly number[]): number { return a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0); }
const candidates = new Map<AtomColorRole, Candidate[]>();
/** Deterministic HSL conversion builds bounded, disjoint perceptual candidate families. */
function hslHex(hue: number, saturation: number, lightness: number): string {
  const channel = (offset: number) => { const k = (offset + hue / 30) % 12; const a = saturation * Math.min(lightness, 1 - lightness); return Math.round(255 * (lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
/** Pastel primary families/lavender and vivid violets/magentas remain separate in lightness and saturation. */
function colorCandidates(role: AtomColorRole): Candidate[] {
  const cached = candidates.get(role); if (cached) return cached;
  const pool = new Map<string, Candidate>();
  for (let hue = 0; hue < 360; hue++) {
    const lavender = hue >= 245 && hue <= 285;
    const permitted = role === 'involved' ? hue <= 80 || (hue >= 95 && hue <= 160) || (hue >= 190 && hue <= 235) || lavender || hue >= 350 : hue >= 245 && hue <= 335;
    if (!permitted) continue;
    for (let s = 0; s < 9; s++) for (let l = 0; l < 9; l++) {
      const softSaturation = lavender ? .24 + s * .035 : .28 + s * .04;
      const softLightness = lavender ? .78 + l * .012 : .74 + l * .016;
      const hex = hslHex(hue, role === 'involved' ? softSaturation : .50 + s * .05, role === 'involved' ? softLightness : .44 + l * .03);
      pool.set(hex, { hex, lab: oklab(hex) });
    }
  }
  const result = [...pool.values()]; candidates.set(role, result); return result;
}

/** Reserve existing/custom colors first; extend with max-min perceptual separation in bounded O(types × candidates). */
function allocateColors(keys: readonly string[], theme: SignatureColorTheme, role: AtomColorRole, reserved: readonly string[] = []): Record<string, string> {
  const automatic: Record<string, string> = Object.create(null); const used = new Set<string>([...Object.values(SUPPORT_COLORS), ...reserved]);
  const custom = new Map<string, Set<string>>();
  for (const [key, color] of Object.entries(theme.overrides)) { const owners = custom.get(color) ?? new Set<string>(); owners.add(key); custom.set(color, owners); }
  for (const key of keys) {
    const color = (role === 'involved' ? theme.automatic : theme.context)?.[key]; const owners = color ? custom.get(color) : undefined;
    if (color && !used.has(color) && (!owners || (owners.size === 1 && owners.has(key)))) { automatic[key] = color; used.add(color); }
  }
  for (const color of custom.keys()) used.add(color);
  const missing = keys.filter((key) => !automatic[key]);
  if (!missing.length) return automatic;
  const pool = colorCandidates(role); const nearest = pool.map(() => Infinity);
  const reserve = (hex: string) => { const lab = oklab(hex); used.add(hex); for (let i = 0; i < pool.length; i++) nearest[i] = Math.min(nearest[i], distance(pool[i].lab, lab)); };
  for (const color of used) reserve(color);
  for (const key of missing) {
    let color = (role === 'involved' ? SOFT : EXOTIC).find((hex) => !used.has(hex) && [...used].every((other) => distance(oklab(hex), oklab(other)) >= .0016));
    if (!color) {
      let best = -1;
      for (let i = 0; i < pool.length; i++) if (!used.has(pool[i].hex) && (best < 0 || nearest[i] > nearest[best])) best = i;
      if (best < 0) throw new Error('Signature color capacity exceeded');
      color = pool[best].hex;
    }
    automatic[key] = color; reserve(color);
  }
  return automatic;
}

/** Migrate legacy ID-based overrides once; model changes cannot leak custom colors onto unrelated XML IDs. */
export function prepareSignatureColors(trace: AlloyTrace, profile: ViewProfile, model = profile.colorTheme?.model ?? trace.filename): ViewProfile {
  const signatures = trace.declarations.filter((d) => d.kind === 'sig' && !d.builtin);
  const previous = profile.colorTheme?.model === model ? profile.colorTheme : undefined;
  const identities = new Set(signatures.map(signatureColorKey));
  const overrides = Object.fromEntries(Object.entries(previous?.overrides ?? {}).filter(([key]) => identities.has(key)));
  if (!profile.colorTheme) for (const d of signatures) if (profile.colors[d.id]) overrides[signatureColorKey(d)] = profile.colors[d.id].toLowerCase();
  const keys = signatures.filter((d) => !d.subset).map(signatureColorKey).sort();
  // Upgrade old automatic palettes once, retaining deliberate overrides and all new-style assignments thereafter.
  const prior: SignatureColorTheme = { model, overrides, automatic: previous?.palette === 'trace-role-v2' ? previous.automatic : {}, context: previous?.palette === 'trace-role-v2' ? previous.context : {} };
  const automatic = allocateColors(keys, prior, 'involved', Object.values(prior.context ?? {}));
  const context = allocateColors(keys, prior, 'uninvolved', Object.values(automatic));
  const colorTheme: SignatureColorTheme = { model, overrides, automatic, context, palette: 'trace-role-v2' };
  return { ...profile, colors: {}, colorTheme };
}

/** Resolve Alloy-style explicit subset → primitive → ancestor → automatic type styling. */
export class SignatureColors {
  private readonly declarations: Map<string, AlloyDeclaration>;
  readonly signatures: readonly AlloyDeclaration[];
  readonly theme: SignatureColorTheme;
  private readonly relevant: ReadonlySet<string>;
  private readonly roleCache = new Map<string, readonly AtomColorRole[]>();
  constructor(readonly trace: AlloyTrace, readonly profile: ViewProfile) {
    this.declarations = new Map(trace.declarations.map((d) => [d.id, d]));
    this.signatures = trace.declarations.filter((d) => d.kind === 'sig').sort((a, b) => { const x = signatureColorKey(a); const y = signatureColorKey(b); return x < y ? -1 : x > y ? 1 : 0; });
    this.theme = prepareSignatureColors(trace, profile).colorTheme!;
    this.relevant = traceRelevantAtoms(trace);
  }
  /** Expose explicit values separately from inherited/default values for editing and reset. */
  explicit(declaration: AlloyDeclaration): string | undefined { return this.theme.overrides[signatureColorKey(declaration)]; }
  /** Classify each atom once for the whole trace; focus/context toggles never change its palette family. */
  role(atom: string): AtomColorRole { return this.relevant.has(atom) ? 'involved' : 'uninvolved'; }
  /** Mixed signatures expose both variants; empty signatures default to soft colors without inventing irrelevant atoms. */
  roles(declaration: AlloyDeclaration): readonly AtomColorRole[] {
    const cached = this.roleCache.get(declaration.id); if (cached) return cached;
    const found = new Set(this.trace.states.flatMap((state) => (state.signatures[declaration.id] ?? []).map((atom) => this.role(atom))));
    const roles: AtomColorRole[] = !found.size || found.has('involved') ? found.has('uninvolved') ? ['involved', 'uninvolved'] : ['involved'] : ['uninvolved'];
    this.roleCache.set(declaration.id, roles); return roles;
  }
  /** Resolve one signature without allowing subset membership to arbitrarily recolor other atoms. */
  signature(declaration: AlloyDeclaration, role: AtomColorRole = this.roles(declaration)[0]): ResolvedColor {
    if (declaration.builtin) return this.resolved(this.builtin(declaration.label), 'builtin', declaration, role);
    const explicit = this.explicit(declaration);
    if (explicit) return this.resolved(explicit, 'custom', declaration, role);
    let ancestor = declaration.parent ? this.declarations.get(declaration.parent) : undefined;
    for (let depth = 0; ancestor && depth < this.signatures.length; depth++) {
      const color = this.explicit(ancestor); if (color) return this.resolved(color, 'inherited', ancestor, role);
      ancestor = ancestor.parent ? this.declarations.get(ancestor.parent) : undefined;
    }
    const palette = role === 'involved' ? this.theme.automatic : this.theme.context;
    return this.resolved(palette?.[signatureColorKey(declaration)] ?? SUPPORT_COLORS.unknown, declaration.subset ? 'membership' : 'automatic', declaration, role);
  }
  /** Resolve membership overrides deterministically by qualified name; removed atoms use their previous state. */
  atom(atom: string, current: TraceState, before: TraceState | null = null): ResolvedColor {
    const role = this.role(atom);
    const active = this.signatures.some((d) => current.signatures[d.id]?.includes(atom)); const state = active ? current : before ?? current;
    for (const d of this.signatures) if (d.subset && this.explicit(d) && state.signatures[d.id]?.includes(atom)) return this.resolved(this.explicit(d)!, 'custom', d, role);
    const signature = primarySignature(this.trace, atom, state);
    if (signature) return this.signature(signature, role);
    const builtin = this.signatures.find((d) => d.builtin && !['univ', 'seq/Int'].includes(d.label) && state.signatures[d.id]?.includes(atom));
    return this.resolved(builtin ? this.builtin(builtin.label) : /^-?\d+$/.test(atom) ? SUPPORT_COLORS.integer : SUPPORT_COLORS.unknown, 'builtin', builtin ?? null, role);
  }
  /** Primitive builtin types have explicit supporting colors, independent of domain allocation. */
  private builtin(label: string): string { return ['Int', 'seq/Int'].includes(label) ? SUPPORT_COLORS.integer : label === 'String' ? SUPPORT_COLORS.string : SUPPORT_COLORS.unknown; }
  /** Package fill, contrast text, and provenance for every consumer of the theme. */
  private resolved(fill: string, source: ResolvedColor['source'], declaration: AlloyDeclaration | null, role: AtomColorRole): ResolvedColor { return { fill, foreground: colorForeground(fill), source, declaration, role }; }
}

/** Custom colors may intentionally coincide; defaults are reallocated only if a new override takes their color. */
export function customizeSignatureColor(trace: AlloyTrace, profile: ViewProfile, declaration: AlloyDeclaration, color: string | null): ViewProfile {
  if (color !== null && !/^#[\da-f]{6}$/i.test(color)) throw new Error('Signature colors must be six-digit hexadecimal RGB values');
  const prepared = profile.colorTheme ? profile : prepareSignatureColors(trace, profile);
  const theme = prepared.colorTheme!; const overrides = { ...theme.overrides }; const key = signatureColorKey(declaration);
  if (color === null) delete overrides[key]; else overrides[key] = color.toLowerCase();
  return prepareSignatureColors(trace, { ...prepared, colorTheme: { ...theme, overrides } });
}

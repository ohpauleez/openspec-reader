import { validateTimelineProfile } from './timeline-profile';
import type { TimelineProfile } from './timeline-profile';

export interface ModelPart {
  readonly id: string;
  readonly label: string;
  readonly source: string;
  readonly sourceUrl: string;
  readonly line: number;
}
export interface ModelLaunch { readonly title: string; readonly filename?: string; readonly parts: readonly ModelPart[]; readonly selected: readonly string[] }
export interface AlloyDeclaration {
  readonly id: string;
  readonly label: string;
  readonly kind: 'sig' | 'field' | 'skolem';
  readonly parent: string | null;
  readonly types: readonly (readonly string[])[];
  readonly mutable: boolean;
  readonly builtin: boolean;
  readonly subset: boolean;
}
export type Tuple = readonly string[];
export interface TraceState {
  readonly signatures: Readonly<Record<string, readonly string[]>>;
  readonly relations: Readonly<Record<string, readonly Tuple[]>>;
}
export interface AlloyTrace {
  readonly traceKind?: 'static' | 'temporal' | 'unknown';
  readonly command: string;
  readonly filename: string;
  readonly buildDate: string;
  readonly bitwidth: number;
  readonly integerRange: { readonly min: number; readonly max: number; readonly enumerated: boolean };
  readonly minTrace: number;
  readonly maxTrace: number;
  readonly loopStart: number;
  readonly declarations: readonly AlloyDeclaration[];
  readonly states: readonly TraceState[];
  readonly sources: readonly { filename: string; content: string }[];
}
export type AnalysisOutcome = 'example' | 'counterexample' | 'no-instance' | 'no-counterexample' | 'exhausted';
export interface CommandInfo { readonly index: number; readonly label: string; readonly check: boolean; readonly description: string; readonly line: number; readonly filename: string }
export interface SourceLocation { readonly label: string; readonly filename: string; readonly line: number; readonly column: number }
export interface EngineResult {
  readonly outcome?: AnalysisOutcome;
  readonly xml?: string;
  readonly commands?: readonly CommandInfo[];
  readonly declarations?: readonly SourceLocation[];
  readonly version?: string;
  readonly incremental?: boolean;
  readonly temporal?: boolean;
  readonly value?: string;
  readonly state?: number;
  readonly provenance?: Record<string, unknown>;
  readonly [key: string]: unknown;
}
export interface SignatureColorTheme {
  readonly model: string;
  readonly automatic: Readonly<Record<string, string>>;
  readonly overrides: Readonly<Record<string, string>>;
  readonly palette?: 'trace-role-v1' | 'trace-role-v2';
  readonly context?: Readonly<Record<string, string>>;
}
export interface ViewProfile {
  readonly hiddenSignatures: readonly string[];
  readonly hiddenRelations: readonly string[];
  readonly colors: Readonly<Record<string, string>>;
  readonly projection: string;
  readonly watches: readonly string[];
  readonly colorTheme?: SignatureColorTheme;
  readonly focus?: TraceFocus;
  readonly timeline?: TimelineProfile;
}
export interface TraceFocus {
  readonly mode: 'full' | 'trace' | 'step';
  readonly context: 'none' | 'one';
  readonly alwaysShow: readonly string[];
  readonly ignoredRelations: readonly string[];
  readonly hideContextEdges: boolean;
}
export const DEFAULT_FOCUS: TraceFocus = { mode: 'full', context: 'one', alwaysShow: [], ignoredRelations: [], hideContextEdges: true };
export const DEFAULT_PROFILE: ViewProfile = { hiddenSignatures: [], hiddenRelations: [], colors: {}, projection: '', watches: [] };

/** Native/saved metadata is data, not a trusted TypeScript assertion. */
export function validateEngineResult(value: unknown): EngineResult {
  if (!value || typeof value !== 'object') throw new Error('Invalid engine result');
  const v = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  if (v.protocolVersion === 1) result.protocolVersion = 1;
  for (const key of ['version', 'value', 'jarPath', 'projectRoot', 'error']) if (typeof v[key] === 'string') result[key] = v[key];
  if (typeof v.xml === 'string' && v.xml.length <= 16 * 1024 * 1024) result.xml = v.xml;
  if (['example', 'counterexample', 'no-instance', 'no-counterexample', 'exhausted'].includes(String(v.outcome))) result.outcome = v.outcome;
  for (const key of ['incremental', 'temporal']) if (typeof v[key] === 'boolean') result[key] = v[key];
  if (Number.isSafeInteger(v.state) && Number(v.state) >= 0) result.state = v.state;
  if (v.provenance && typeof v.provenance === 'object' && !Array.isArray(v.provenance)) result.provenance = v.provenance;
  if (Array.isArray(v.commands)) result.commands = v.commands.slice(0, 2000).filter((entry) => entry && Number.isSafeInteger(entry.index) && entry.index >= 0 && typeof entry.label === 'string' && typeof entry.check === 'boolean' && typeof entry.description === 'string' && typeof entry.filename === 'string' && Number.isSafeInteger(entry.line));
  if (Array.isArray(v.declarations)) result.declarations = v.declarations.slice(0, 20_000).filter((entry) => entry && typeof entry.label === 'string' && typeof entry.filename === 'string' && Number.isSafeInteger(entry.line) && Number.isSafeInteger(entry.column));
  return result as EngineResult;
}

/** Validate model launch data at the content-script/storage boundary. */
export function validateLaunch(value: unknown): ModelLaunch | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string' || !Array.isArray(v.parts) || v.parts.length > 128 || !Array.isArray(v.selected)) return null;
  if (v.filename !== undefined && (typeof v.filename !== 'string' || !v.filename.length || v.filename.length > 4096)) return null;
  const parts: ModelPart[] = [];
  let length = 0;
  for (const part of v.parts) {
    if (!part || typeof part.id !== 'string' || typeof part.label !== 'string' || typeof part.source !== 'string' || typeof part.sourceUrl !== 'string' || !Number.isSafeInteger(part.line) || part.line < 1) return null;
    length += part.source.length;
    if (length > 8 * 1024 * 1024 || parts.some((previous) => previous.id === part.id)) return null;
    parts.push({ id: part.id, label: part.label, source: part.source, sourceUrl: part.sourceUrl, line: part.line });
  }
  return { title: v.title, ...(typeof v.filename === 'string' ? { filename: v.filename } : {}), parts, selected: v.selected.filter((id): id is string => typeof id === 'string' && parts.some((part) => part.id === id)) };
}

/** Restore only bounded declarative preferences; profiles never contain executable scripts. */
export function validateProfile(value: unknown): ViewProfile {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const strings = (value: unknown, limit = 1000): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, limit) : [];
  const colorMap = (value: unknown): Record<string, string> => {
    const result: Record<string, string> = Object.create(null);
    if (value && typeof value === 'object' && !Array.isArray(value)) for (const [id, color] of Object.entries(value).slice(0, 2000)) if (id.length <= 16384 && typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)) result[id] = color.toLowerCase();
    return result;
  };
  const theme = v.colorTheme as Partial<SignatureColorTheme> | null;
  const colorTheme: SignatureColorTheme | undefined = theme && typeof theme === 'object' && typeof theme.model === 'string' && theme.model.length <= 32768 ? { model: theme.model, automatic: colorMap(theme.automatic), overrides: colorMap(theme.overrides), ...(theme.palette === 'trace-role-v1' || theme.palette === 'trace-role-v2' ? { palette: theme.palette, context: colorMap(theme.context) } : {}) } : undefined;
  const rawFocus = v.focus && typeof v.focus === 'object' ? v.focus as Partial<TraceFocus> : undefined;
  const focus: TraceFocus | undefined = rawFocus ? { mode: rawFocus.mode === 'trace' || rawFocus.mode === 'step' ? rawFocus.mode : 'full', context: rawFocus.context === 'none' ? 'none' : 'one', alwaysShow: Array.isArray(rawFocus.alwaysShow) ? [...new Set(rawFocus.alwaysShow.filter((s): s is string => typeof s === 'string' && s.length <= 8192))].slice(0, 20_000) : [], ignoredRelations: strings(rawFocus.ignoredRelations, 2000), hideContextEdges: rawFocus.hideContextEdges !== false } : undefined;
  const timeline = validateTimelineProfile(v.timeline);
  return { hiddenSignatures: strings(v.hiddenSignatures), hiddenRelations: strings(v.hiddenRelations), colors: colorMap(v.colors), projection: typeof v.projection === 'string' ? v.projection : '', watches: strings(v.watches).slice(0, 10), ...(colorTheme ? { colorTheme } : {}), ...(focus ? { focus } : {}), ...(timeline ? { timeline } : {}) };
}

import type { TimelineEvent } from './timeline-model';

export interface TimelineSearchRecord { readonly id: string; readonly fields: Readonly<Record<string, string>>; readonly from: number; readonly to: number }
/** Index full evidence, not truncated display labels or only currently visible lanes. */
export function timelineSearchRecord(event: TimelineEvent): TimelineSearchRecord {
  const fields: Record<string, string> = { participant: event.participants.join(' '), relation: `${event.declaration} ${event.sourceLabel} ${event.evidence.map((e) => e.label).join(' ')}`, action: event.kind === 'action' || event.kind === 'communication' ? event.label : '', state: `${event.from} ${event.to}`, change: event.evidence.map((e) => e.change).join(' '), kind: event.kind, provenance: event.provenance };
  fields.text = `${event.label} ${Object.values(fields).join(' ')} ${event.evidence.map((e) => e.tuple.join(' ')).join(' ')}`;
  return { id: event.id, fields, from: event.from, to: event.to };
}

/** Tokenize quoted phrases and /regular expressions/ with field prefixes; the input and token count are bounded. */
function tokens(query: string): string[] {
  if (query.length > 500) throw new Error('Search is limited to 500 characters');
  const result: string[] = []; let token = ''; let quote = ''; let escaped = false;
  for (const char of query.trim()) {
    if (escaped) { token += char; escaped = false; continue; }
    if (char === '\\' && quote) { token += char; escaped = true; continue; }
    if (quote) { token += char; if (char === quote) quote = ''; continue; }
    if (char === '"' || (char === '/' && (!token || token.endsWith(':') || token === '-'))) { quote = char; token += char; continue; }
    if (/\s/.test(char)) { if (token) result.push(token); token = ''; } else token += char;
  }
  if (quote) throw new Error('Unclosed quote or regular expression');
  if (token) result.push(token);
  if (result.length > 64) throw new Error('Search is limited to 64 terms');
  return result;
}

/** Compile bounded AND/OR/NOT queries. Regex evaluation belongs in a disposable, timed worker. */
export function compileTimelineQuery(query: string): (record: TimelineSearchRecord) => boolean {
  const groups: ((record: TimelineSearchRecord) => boolean)[][] = [[]]; let negate = false; let needsTerm = false;
  for (let token of tokens(query)) {
    if (token === 'OR') { if (!groups.at(-1)!.length || needsTerm || negate) throw new Error('OR needs a preceding term'); groups.push([]); continue; }
    if (token === 'AND') { if (!groups.at(-1)!.length || needsTerm || negate) throw new Error('AND needs a preceding term'); needsTerm = true; continue; }
    if (token === 'NOT') { negate = !negate; continue; }
    if (token.startsWith('-')) { negate = !negate; token = token.slice(1); }
    const colon = /^[a-z]+:/i.test(token) ? token.indexOf(':') : -1; const field = colon > 0 ? token.slice(0, colon) : 'text'; const value = colon > 0 ? token.slice(colon + 1) : token;
    if (!['text', 'participant', 'relation', 'action', 'state', 'change', 'kind', 'provenance'].includes(field)) throw new Error(`Unknown search field: ${field}`);
    if (!value) throw new Error('A search term needs a value');
    let predicate: (record: TimelineSearchRecord) => boolean;
    if (field === 'state' && /^\d+\.\.\d+$/.test(value)) { const [start, end] = value.split('..').map(Number); predicate = (record) => (record.from >= start && record.from <= end) || (record.to >= start && record.to <= end); }
    else if (value.startsWith('/')) {
      const last = value.lastIndexOf('/'); if (last < 1 || !/^i?$/.test(value.slice(last + 1))) throw new Error('Use /pattern/ or /pattern/i');
      const expression = new RegExp(value.slice(1, last), value.slice(last + 1)); predicate = (record) => expression.test(record.fields[field] ?? '');
    } else { const needle = (value.startsWith('"') ? JSON.parse(value) as string : value).toLowerCase(); predicate = (record) => (record.fields[field] ?? '').toLowerCase().includes(needle); }
    const not = negate; negate = false; needsTerm = false; groups.at(-1)!.push((record) => not ? !predicate(record) : predicate(record));
  }
  if (negate || needsTerm || (groups.length > 1 && !groups.at(-1)!.length)) throw new Error('Incomplete search expression');
  return (record) => groups.some((group) => group.every((test) => test(record)));
}

/** Search all records with an explicit navigation-result bound; count still includes every match. */
export function searchTimelineRecords(records: readonly TimelineSearchRecord[], query: string): { ids: string[]; count: number } {
  const match = compileTimelineQuery(query); const ids: string[] = []; let count = 0;
  for (const record of records) if (match(record)) { count++; if (ids.length < 10_000) ids.push(record.id); }
  return { ids, count };
}

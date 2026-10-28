import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
vi.mock('webextension-polyfill', () => ({ default: {} }));
import { validateReadingState } from '../src/state';
import { validateSettings } from '../src/settings';

describe('persisted data boundary', () => {
  it('defaults invalid settings without allowing unknown keys through', () => {
    expect(validateSettings({ theme: 'purple', remember: false, diagnostics: 'yes', width: 'wide', extra: true }))
      .toEqual({ theme: 'auto', specMode: 'auto', diagnostics: true, keywords: true, remember: false, width: 'wide' });
  });

  it('discards invalid offsets and caps the total saved folds', () => {
    const state = validateReadingState({ version: 1, fingerprint: 'source', scrollY: -10,
      closed: ['real', null, 2], code: {
        invalid: [{ from: -1, to: 5 }, { from: 4, to: 1 }, { from: 2.5, to: 10 }, null],
        first: Array.from({ length: 3000 }, (_, i) => ({ from: i, to: i + 1 })),
        second: [{ from: 1, to: 2 }],
      } });
    expect(state?.scrollY).toBe(0);
    expect(state?.closed).toEqual(['real']);
    expect(Object.values(state!.code).flat()).toHaveLength(2000);
  });

  it('never throws for arbitrary JSON-compatible stored state', () => {
    fc.assert(fc.property(fc.jsonValue(), (value) => {
      const state = validateReadingState(value);
      if (state) {
        expect(state.scrollY).toBeGreaterThanOrEqual(0);
        expect(state.closed.length).toBeLessThanOrEqual(2000);
        expect(Object.values(state.code).flat().length).toBeLessThanOrEqual(2000);
      }
    }), { numRuns: 100 });
  });
});

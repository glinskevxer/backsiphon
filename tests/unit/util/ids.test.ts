import { describe, expect, it } from 'vitest';

import {
  ASSEMBLY_ID,
  CONNECTION_ID,
  formatId,
  nextId,
  nextIds,
  normaliseId,
  parseId,
  REPORT_ID,
} from '../../../src/util/ids';

describe('formatting', () => {
  it('pads to the width of the shape', () => {
    expect(formatId(CONNECTION_ID, 1)).toBe('SC-00001');
    expect(formatId(CONNECTION_ID, 4471)).toBe('SC-04471');
    expect(formatId(REPORT_ID, 12)).toBe('TR-000012');
  });

  it('does not truncate a number that outgrows the width', () => {
    expect(formatId(ASSEMBLY_ID, 1234567)).toBe('BA-1234567');
  });

  it('refuses a sequence that is not a counting number', () => {
    expect(() => formatId(CONNECTION_ID, 0)).toThrow();
    expect(() => formatId(CONNECTION_ID, -3)).toThrow();
    expect(() => formatId(CONNECTION_ID, 1.5)).toThrow();
  });
});

describe('parsing', () => {
  it('reads the sequence back', () => {
    expect(parseId(CONNECTION_ID, 'SC-00042')).toEqual({ ok: true, value: 42 });
    expect(parseId(REPORT_ID, 'TR-000001')).toEqual({ ok: true, value: 1 });
  });

  it('refuses another shape or a mangled one', () => {
    expect(parseId(CONNECTION_ID, 'BA-00042').ok).toBe(false);
    expect(parseId(CONNECTION_ID, 'SC00042').ok).toBe(false);
    expect(parseId(CONNECTION_ID, 'SC-').ok).toBe(false);
    expect(parseId(CONNECTION_ID, 'SC-00000').ok).toBe(false);
    expect(parseId(CONNECTION_ID, 'sc-00042').ok).toBe(false);
  });
});

describe('the next one', () => {
  it('starts at one on an empty store', () => {
    expect(nextId(CONNECTION_ID, [])).toBe('SC-00001');
  });

  it('follows the highest, not the last', () => {
    expect(nextId(CONNECTION_ID, ['SC-00001', 'SC-00009', 'SC-00004'])).toBe('SC-00010');
  });

  it('steps over anything it cannot read', () => {
    expect(nextId(CONNECTION_ID, ['LEGACY/44', 'SC-00003', 'BA-00099'])).toBe('SC-00004');
    expect(nextId(CONNECTION_ID, ['LEGACY/44'])).toBe('SC-00001');
  });

  it('hands out a run for a batch', () => {
    expect(nextIds(ASSEMBLY_ID, ['BA-00007'], 3)).toEqual(['BA-00008', 'BA-00009', 'BA-00010']);
    expect(nextIds(ASSEMBLY_ID, [], 1)).toEqual(['BA-00001']);
    expect(nextIds(ASSEMBLY_ID, [], 0)).toEqual([]);
  });
});

describe('what a clerk typed', () => {
  it('takes the bare number', () => {
    expect(normaliseId(CONNECTION_ID, '42')).toEqual({ ok: true, value: 'SC-00042' });
    expect(normaliseId(CONNECTION_ID, '00042')).toEqual({ ok: true, value: 'SC-00042' });
  });

  it('takes the whole thing in either case, with spaces round it', () => {
    expect(normaliseId(CONNECTION_ID, '  sc-42 ')).toEqual({ ok: true, value: 'SC-00042' });
  });

  it('refuses something from another shape', () => {
    const result = normaliseId(CONNECTION_ID, 'BA-00042');
    expect(result.ok).toBe(false);
  });

  it('refuses words', () => {
    expect(normaliseId(CONNECTION_ID, 'the plating shop').ok).toBe(false);
  });
});

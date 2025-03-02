import { describe, expect, it } from 'vitest';

import { describeLetterRun, summarise } from '../../../src/service/letters';

describe('summarising a run', () => {
  it('counts nothing as nothing', () => {
    const summary = summarise(12, [], 0);
    expect(summary.written).toBe(0);
    expect(summary.byKind).toEqual([]);
    expect(describeLetterRun(summary)).toBe('12 connections, 0 letters (none), 0 skipped');
  });

  it('counts each kind and keeps the order they first appeared in', () => {
    const summary = summarise(30, ['first', 'second', 'first', 'shutoff'], 4);
    expect(summary.written).toBe(4);
    expect(summary.byKind).toEqual([
      ['first', 2],
      ['second', 1],
      ['shutoff', 1],
    ]);
    expect(describeLetterRun(summary)).toBe(
      '30 connections, 4 letters (2 first, 1 second, 1 shutoff), 4 skipped',
    );
  });

  it('takes a different word for what went out', () => {
    const summary = summarise(2, ['never_walked'], 0);
    expect(describeLetterRun(summary, 'survey letters')).toBe(
      '2 connections, 1 survey letters (1 never_walked), 0 skipped',
    );
  });
});

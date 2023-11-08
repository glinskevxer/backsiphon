import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  addYears,
  civil,
  compare,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  earliest,
  endOfMonth,
  fromParts,
  isAfter,
  isBefore,
  isCivilDate,
  isLeapYear,
  isOnOrAfter,
  isOnOrBefore,
  isWeekend,
  latest,
  parse,
  startOfMonth,
} from '../../../src/util/dates';

describe('parsing', () => {
  it('accepts a well formed day', () => {
    expect(parse('2024-02-29')).toEqual({ ok: true, value: { year: 2024, month: 2, day: 29 } });
  });

  it('rejects anything that is not the plain form', () => {
    for (const bad of ['2024-2-9', '20240229', '2024-02-29T00:00:00Z', '', 'today']) {
      expect(parse(bad).ok).toBe(false);
    }
  });

  it('rejects a month or a day that does not exist', () => {
    expect(parse('2024-13-01').ok).toBe(false);
    expect(parse('2024-00-01').ok).toBe(false);
    expect(parse('2023-02-29').ok).toBe(false);
    expect(parse('2024-04-31').ok).toBe(false);
    expect(parse('2024-04-00').ok).toBe(false);
  });

  it('names what is wrong', () => {
    const result = parse('2023-02-29');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('no day 29');
    }
  });

  it('guards a literal', () => {
    expect(civil('2025-01-31')).toBe('2025-01-31');
    expect(() => civil('2025-01-32')).toThrow();
    expect(isCivilDate('2025-01-31')).toBe(true);
    expect(isCivilDate(20250131)).toBe(false);
  });

  it('formats parts back', () => {
    expect(fromParts({ year: 2024, month: 7, day: 4 })).toBe('2024-07-04');
    expect(fromParts({ year: 999, month: 12, day: 31 })).toBe('0999-12-31');
  });
});

describe('calendar facts', () => {
  it('knows leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it('knows month lengths', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2024, 4)).toBe(30);
    expect(daysInMonth(2024, 12)).toBe(31);
    expect(daysInMonth(2024, 13)).toBe(0);
  });
});

describe('arithmetic', () => {
  it('adds days across a month and a year boundary', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2024-01-01', 0)).toBe('2024-01-01');
  });

  it('clamps a month addition to the end of the target month', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2023-01-31', 1)).toBe('2023-02-28');
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
    expect(addMonths('2024-05-15', 12)).toBe('2025-05-15');
  });

  it('adds years the same way', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
    expect(addYears('2024-06-01', 2)).toBe('2026-06-01');
  });

  it('counts days between two dates in both directions', () => {
    expect(daysBetween('2024-01-01', '2024-01-31')).toBe(30);
    expect(daysBetween('2024-01-31', '2024-01-01')).toBe(-30);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2023-02-28', '2023-03-01')).toBe(1);
  });
});

describe('ordering', () => {
  it('compares', () => {
    expect(compare('2024-01-01', '2024-01-02')).toBe(-1);
    expect(compare('2024-01-02', '2024-01-01')).toBe(1);
    expect(compare('2024-01-01', '2024-01-01')).toBe(0);
    expect(isBefore('2024-01-01', '2024-01-02')).toBe(true);
    expect(isAfter('2024-01-02', '2024-01-01')).toBe(true);
    expect(isOnOrBefore('2024-01-01', '2024-01-01')).toBe(true);
    expect(isOnOrAfter('2024-01-01', '2024-01-01')).toBe(true);
  });

  it('picks the ends of a list', () => {
    const dates = ['2024-05-01', '2023-12-31', '2024-11-30'];
    expect(earliest(dates)).toBe('2023-12-31');
    expect(latest(dates)).toBe('2024-11-30');
    expect(earliest([])).toBeUndefined();
    expect(latest([])).toBeUndefined();
  });
});

describe('week and month edges', () => {
  it('reads the day of the week', () => {
    expect(dayOfWeek('2024-07-04')).toBe(4);
    expect(dayOfWeek('2024-07-06')).toBe(6);
    expect(dayOfWeek('2024-07-07')).toBe(0);
    expect(isWeekend('2024-07-06')).toBe(true);
    expect(isWeekend('2024-07-07')).toBe(true);
    expect(isWeekend('2024-07-08')).toBe(false);
  });

  it('walks to the ends of a month', () => {
    expect(startOfMonth('2024-02-17')).toBe('2024-02-01');
    expect(endOfMonth('2024-02-17')).toBe('2024-02-29');
    expect(endOfMonth('2023-02-17')).toBe('2023-02-28');
    expect(endOfMonth('2024-11-05')).toBe('2024-11-30');
  });
});

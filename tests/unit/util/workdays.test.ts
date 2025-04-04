import { describe, expect, it } from 'vitest';

import {
  addWorkdays,
  buildCalendar,
  FIXED_HOLIDAYS,
  isWorkday,
  nextWorkday,
  nthWeekday,
  observedDate,
  previousWorkday,
  withExtraHolidays,
  workdaysBetween,
  type WorkCalendar,
} from '../../../src/util/workdays';

const calendar: WorkCalendar = buildCalendar('program office', 2023, 2026);

function fixed(name: string): (typeof FIXED_HOLIDAYS)[number] {
  const found = FIXED_HOLIDAYS.find((holiday) => holiday.name === name);
  if (found === undefined) {
    throw new Error(`no holiday called ${name}`);
  }
  return found;
}

describe('holiday dates', () => {
  it('keeps a weekday holiday where it falls', () => {
    expect(observedDate(2024, fixed('independence day'))).toBe('2024-07-04');
  });

  it('moves a saturday holiday back to the friday', () => {
    expect(observedDate(2026, fixed('independence day'))).toBe('2026-07-03');
  });

  it('moves a sunday holiday forward to the monday', () => {
    expect(observedDate(2027, fixed('christmas'))).toBe('2027-12-24');
    expect(observedDate(2022, fixed('christmas'))).toBe('2022-12-26');
  });

  it('leaves an unobserved holiday alone', () => {
    expect(observedDate(2026, { name: 'audit day', month: 7, day: 4, observed: false })).toBe(
      '2026-07-04',
    );
  });

  it('finds the nth weekday of a month', () => {
    expect(nthWeekday(2024, { name: 'mlk', month: 1, weekday: 1, occurrence: 3 })).toBe(
      '2024-01-15',
    );
    expect(nthWeekday(2024, { name: 'labor', month: 9, weekday: 1, occurrence: 1 })).toBe(
      '2024-09-02',
    );
    expect(nthWeekday(2024, { name: 'thanksgiving', month: 11, weekday: 4, occurrence: 4 })).toBe(
      '2024-11-28',
    );
  });

  it('finds the last weekday of a month', () => {
    expect(nthWeekday(2024, { name: 'memorial', month: 5, weekday: 1, occurrence: -1 })).toBe(
      '2024-05-27',
    );
    expect(nthWeekday(2023, { name: 'memorial', month: 5, weekday: 1, occurrence: -1 })).toBe(
      '2023-05-29',
    );
    expect(
      nthWeekday(2024, { name: 'last friday feb', month: 2, weekday: 5, occurrence: -1 }),
    ).toBe('2024-02-23');
  });
});

describe('working days', () => {
  it('rejects weekends and holidays', () => {
    expect(isWorkday(calendar, '2024-07-03')).toBe(true);
    expect(isWorkday(calendar, '2024-07-04')).toBe(false);
    expect(isWorkday(calendar, '2024-07-06')).toBe(false);
    expect(isWorkday(calendar, '2024-05-27')).toBe(false);
  });

  it('takes an extra closure day from the purveyor', () => {
    const closed = withExtraHolidays(calendar, ['2024-08-19']);
    expect(isWorkday(calendar, '2024-08-19')).toBe(true);
    expect(isWorkday(closed, '2024-08-19')).toBe(false);
    expect(calendar.holidays.has('2024-08-19')).toBe(false);
  });

  it('steps to the next and previous working day', () => {
    expect(nextWorkday(calendar, '2024-07-03')).toBe('2024-07-05');
    expect(nextWorkday(calendar, '2024-07-05')).toBe('2024-07-08');
    expect(previousWorkday(calendar, '2024-07-05')).toBe('2024-07-03');
    expect(previousWorkday(calendar, '2024-05-28')).toBe('2024-05-24');
  });

  it('counts a repair window in working days', () => {
    expect(addWorkdays(calendar, '2024-07-01', 5)).toBe('2024-07-09');
    expect(addWorkdays(calendar, '2024-08-16', 5)).toBe('2024-08-23');
    expect(addWorkdays(calendar, '2024-08-16', 0)).toBe('2024-08-16');
    expect(addWorkdays(calendar, '2024-08-16', -5)).toBe('2024-08-09');
  });

  it('starts the window from a weekend day the same way', () => {
    expect(addWorkdays(calendar, '2024-08-17', 1)).toBe('2024-08-19');
  });

  it('counts working days between two dates', () => {
    expect(workdaysBetween(calendar, '2024-08-16', '2024-08-23')).toBe(5);
    expect(workdaysBetween(calendar, '2024-07-01', '2024-07-08')).toBe(4);
    expect(workdaysBetween(calendar, '2024-08-23', '2024-08-16')).toBe(0);
    expect(workdaysBetween(calendar, '2024-08-16', '2024-08-16')).toBe(0);
  });
});

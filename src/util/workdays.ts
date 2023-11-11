/**
 * Working days.
 *
 * Repair windows are counted in working days, not calendar days, because a
 * tester cannot get back onto a site the utility is shut on. The holiday list
 * belongs to the purveyor, so it is data rather than a constant, but the
 * default list is the one the program office publishes every December.
 */

import { addDays, compare, dayOfWeek, isWeekend, type CivilDate } from './dates';

export interface WorkCalendar {
  readonly name: string;
  readonly holidays: ReadonlySet<CivilDate>;
}

export interface FixedHoliday {
  readonly name: string;
  readonly month: number;
  readonly day: number;
  /** Weekend days move to the nearest weekday when the office observes them. */
  readonly observed: boolean;
}

export interface FloatingHoliday {
  readonly name: string;
  readonly month: number;
  /** 0 is Sunday. */
  readonly weekday: number;
  /** 1 to 4, or -1 for the last one in the month. */
  readonly occurrence: number;
}

export const FIXED_HOLIDAYS: readonly FixedHoliday[] = [
  { name: 'new year', month: 1, day: 1, observed: true },
  { name: 'independence day', month: 7, day: 4, observed: true },
  { name: 'veterans day', month: 11, day: 11, observed: true },
  { name: 'christmas', month: 12, day: 25, observed: true },
];

export const FLOATING_HOLIDAYS: readonly FloatingHoliday[] = [
  { name: 'martin luther king day', month: 1, weekday: 1, occurrence: 3 },
  { name: 'presidents day', month: 2, weekday: 1, occurrence: 3 },
  { name: 'memorial day', month: 5, weekday: 1, occurrence: -1 },
  { name: 'labor day', month: 9, weekday: 1, occurrence: 1 },
  { name: 'thanksgiving', month: 11, weekday: 4, occurrence: 4 },
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** The date a fixed holiday is kept on, once the weekend rule is applied. */
export function observedDate(year: number, holiday: FixedHoliday): CivilDate {
  const actual = `${year}-${pad(holiday.month)}-${pad(holiday.day)}`;
  if (!holiday.observed) {
    return actual;
  }
  const weekday = dayOfWeek(actual);
  if (weekday === 6) {
    return addDays(actual, -1);
  }
  if (weekday === 0) {
    return addDays(actual, 1);
  }
  return actual;
}

/** The nth given weekday of a month, or the last one when occurrence is -1. */
export function nthWeekday(year: number, holiday: FloatingHoliday): CivilDate {
  if (holiday.occurrence === -1) {
    let candidate = `${year}-${pad(holiday.month)}-${pad(daysInMonthOf(year, holiday.month))}`;
    while (dayOfWeek(candidate) !== holiday.weekday) {
      candidate = addDays(candidate, -1);
    }
    return candidate;
  }
  let candidate = `${year}-${pad(holiday.month)}-01`;
  while (dayOfWeek(candidate) !== holiday.weekday) {
    candidate = addDays(candidate, 1);
  }
  return addDays(candidate, (holiday.occurrence - 1) * 7);
}

function daysInMonthOf(year: number, month: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const length = lengths[month - 1] ?? 30;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return month === 2 && leap ? 29 : length;
}

/** Build a calendar covering the given years inclusive. */
export function buildCalendar(name: string, fromYear: number, toYear: number): WorkCalendar {
  const holidays = new Set<CivilDate>();
  for (let year = fromYear; year <= toYear; year += 1) {
    for (const holiday of FIXED_HOLIDAYS) {
      holidays.add(observedDate(year, holiday));
    }
    for (const holiday of FLOATING_HOLIDAYS) {
      holidays.add(nthWeekday(year, holiday));
    }
  }
  return { name, holidays };
}

export function withExtraHolidays(
  calendar: WorkCalendar,
  extra: ReadonlyArray<CivilDate>,
): WorkCalendar {
  const holidays = new Set(calendar.holidays);
  for (const date of extra) {
    holidays.add(date);
  }
  return { name: calendar.name, holidays };
}

export function isWorkday(calendar: WorkCalendar, date: CivilDate): boolean {
  return !isWeekend(date) && !calendar.holidays.has(date);
}

export function nextWorkday(calendar: WorkCalendar, date: CivilDate): CivilDate {
  let candidate = addDays(date, 1);
  while (!isWorkday(calendar, candidate)) {
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

export function previousWorkday(calendar: WorkCalendar, date: CivilDate): CivilDate {
  let candidate = addDays(date, -1);
  while (!isWorkday(calendar, candidate)) {
    candidate = addDays(candidate, -1);
  }
  return candidate;
}

/**
 * Count working days forward from a date. Day zero is the date itself whether
 * or not it is a working day, so a five day repair window granted on a Friday
 * lands on the following Friday.
 */
export function addWorkdays(calendar: WorkCalendar, date: CivilDate, count: number): CivilDate {
  if (count === 0) {
    return date;
  }
  const step = count > 0 ? nextWorkday : previousWorkday;
  let candidate = date;
  for (let taken = 0; taken < Math.abs(count); taken += 1) {
    candidate = step(calendar, candidate);
  }
  return candidate;
}

/** Working days strictly after `from` up to and including `to`. */
export function workdaysBetween(calendar: WorkCalendar, from: CivilDate, to: CivilDate): number {
  if (compare(from, to) >= 0) {
    return 0;
  }
  let counted = 0;
  let candidate = addDays(from, 1);
  while (compare(candidate, to) <= 0) {
    if (isWorkday(calendar, candidate)) {
      counted += 1;
    }
    candidate = addDays(candidate, 1);
  }
  return counted;
}

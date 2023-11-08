/**
 * Civil dates, held as `YYYY-MM-DD` strings.
 *
 * Everything the register schedules is a calendar day in the purveyor's own
 * jurisdiction: a test is due on a day, a notice goes out on a day, a
 * certification lapses at the end of a day. None of it is an instant, so none
 * of it goes anywhere near a timezone. Arithmetic runs through UTC only
 * because that is the one place a Date does not shift under you.
 */

import { err, ok, type Result } from './result';

/** A calendar day in the form `YYYY-MM-DD`. */
export type CivilDate = string;

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function isCivilDate(value: unknown): value is CivilDate {
  return typeof value === 'string' && parse(value).ok;
}

export function parse(value: string): Result<DateParts, string> {
  const match = PATTERN.exec(value);
  if (match === null) {
    return err(`"${value}" is not a date of the form YYYY-MM-DD`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) {
    return err(`"${value}" has no month ${month}`);
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return err(`"${value}" has no day ${day} in month ${month}`);
  }
  return ok({ year, month, day });
}

/** Parse or throw. For literals written in this codebase, not for input. */
export function civil(value: string): CivilDate {
  const parsed = parse(value);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return value;
}

export function fromParts(parts: DateParts): CivilDate {
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${String(parts.year).padStart(4, '0')}-${month}-${day}`;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const length = lengths[month - 1];
  if (length === undefined) {
    return 0;
  }
  return month === 2 && isLeapYear(year) ? 29 : length;
}

function toEpochDay(date: CivilDate): number {
  const parts = parse(date);
  if (!parts.ok) {
    throw new Error(parts.error);
  }
  return Date.UTC(parts.value.year, parts.value.month - 1, parts.value.day) / MS_PER_DAY;
}

function fromEpochDay(epochDay: number): CivilDate {
  const instant = new Date(epochDay * MS_PER_DAY);
  return fromParts({
    year: instant.getUTCFullYear(),
    month: instant.getUTCMonth() + 1,
    day: instant.getUTCDate(),
  });
}

export function addDays(date: CivilDate, days: number): CivilDate {
  return fromEpochDay(toEpochDay(date) + Math.trunc(days));
}

/**
 * Add whole months, clamping to the end of the target month. The 31st of
 * January plus one month is the 29th or 28th of February, which is what an
 * annual test cycle anniversary has to do.
 */
export function addMonths(date: CivilDate, months: number): CivilDate {
  const parts = parse(date);
  if (!parts.ok) {
    throw new Error(parts.error);
  }
  const zeroBased = parts.value.year * 12 + (parts.value.month - 1) + Math.trunc(months);
  const year = Math.floor(zeroBased / 12);
  const month = (zeroBased % 12) + 1;
  return fromParts({ year, month, day: Math.min(parts.value.day, daysInMonth(year, month)) });
}

export function addYears(date: CivilDate, years: number): CivilDate {
  return addMonths(date, Math.trunc(years) * 12);
}

/** Days from `from` to `to`, negative when `to` is earlier. */
export function daysBetween(from: CivilDate, to: CivilDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function compare(left: CivilDate, right: CivilDate): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isBefore(left: CivilDate, right: CivilDate): boolean {
  return left < right;
}

export function isAfter(left: CivilDate, right: CivilDate): boolean {
  return left > right;
}

export function isOnOrBefore(left: CivilDate, right: CivilDate): boolean {
  return left <= right;
}

export function isOnOrAfter(left: CivilDate, right: CivilDate): boolean {
  return left >= right;
}

export function earliest(dates: ReadonlyArray<CivilDate>): CivilDate | undefined {
  return dates.length === 0 ? undefined : dates.reduce((a, b) => (a <= b ? a : b));
}

export function latest(dates: ReadonlyArray<CivilDate>): CivilDate | undefined {
  return dates.length === 0 ? undefined : dates.reduce((a, b) => (a >= b ? a : b));
}

/** 0 is Sunday, matching `Date.getUTCDay`. */
export function dayOfWeek(date: CivilDate): number {
  return new Date(toEpochDay(date) * MS_PER_DAY).getUTCDay();
}

export function isWeekend(date: CivilDate): boolean {
  const day = dayOfWeek(date);
  return day === 0 || day === 6;
}

export function startOfMonth(date: CivilDate): CivilDate {
  const parts = parse(date);
  if (!parts.ok) {
    throw new Error(parts.error);
  }
  return fromParts({ ...parts.value, day: 1 });
}

export function endOfMonth(date: CivilDate): CivilDate {
  const parts = parse(date);
  if (!parts.ok) {
    throw new Error(parts.error);
  }
  return fromParts({ ...parts.value, day: daysInMonth(parts.value.year, parts.value.month) });
}

/**
 * The register itself: an open store, the policy it is run under, and the
 * clerk whose name goes on the trail.
 *
 * Every service function takes one of these rather than reaching for a global,
 * so a test can run a whole program office in memory and so an office can run
 * two stores side by side while it takes over a neighbouring district.
 */

import { DEFAULT_CYCLE_POLICY, type CyclePolicy } from '../domain/cycle';
import { DEFAULT_FILING_WINDOW_DAYS } from '../domain/admissibility';
import { buildCalendar, type WorkCalendar } from '../util/workdays';
import { err, ok, type Result } from '../util/result';
import { formatId, parseId, type IdShape } from '../util/ids';
import { closeDatabase, openDatabase, selectAll, type Database } from '../storage/db';
import { migrate } from '../storage/schema';

export interface LetterText {
  /** Put at the top of every letter, above the account line. */
  readonly heading?: string;
  /** Put at the bottom, where an office puts a telephone number. */
  readonly footer?: string;
  /** Replaces the sentence the first and second notices end with. */
  readonly ask?: string;
}

export interface ProgramPolicy {
  readonly cycle: CyclePolicy;
  /** Days after a test the office will still take the paperwork. */
  readonly filingWindowDays: number;
  /** Days a new connection has to be surveyed within. */
  readonly newConnectionSurveyDays: number;
  /** The name the office puts at the bottom of a notice. */
  readonly purveyorName: string;
  /** Wording the office has settled on, over the wording built in. */
  readonly letter: LetterText;
}

export const DEFAULT_PROGRAM_POLICY: ProgramPolicy = {
  cycle: DEFAULT_CYCLE_POLICY,
  filingWindowDays: DEFAULT_FILING_WINDOW_DAYS,
  newConnectionSurveyDays: 30,
  purveyorName: 'the water purveyor',
  letter: {},
};

export interface Register {
  readonly db: Database;
  readonly policy: ProgramPolicy;
  readonly calendar: WorkCalendar;
  /** Who is at the keyboard. It goes on every event. */
  readonly actor: string;
  /** The clock, injected so a test can hold time still. */
  readonly now: () => string;
}

export interface RegisterOptions {
  readonly file: string;
  readonly policy?: Partial<ProgramPolicy>;
  readonly calendar?: WorkCalendar;
  readonly actor?: string;
  readonly now?: () => string;
  readonly calendarYears?: { from: number; to: number };
}

export function openRegister(options: RegisterOptions): Result<Register, string> {
  const db = openDatabase({ file: options.file });
  const now = options.now ?? ((): string => new Date().toISOString());
  const applied = migrate(db, now());
  if (!applied.ok) {
    closeDatabase(db);
    return err(applied.error);
  }
  const years = options.calendarYears ?? { from: 2015, to: 2045 };
  return ok({
    db,
    policy: mergePolicy(options.policy),
    calendar: options.calendar ?? buildCalendar('program office', years.from, years.to),
    actor: options.actor ?? 'unknown',
    now,
  });
}

export function closeRegister(register: Register): void {
  closeDatabase(register.db);
}

export function mergePolicy(overrides: Partial<ProgramPolicy> | undefined): ProgramPolicy {
  if (overrides === undefined) {
    return DEFAULT_PROGRAM_POLICY;
  }
  return {
    ...DEFAULT_PROGRAM_POLICY,
    ...overrides,
    cycle: { ...DEFAULT_PROGRAM_POLICY.cycle, ...(overrides.cycle ?? {}) },
    letter: { ...DEFAULT_PROGRAM_POLICY.letter, ...(overrides.letter ?? {}) },
  };
}

/** A register that is the same in every way but the clerk at the keyboard. */
export function asActor(register: Register, actor: string): Register {
  return { ...register, actor };
}

/**
 * The next id of a shape, read from the table that holds them. The scan is
 * cheap at the size a program office runs at and it survives a store that was
 * loaded from somebody else's export.
 */
export function mintId(
  register: Register,
  shape: IdShape,
  table: string,
  column: string,
): string {
  const rows = selectAll<Record<string, string>>(
    register.db,
    `select ${column} from ${table} where ${column} like ?`,
    [`${shape.prefix}-%`],
  );
  let highest = 0;
  for (const row of rows) {
    const value = row[column];
    if (value === undefined) {
      continue;
    }
    const parsed = parseId(shape, value);
    if (parsed.ok && parsed.value > highest) {
      highest = parsed.value;
    }
  }
  return formatId(shape, highest + 1);
}

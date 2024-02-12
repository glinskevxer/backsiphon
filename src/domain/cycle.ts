/**
 * When the next test is due.
 *
 * The anniversary is the last test that both passed and was accepted. A
 * refused report does not move it, and neither does a failing one. That is why
 * the due date is worked out from a passing date rather than from the last
 * time anybody visited.
 */

import { addMonths, type CivilDate } from '../util/dates';
import { addWorkdays, type WorkCalendar } from '../util/workdays';
import type { HazardDegree } from './hazard';

export interface CyclePolicy {
  /** The ordinary interval between tests. */
  readonly intervalMonths: number;
  /** The tighter interval for premises the purveyor watches more closely. */
  readonly closeWatchIntervalMonths: number;
  /** Premise use codes put on the tighter interval whatever else is true. */
  readonly closeWatchUses: ReadonlyArray<string>;
  /** Days after an installation before the first test has to be in. */
  readonly newInstallGraceDays: number;
  /** Working days a customer gets to put a failed assembly right. */
  readonly repairWorkdays: number;
}

export const DEFAULT_CYCLE_POLICY: CyclePolicy = {
  intervalMonths: 12,
  closeWatchIntervalMonths: 6,
  closeWatchUses: ['HOSPITAL', 'WWTP', 'MARINA', 'FOOD_PROC'],
  newInstallGraceDays: 10,
  repairWorkdays: 5,
};

export type DueBasis = 'first_test' | 'anniversary' | 'repair' | 'not_due';

export interface DueDate {
  readonly due: CivilDate;
  readonly basis: DueBasis;
  readonly intervalMonths: number;
  readonly note: string;
}

export interface CycleInput {
  readonly installedOn: CivilDate;
  /** The last test that passed and was accepted, if there has ever been one. */
  readonly lastPassingTestOn?: CivilDate;
  readonly containmentDegree: HazardDegree;
  readonly premiseUseCode: string;
  readonly policy: CyclePolicy;
}

/**
 * How long this connection gets between tests. A health hazard on a premise
 * the purveyor watches closely is tested twice a year. A health hazard
 * anywhere else is tested yearly like everything else, because the interval is
 * about how fast a fault would matter, not about how bad the water is.
 */
export function intervalMonthsFor(
  containmentDegree: HazardDegree,
  premiseUseCode: string,
  policy: CyclePolicy,
): number {
  const closeWatch =
    containmentDegree === 'health' && policy.closeWatchUses.includes(premiseUseCode);
  return closeWatch ? policy.closeWatchIntervalMonths : policy.intervalMonths;
}

export function nextTestDue(input: CycleInput): DueDate {
  const intervalMonths = intervalMonthsFor(
    input.containmentDegree,
    input.premiseUseCode,
    input.policy,
  );

  if (input.lastPassingTestOn === undefined) {
    const due = addDaysToDate(input.installedOn, input.policy.newInstallGraceDays);
    return {
      due,
      basis: 'first_test',
      intervalMonths,
      note: `never tested, so the first test was due ${input.policy.newInstallGraceDays} days after it went in`,
    };
  }

  return {
    due: addMonths(input.lastPassingTestOn, intervalMonths),
    basis: 'anniversary',
    intervalMonths,
    note: `${intervalMonths} months from the passing test of ${input.lastPassingTestOn}`,
  };
}

/**
 * The date a failed assembly has to be back in service by. This replaces the
 * anniversary while it is open, and it is counted in working days because the
 * customer needs a tester on site to close it.
 */
export function retestDue(
  failedOn: CivilDate,
  calendar: WorkCalendar,
  policy: CyclePolicy,
): DueDate {
  return {
    due: addWorkdays(calendar, failedOn, policy.repairWorkdays),
    basis: 'repair',
    intervalMonths: 0,
    note: `${policy.repairWorkdays} working days from the failed test of ${failedOn}`,
  };
}

export function isOverdue(due: DueDate, asOf: CivilDate): boolean {
  return due.basis !== 'not_due' && asOf > due.due;
}

export function daysOverdue(due: DueDate, asOf: CivilDate): number {
  if (!isOverdue(due, asOf)) {
    return 0;
  }
  return differenceInDays(due.due, asOf);
}

function addDaysToDate(date: CivilDate, days: number): CivilDate {
  const instant = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(instant).toISOString().slice(0, 10);
}

function differenceInDays(from: CivilDate, to: CivilDate): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

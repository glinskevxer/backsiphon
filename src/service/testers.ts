/**
 * How the testers are doing.
 *
 * The office is not grading them on pass rates. A tester who finds a lot of
 * failures is doing the job. What it is looking for is paperwork: reports that
 * arrive after the window, reports on a gauge that was out of calibration, and
 * a pass rate so high it cannot be true.
 */

import { daysBetween, type CivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import { certificationStatus, type CertificationStatus } from '../domain/tester';
import { findTester, listTesters } from '../storage/repositories/testers';
import { reportsFiledBy } from '../storage/repositories/reports';
import type { Register } from './register';

export interface TesterRecord {
  readonly testerId: string;
  readonly name: string;
  readonly standing: CertificationStatus;
  readonly filed: number;
  readonly accepted: number;
  readonly refused: number;
  readonly passed: number;
  readonly failed: number;
  readonly repairs: number;
  /** Mean days between the test and the paperwork arriving. */
  readonly meanFilingDays: number;
  readonly worstFilingDays: number;
  readonly refusalCodes: ReadonlyArray<string>;
}

export function testerRecord(
  register: Register,
  testerId: string,
  asOf: CivilDate,
): Result<TesterRecord, string> {
  const tester = findTester(register.db, testerId);
  if (tester === undefined) {
    return err(`there is no tester with the id ${testerId}`);
  }
  const reports = reportsFiledBy(register.db, testerId);
  const accepted = reports.filter((stored) => stored.admissible);
  const filingDays = reports.map((stored) =>
    daysBetween(stored.report.testedOn, stored.report.filedOn),
  );
  const codes = new Set<string>();
  for (const stored of reports) {
    for (const code of stored.inadmissibleCodes) {
      codes.add(code);
    }
  }

  return ok({
    testerId,
    name: tester.name,
    standing: certificationStatus(tester, asOf),
    filed: reports.length,
    accepted: accepted.length,
    refused: reports.length - accepted.length,
    passed: accepted.filter((stored) => stored.outcome === 'pass').length,
    failed: accepted.filter((stored) => stored.outcome === 'fail').length,
    repairs: reports.filter((stored) => stored.report.repairMade).length,
    meanFilingDays: filingDays.length === 0 ? 0 : round(mean(filingDays)),
    worstFilingDays: filingDays.length === 0 ? 0 : Math.max(...filingDays),
    refusalCodes: [...codes].sort(),
  });
}

export function testerRoster(register: Register, asOf: CivilDate): TesterRecord[] {
  const records: TesterRecord[] = [];
  for (const tester of listTesters(register.db)) {
    const record = testerRecord(register, tester.testerId, asOf);
    if (record.ok) {
      records.push(record.value);
    }
  }
  return records.sort((left, right) => right.filed - left.filed);
}

/**
 * A rate the office reads with suspicion. Nobody tests four hundred assemblies
 * and finds nothing wrong with any of them.
 */
export function passRate(record: TesterRecord): number | undefined {
  return record.accepted === 0 ? undefined : round(record.passed / record.accepted);
}

function mean(values: ReadonlyArray<number>): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

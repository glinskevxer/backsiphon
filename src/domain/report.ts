/**
 * The test report as it arrives.
 *
 * A tester fills the form in twice when something had to be put right: once
 * for what was found and once for what was left. The register keeps both,
 * because the as found readings are the evidence that the assembly had failed
 * and the as left readings are the evidence that it does not any more.
 *
 * Nothing in this module decides whether a reading passes. It decides whether
 * the form is a form.
 */

import { z } from 'zod';

import { isCivilDate, type CivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import type { AssemblyClass } from './assembly';
import { hasProcedure, requiredReadingKeys } from './procedure';

export type ReadingValue = number | boolean;
export type Readings = Readonly<Record<string, ReadingValue>>;

export interface TestReport {
  readonly reportId: string;
  readonly assemblyId: string;
  readonly testerId: string;
  readonly gaugeId: string;
  /** The class the tester found on the ground, which the procedure follows. */
  readonly assemblyClassTested: AssemblyClass;
  readonly testedOn: CivilDate;
  readonly filedOn: CivilDate;
  readonly asFound: Readings;
  readonly repairMade: boolean;
  readonly asLeft?: Readings;
  readonly repairNote?: string;
  readonly remarks?: string;
}

const CLASS_CODES = ['AG', 'RP', 'RPDA', 'DC', 'DCDA', 'PVB', 'SVB', 'AVB'] as const;

const readingsSchema = z.record(z.union([z.number().finite(), z.boolean()]));

const reportSchema = z.object({
  reportId: z.string().min(1),
  assemblyId: z.string().min(1),
  testerId: z.string().min(1),
  gaugeId: z.string().min(1),
  assemblyClassTested: z.enum(CLASS_CODES),
  testedOn: z.string(),
  filedOn: z.string(),
  asFound: readingsSchema,
  repairMade: z.boolean(),
  asLeft: readingsSchema.optional(),
  repairNote: z.string().optional(),
  remarks: z.string().optional(),
});

/**
 * Read an untrusted object into a report. Everything a contractor sends in
 * comes through here, so the errors are written to be read by whoever has to
 * ring them up about it.
 */
export function parseReport(input: unknown): Result<TestReport, string[]> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) {
    return err(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  const report = parsed.data as TestReport;
  const problems = structuralProblems(report);
  return problems.length === 0 ? ok(report) : err(problems);
}

/**
 * Everything wrong with the form that can be seen without reading a threshold.
 * A report can be structurally sound and still be a failing test, and it can
 * be a passing set of numbers on a form nobody can accept.
 */
export function structuralProblems(report: TestReport): string[] {
  const problems: string[] = [];

  if (!isCivilDate(report.testedOn)) {
    problems.push(`testedOn: "${report.testedOn}" is not a date of the form YYYY-MM-DD`);
  }
  if (!isCivilDate(report.filedOn)) {
    problems.push(`filedOn: "${report.filedOn}" is not a date of the form YYYY-MM-DD`);
  }
  if (
    isCivilDate(report.testedOn) &&
    isCivilDate(report.filedOn) &&
    report.filedOn < report.testedOn
  ) {
    problems.push('filedOn: a report cannot be filed before the test it reports');
  }
  if (!hasProcedure(report.assemblyClassTested)) {
    problems.push(
      `assemblyClassTested: there is no field procedure for a ${report.assemblyClassTested}`,
    );
  }
  if (report.repairMade && report.asLeft === undefined) {
    problems.push('asLeft: a repair was made and no as left readings were filed');
  }
  if (!report.repairMade && report.asLeft !== undefined) {
    problems.push('asLeft: as left readings were filed and no repair was reported');
  }
  if (report.repairMade && (report.repairNote ?? '').trim() === '') {
    problems.push('repairNote: a repair has to say what was done');
  }
  return problems;
}

/** Reading keys the procedure wants and the phase does not carry. */
export function missingReadings(assemblyClass: AssemblyClass, readings: Readings): string[] {
  return requiredReadingKeys(assemblyClass).filter((key) => readings[key] === undefined);
}

/** Reading keys the phase carries and the procedure has no place for. */
export function strayReadings(assemblyClass: AssemblyClass, readings: Readings): string[] {
  const wanted = new Set(requiredReadingKeys(assemblyClass));
  return Object.keys(readings)
    .filter((key) => !wanted.has(key))
    .sort();
}

/** The readings the register will judge: the as left set once there is one. */
export function effectiveReadings(report: TestReport): Readings {
  return report.asLeft ?? report.asFound;
}

export function numericReading(readings: Readings, key: string): number | undefined {
  const value = readings[key];
  return typeof value === 'number' ? value : undefined;
}

export function booleanReading(readings: Readings, key: string): boolean | undefined {
  const value = readings[key];
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Taking a batch of test reports off a contractor.
 *
 * A testing contractor with forty accounts does not type them in one at a
 * time. They send a file at the end of the month, and the office wants three
 * numbers out of it: what went on the register, what was refused and why, and
 * which rows it could not read at all. A row it cannot read is never guessed
 * at, because a guessed reading is a passing test the office cannot defend.
 */

import { parseCsv, toRecords } from '../util/csv';
import { withTransaction } from '../storage/db';
import { isCivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import type { Readings } from '../domain/report';
import { fileReport, type FilingOutcome } from './filing';
import type { Register } from './register';

/** Columns that are not readings. Everything else is one. */
const FIXED_COLUMNS = ['assembly', 'tester', 'gauge', 'tested', 'filed', 'repair', 'remarks'];

const FOUND_PREFIX = 'found.';
const LEFT_PREFIX = 'left.';

export interface ImportedRow {
  readonly line: number;
  readonly assemblyId: string;
  readonly outcome: FilingOutcome;
}

export interface RejectedRow {
  readonly line: number;
  readonly reason: string;
}

export interface ImportSummary {
  readonly filed: ReadonlyArray<ImportedRow>;
  readonly rejected: ReadonlyArray<RejectedRow>;
  readonly accepted: number;
  readonly refused: number;
  readonly passed: number;
}

export interface ImportOptions {
  /**
   * Read the file and say what would happen without writing anything. The
   * rows are checked in the same order and by the same code, so a dry run that
   * comes back clean is a promise about the real one.
   */
  readonly dryRun?: boolean;
}

export function importReportsCsv(
  register: Register,
  text: string,
  options: ImportOptions = {},
): Result<ImportSummary, string> {
  const table = parseCsv(text);
  if (!table.ok) {
    return err(table.error);
  }
  const missing = ['assembly', 'tester', 'gauge', 'tested'].filter(
    (column) => !table.value.headers.map((header) => header.trim()).includes(column),
  );
  if (missing.length > 0) {
    return err(`the file has no ${missing.join(' or ')} column on it`);
  }

  const filed: ImportedRow[] = [];
  const rejected: RejectedRow[] = [];

  for (const [offset, record] of toRecords(table.value).entries()) {
    const line = offset + 2;
    const row = readRow(record);
    if (!row.ok) {
      rejected.push({ line, reason: row.error });
      continue;
    }
    const outcome = withRollback(register, options.dryRun === true, () =>
      fileReport(register, row.value),
    );
    if (!outcome.ok) {
      rejected.push({ line, reason: outcome.error });
      continue;
    }
    filed.push({ line, assemblyId: row.value.assemblyId, outcome: outcome.value });
  }

  return ok({
    filed,
    rejected,
    accepted: filed.filter((row) => row.outcome.ruling.admissible).length,
    refused: filed.filter((row) => !row.outcome.ruling.admissible).length,
    passed: filed.filter(
      (row) => row.outcome.ruling.admissible && row.outcome.evaluation.outcome === 'pass',
    ).length,
  });
}

/**
 * Run a filing and throw it away afterwards when this is a dry run. The work
 * has to happen for real to find out what the register would say, so it is
 * done inside a transaction that is then rolled back.
 */
function withRollback<T>(
  register: Register,
  rollback: boolean,
  work: () => Result<T, string>,
): Result<T, string> {
  if (!rollback) {
    return work();
  }
  let held: Result<T, string> | undefined;
  try {
    withTransaction(register.db, () => {
      held = work();
      throw new DryRun();
    });
  } catch (error) {
    if (!(error instanceof DryRun)) {
      throw error;
    }
  }
  return held ?? err('the dry run produced nothing at all');
}

class DryRun extends Error {}

interface RowInput {
  readonly assemblyId: string;
  readonly testerId: string;
  readonly gaugeId: string;
  readonly testedOn: string;
  readonly filedOn: string;
  readonly asFound: Readings;
  readonly repairMade: boolean;
  readonly asLeft?: Readings;
  readonly repairNote?: string;
  readonly remarks?: string;
}

function readRow(record: Record<string, string>): Result<RowInput, string> {
  const assemblyId = (record['assembly'] ?? '').trim();
  const testerId = (record['tester'] ?? '').trim();
  const gaugeId = (record['gauge'] ?? '').trim();
  const testedOn = (record['tested'] ?? '').trim();
  const filedOn = (record['filed'] ?? '').trim() === '' ? testedOn : (record['filed'] ?? '').trim();
  const repair = (record['repair'] ?? '').trim();
  const remarks = (record['remarks'] ?? '').trim();

  if (assemblyId === '' || testerId === '' || gaugeId === '') {
    return err('the row has no assembly, tester or gauge on it');
  }
  if (!isCivilDate(testedOn)) {
    return err(`"${testedOn}" is not a test date of the form YYYY-MM-DD`);
  }
  if (!isCivilDate(filedOn)) {
    return err(`"${filedOn}" is not a filing date of the form YYYY-MM-DD`);
  }

  const asFound = readReadings(record, FOUND_PREFIX);
  if (!asFound.ok) {
    return err(asFound.error);
  }
  const asLeft = readReadings(record, LEFT_PREFIX);
  if (!asLeft.ok) {
    return err(asLeft.error);
  }
  if (Object.keys(asFound.value).length === 0) {
    return err('the row carries no as found readings at all');
  }
  const hasLeft = Object.keys(asLeft.value).length > 0;
  if (hasLeft && repair === '') {
    return err('the row has as left readings on it and no repair note');
  }

  return ok({
    assemblyId,
    testerId,
    gaugeId,
    testedOn,
    filedOn,
    asFound: asFound.value,
    repairMade: repair !== '',
    ...(hasLeft ? { asLeft: asLeft.value } : {}),
    ...(repair === '' ? {} : { repairNote: repair }),
    ...(remarks === '' ? {} : { remarks }),
  });
}

function readReadings(record: Record<string, string>, prefix: string): Result<Readings, string> {
  const readings: Record<string, number | boolean> = {};
  for (const [column, raw] of Object.entries(record)) {
    if (!column.startsWith(prefix)) {
      if (!FIXED_COLUMNS.includes(column) && !column.startsWith(FOUND_PREFIX) && !column.startsWith(LEFT_PREFIX)) {
        return err(`the column ${column} is not one this file may carry`);
      }
      continue;
    }
    const key = column.slice(prefix.length).trim();
    const value = raw.trim().toLowerCase();
    if (key === '') {
      return err(`the column ${column} has no reading name on it`);
    }
    if (value === '') {
      continue;
    }
    if (value === 'yes' || value === 'no') {
      readings[key] = value === 'yes';
      continue;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return err(`"${raw}" in ${column} is neither a reading nor a yes or no`);
    }
    readings[key] = numeric;
  }
  return ok(readings);
}

export function describeImport(summary: ImportSummary): string {
  return (
    `${summary.filed.length} filed, ${summary.accepted} accepted, ` +
    `${summary.passed} of those passing, ${summary.refused} refused, ` +
    `${summary.rejected.length} rows unreadable`
  );
}

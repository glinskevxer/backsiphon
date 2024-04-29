/**
 * Filed test reports.
 *
 * A stored report carries three separate answers and keeps them separate: what
 * the tester wrote, whether the office could accept it, and what the readings
 * came to. A report that was refused still has its readings on file, because
 * the customer will ask what the tester found and the office has to be able to
 * say.
 */

import type { CivilDate } from '../../util/dates';
import { err, ok, type Result } from '../../util/result';
import type { AssemblyClass } from '../../domain/assembly';
import type { InadmissibilityCode } from '../../domain/admissibility';
import type { Outcome } from '../../domain/evaluation';
import type { Readings, TestReport } from '../../domain/report';
import { execute, selectAll, selectOne, withTransaction, type Database } from '../db';
import { describeConstraintError, fromFlag, fromList, toFlag, toList, toNullable } from '../rows';

export interface StoredReport {
  readonly report: TestReport;
  readonly admissible: boolean;
  readonly inadmissibleCodes: ReadonlyArray<InadmissibilityCode>;
  readonly outcome: Outcome;
  readonly asFoundOutcome: Outcome;
  readonly recordedAt: string;
}

interface ReportRow {
  report_id: string;
  assembly_id: string;
  tester_id: string;
  gauge_id: string;
  assembly_class_tested: AssemblyClass;
  tested_on: string;
  filed_on: string;
  repair_made: number;
  repair_note: string | null;
  remarks: string | null;
  admissible: number;
  inadmissible_codes: string;
  outcome: Outcome;
  as_found_outcome: Outcome;
  recorded_at: string;
}

interface ReadingRow {
  phase: 'as_found' | 'as_left';
  reading_key: string;
  numeric_value: number | null;
  flag_value: number | null;
}

const COLUMNS = `report_id, assembly_id, tester_id, gauge_id, assembly_class_tested, tested_on,
  filed_on, repair_made, repair_note, remarks, admissible, inadmissible_codes, outcome,
  as_found_outcome, recorded_at`;

function readingsOf(db: Database, reportId: string): { asFound: Readings; asLeft?: Readings } {
  const rows = selectAll<ReadingRow>(
    db,
    'select phase, reading_key, numeric_value, flag_value from report_readings where report_id = ?',
    [reportId],
  );
  const asFound: Record<string, number | boolean> = {};
  const asLeft: Record<string, number | boolean> = {};
  for (const row of rows) {
    const value = row.numeric_value === null ? fromFlag(row.flag_value) : row.numeric_value;
    if (row.phase === 'as_found') {
      asFound[row.reading_key] = value;
    } else {
      asLeft[row.reading_key] = value;
    }
  }
  const hasLeft = rows.some((row) => row.phase === 'as_left');
  return { asFound, ...(hasLeft ? { asLeft } : {}) };
}

function toStored(db: Database, row: ReportRow): StoredReport {
  const readings = readingsOf(db, row.report_id);
  return {
    report: {
      reportId: row.report_id,
      assemblyId: row.assembly_id,
      testerId: row.tester_id,
      gaugeId: row.gauge_id,
      assemblyClassTested: row.assembly_class_tested,
      testedOn: row.tested_on,
      filedOn: row.filed_on,
      asFound: readings.asFound,
      ...(readings.asLeft === undefined ? {} : { asLeft: readings.asLeft }),
      repairMade: fromFlag(row.repair_made),
      ...(row.repair_note === null ? {} : { repairNote: row.repair_note }),
      ...(row.remarks === null ? {} : { remarks: row.remarks }),
    },
    admissible: fromFlag(row.admissible),
    inadmissibleCodes: fromList(row.inadmissible_codes) as InadmissibilityCode[],
    outcome: row.outcome,
    asFoundOutcome: row.as_found_outcome,
    recordedAt: row.recorded_at,
  };
}

function writeReadings(
  db: Database,
  reportId: string,
  phase: 'as_found' | 'as_left',
  readings: Readings,
): void {
  for (const [key, value] of Object.entries(readings)) {
    execute(
      db,
      `insert into report_readings (report_id, phase, reading_key, numeric_value, flag_value)
       values (?, ?, ?, ?, ?)`,
      [
        reportId,
        phase,
        key,
        typeof value === 'number' ? value : null,
        typeof value === 'boolean' ? toFlag(value) : null,
      ],
    );
  }
}

export function insertReport(db: Database, stored: StoredReport): Result<StoredReport, string> {
  const { report } = stored;
  try {
    withTransaction(db, () => {
      execute(
        db,
        `insert into test_reports (${COLUMNS}) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          report.reportId,
          report.assemblyId,
          report.testerId,
          report.gaugeId,
          report.assemblyClassTested,
          report.testedOn,
          report.filedOn,
          toFlag(report.repairMade),
          toNullable(report.repairNote),
          toNullable(report.remarks),
          toFlag(stored.admissible),
          toList(stored.inadmissibleCodes),
          stored.outcome,
          stored.asFoundOutcome,
          stored.recordedAt,
        ],
      );
      writeReadings(db, report.reportId, 'as_found', report.asFound);
      if (report.asLeft !== undefined) {
        writeReadings(db, report.reportId, 'as_left', report.asLeft);
      }
    });
    return ok(stored);
  } catch (error) {
    return err(describeConstraintError(error, `the report ${report.reportId}`));
  }
}

export function findReport(db: Database, reportId: string): StoredReport | undefined {
  const row = selectOne<ReportRow>(db, `select ${COLUMNS} from test_reports where report_id = ?`, [
    reportId,
  ]);
  return row === undefined ? undefined : toStored(db, row);
}

export function reportsForAssembly(db: Database, assemblyId: string): StoredReport[] {
  return selectAll<ReportRow>(
    db,
    `select ${COLUMNS} from test_reports where assembly_id = ?
     order by tested_on desc, report_id desc`,
    [assemblyId],
  ).map((row) => toStored(db, row));
}

/**
 * The date the cycle runs from: the most recent test that both passed and was
 * accepted. A marginal one does not count, and neither does a refused one
 * however good the readings were.
 */
export function lastPassingTest(
  db: Database,
  assemblyId: string,
  asOf?: CivilDate,
): StoredReport | undefined {
  const clause = asOf === undefined ? '' : 'and tested_on <= ?';
  const params = asOf === undefined ? [assemblyId] : [assemblyId, asOf];
  const row = selectOne<ReportRow>(
    db,
    `select ${COLUMNS} from test_reports
     where assembly_id = ? and admissible = 1 and outcome = 'pass' ${clause}
     order by tested_on desc, report_id desc limit 1`,
    params,
  );
  return row === undefined ? undefined : toStored(db, row);
}

export function lastFailingTest(
  db: Database,
  assemblyId: string,
  asOf?: CivilDate,
): StoredReport | undefined {
  const clause = asOf === undefined ? '' : 'and tested_on <= ?';
  const params = asOf === undefined ? [assemblyId] : [assemblyId, asOf];
  const row = selectOne<ReportRow>(
    db,
    `select ${COLUMNS} from test_reports
     where assembly_id = ? and admissible = 1 and outcome in ('fail', 'marginal') ${clause}
     order by tested_on desc, report_id desc limit 1`,
    params,
  );
  return row === undefined ? undefined : toStored(db, row);
}

export function reportsFiledBy(db: Database, testerId: string): StoredReport[] {
  return selectAll<ReportRow>(
    db,
    `select ${COLUMNS} from test_reports where tester_id = ? order by tested_on desc`,
    [testerId],
  ).map((row) => toStored(db, row));
}

export function countReports(db: Database): number {
  return selectOne<{ total: number }>(db, 'select count(*) as total from test_reports')?.total ?? 0;
}

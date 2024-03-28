/**
 * Surveys, kept as the register read them.
 *
 * The stored row is the assessment rather than the raw form: the degrees, the
 * flags and the basis. That is deliberate. The rules that produced them can
 * change, and when they do the office wants to know what it decided at the
 * time, not what it would decide now. Re-reading an old survey under new rules
 * is a separate job with a separate audit line.
 */

import type { CivilDate } from '../../util/dates';
import { err, ok, type Result } from '../../util/result';
import type { HazardDegree } from '../../domain/hazard';
import type { AssessmentBasis } from '../../domain/survey';
import { execute, selectAll, selectOne, withTransaction, type Database } from '../db';
import { describeConstraintError, fromFlag, toFlag, toNullable } from '../rows';

export interface SurveyRow {
  readonly surveyId: string;
  readonly connectionId: string;
  readonly surveyedOn: CivilDate;
  readonly surveyor: string;
  readonly accessGranted: boolean;
  readonly premiseUseCode: string;
  readonly containmentDegree: HazardDegree;
  readonly isolationDegree: HazardDegree;
  readonly airGapRequired: boolean;
  readonly backpressure: boolean;
  readonly basis: AssessmentBasis;
  readonly nextSurveyDue: CivilDate;
  readonly findingCodes: ReadonlyArray<string>;
  readonly note?: string;
  readonly recordedAt: string;
}

interface RawSurvey {
  survey_id: string;
  connection_id: string;
  surveyed_on: string;
  surveyor: string;
  access_granted: number;
  premise_use_code: string;
  containment_degree: HazardDegree;
  isolation_degree: HazardDegree;
  air_gap_required: number;
  backpressure: number;
  basis: AssessmentBasis;
  next_survey_due: string;
  note: string | null;
  recorded_at: string;
}

const COLUMNS = `survey_id, connection_id, surveyed_on, surveyor, access_granted, premise_use_code,
  containment_degree, isolation_degree, air_gap_required, backpressure, basis, next_survey_due,
  note, recorded_at`;

function toRecord(row: RawSurvey, findingCodes: string[]): SurveyRow {
  return {
    surveyId: row.survey_id,
    connectionId: row.connection_id,
    surveyedOn: row.surveyed_on,
    surveyor: row.surveyor,
    accessGranted: fromFlag(row.access_granted),
    premiseUseCode: row.premise_use_code,
    containmentDegree: row.containment_degree,
    isolationDegree: row.isolation_degree,
    airGapRequired: fromFlag(row.air_gap_required),
    backpressure: fromFlag(row.backpressure),
    basis: row.basis,
    nextSurveyDue: row.next_survey_due,
    findingCodes,
    ...(row.note === null ? {} : { note: row.note }),
    recordedAt: row.recorded_at,
  };
}

function findingsOf(db: Database, surveyId: string): string[] {
  return selectAll<{ finding_code: string }>(
    db,
    'select finding_code from survey_findings where survey_id = ? order by finding_code',
    [surveyId],
  ).map((row) => row.finding_code);
}

export function insertSurvey(db: Database, survey: SurveyRow): Result<SurveyRow, string> {
  try {
    withTransaction(db, () => {
      execute(
        db,
        `insert into surveys (${COLUMNS}) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          survey.surveyId,
          survey.connectionId,
          survey.surveyedOn,
          survey.surveyor,
          toFlag(survey.accessGranted),
          survey.premiseUseCode,
          survey.containmentDegree,
          survey.isolationDegree,
          toFlag(survey.airGapRequired),
          toFlag(survey.backpressure),
          survey.basis,
          survey.nextSurveyDue,
          toNullable(survey.note),
          survey.recordedAt,
        ],
      );
      for (const code of survey.findingCodes) {
        execute(db, 'insert into survey_findings (survey_id, finding_code) values (?, ?)', [
          survey.surveyId,
          code,
        ]);
      }
    });
    return ok(survey);
  } catch (error) {
    return err(describeConstraintError(error, `the survey ${survey.surveyId}`));
  }
}

export function findSurvey(db: Database, surveyId: string): SurveyRow | undefined {
  const row = selectOne<RawSurvey>(db, `select ${COLUMNS} from surveys where survey_id = ?`, [
    surveyId,
  ]);
  return row === undefined ? undefined : toRecord(row, findingsOf(db, surveyId));
}

/** The survey the register is working from, which is the most recent one. */
export function currentSurvey(
  db: Database,
  connectionId: string,
  asOf?: CivilDate,
): SurveyRow | undefined {
  const clause = asOf === undefined ? '' : 'and surveyed_on <= ?';
  const params = asOf === undefined ? [connectionId] : [connectionId, asOf];
  const row = selectOne<RawSurvey>(
    db,
    `select ${COLUMNS} from surveys where connection_id = ? ${clause}
     order by surveyed_on desc, survey_id desc limit 1`,
    params,
  );
  return row === undefined ? undefined : toRecord(row, findingsOf(db, row.survey_id));
}

export function surveyHistory(db: Database, connectionId: string): SurveyRow[] {
  return selectAll<RawSurvey>(
    db,
    `select ${COLUMNS} from surveys where connection_id = ? order by surveyed_on desc, survey_id desc`,
    [connectionId],
  ).map((row) => toRecord(row, findingsOf(db, row.survey_id)));
}

/** Connections whose next survey has fallen due, worst degree first. */
export function surveysDue(db: Database, asOf: CivilDate): SurveyRow[] {
  return selectAll<RawSurvey>(
    db,
    `select ${COLUMNS} from surveys s
     where next_survey_due <= ?
       and not exists (
         select 1 from surveys later
         where later.connection_id = s.connection_id and later.surveyed_on > s.surveyed_on
       )
     order by next_survey_due`,
    [asOf],
  ).map((row) => toRecord(row, findingsOf(db, row.survey_id)));
}

export function countSurveys(db: Database, connectionId: string): number {
  return (
    selectOne<{ total: number }>(
      db,
      'select count(*) as total from surveys where connection_id = ?',
      [connectionId],
    )?.total ?? 0
  );
}

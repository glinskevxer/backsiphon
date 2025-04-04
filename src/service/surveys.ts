/**
 * Recording a survey.
 *
 * The use code comes off the connection rather than off the form. A surveyor
 * writes down what they saw, and what the premise is registered as is the
 * office's business, so a survey that disagrees with the file is a change of
 * tenant and goes through that door instead of this one.
 */

import { isCivilDate, type CivilDate } from '../util/dates';
import { SURVEY_ID } from '../util/ids';
import { err, ok, type Result } from '../util/result';
import { assess, type HazardAssessment } from '../domain/survey';
import { withTransaction } from '../storage/db';
import { findConnection, isInService } from '../storage/repositories/connections';
import { appendEvent } from '../storage/repositories/events';
import {
  currentSurvey,
  insertSurvey,
  surveysDue,
  type SurveyRow,
} from '../storage/repositories/surveys';
import { mintId, type Register } from './register';

export interface SurveyInput {
  readonly connectionId: string;
  readonly surveyedOn: CivilDate;
  readonly surveyor: string;
  readonly findingCodes: ReadonlyArray<string>;
  readonly accessGranted: boolean;
  readonly note?: string;
}

export interface RecordedSurvey {
  readonly survey: SurveyRow;
  readonly assessment: HazardAssessment;
  /** True where a later survey is already on file, so this one changes nothing. */
  readonly supersededByLater: boolean;
  /** How the containment degree moved, which is what a notice would quote. */
  readonly degreeChange?: string;
}

export function recordSurvey(
  register: Register,
  input: SurveyInput,
): Result<RecordedSurvey, string> {
  if (!isCivilDate(input.surveyedOn)) {
    return err(`"${input.surveyedOn}" is not a date of the form YYYY-MM-DD`);
  }
  const connection = findConnection(register.db, input.connectionId);
  if (connection === undefined) {
    return err(`there is no connection with the id ${input.connectionId}`);
  }
  if (!isInService(connection, input.surveyedOn)) {
    return err(`the connection ${input.connectionId} was not in service on ${input.surveyedOn}`);
  }

  const assessment = assess({
    connectionId: input.connectionId,
    premiseUseCode: connection.premiseUseCode,
    surveyedOn: input.surveyedOn,
    surveyor: input.surveyor,
    findingCodes: input.findingCodes,
    accessGranted: input.accessGranted,
    ...(input.note === undefined ? {} : { note: input.note }),
  });
  if (!assessment.ok) {
    return err(assessment.error);
  }

  const previous = currentSurvey(register.db, input.connectionId);
  const survey: SurveyRow = {
    surveyId: mintId(register, SURVEY_ID, 'surveys', 'survey_id'),
    connectionId: input.connectionId,
    surveyedOn: input.surveyedOn,
    surveyor: input.surveyor.trim(),
    accessGranted: input.accessGranted,
    premiseUseCode: connection.premiseUseCode,
    containmentDegree: assessment.value.containmentDegree,
    isolationDegree: assessment.value.isolationDegree,
    airGapRequired: assessment.value.airGapRequired,
    backpressure: assessment.value.backpressure,
    basis: assessment.value.basis,
    nextSurveyDue: assessment.value.nextSurveyDue,
    findingCodes: [...input.findingCodes],
    ...(input.note === undefined ? {} : { note: input.note }),
    recordedAt: register.now(),
  };

  return withTransaction(register.db, () => {
    const written = insertSurvey(register.db, survey);
    if (!written.ok) {
      return written;
    }
    const change =
      previous === undefined || previous.containmentDegree === survey.containmentDegree
        ? undefined
        : `${previous.containmentDegree} to ${survey.containmentDegree}`;
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'survey_recorded',
      subjectKind: 'connection',
      subjectId: input.connectionId,
      detail:
        `${survey.surveyId} walked by ${survey.surveyor}, containment ${survey.containmentDegree}` +
        (change === undefined ? '' : `, moved ${change}`),
    });
    return ok({
      survey,
      assessment: assessment.value,
      supersededByLater: previous !== undefined && previous.surveyedOn > survey.surveyedOn,
      ...(change === undefined ? {} : { degreeChange: change }),
    });
  });
}

/** The connections whose next survey has fallen due, soonest first. */
export function dueSurveys(register: Register, asOf: CivilDate): SurveyRow[] {
  return surveysDue(register.db, asOf);
}

/**
 * Connections that have never been walked at all. These are worse than an
 * overdue survey and they do not show up in the due list, because the due list
 * is built from surveys.
 */
export function neverSurveyed(register: Register): string[] {
  const rows = findUnsurveyed(register);
  return rows;
}

function findUnsurveyed(register: Register): string[] {
  const sql = `select connection_id from service_connections
     where disconnected_on is null
       and connection_id not in (select connection_id from surveys)
     order by connection_id`;
  const statement = register.db.prepare(sql);
  return (statement.all() as Array<{ connection_id: string }>).map((row) => row.connection_id);
}

/**
 * Letters asking for a survey appointment.
 *
 * These are not notices. Nothing is overdue and nobody is in trouble: the
 * office is asking to come and walk the premise, because the interval has run
 * out or because nobody has ever been. They are kept on the trail rather than
 * in the notices table for exactly that reason, and because the notice ladder
 * must never be climbed by a letter that is not about a test.
 */

import { addDays, type CivilDate } from '../util/dates';
import { ok, type Result } from '../util/result';
import { listConnections, type ConnectionRecord } from '../storage/repositories/connections';
import { currentSurvey } from '../storage/repositories/surveys';
import { appendEvent, eventsFor } from '../storage/repositories/events';
import { premiseUseByCode } from '../domain/premise';
import { describeLetterRun, summarise } from './letters';
import type { Register } from './register';

export type SurveyReason = 'never_walked' | 'interval_expired' | 'use_changed';

export interface SurveyLetter {
  readonly connectionId: string;
  readonly accountNumber: string;
  readonly premiseName: string;
  readonly address: string;
  readonly reason: SurveyReason;
  readonly lastWalked?: CivilDate;
  readonly dueOn?: CivilDate;
  readonly body: string;
}

export interface SurveyLetterRun {
  readonly letters: ReadonlyArray<SurveyLetter>;
  readonly skipped: ReadonlyArray<{ connectionId: string; reason: string }>;
  readonly considered: number;
}

/** Do not write to the same customer about a survey twice inside this many days. */
export const SURVEY_LETTER_QUIET_DAYS = 45;

export interface SurveyLetterOptions {
  readonly asOf: CivilDate;
  readonly route?: string;
  readonly dryRun?: boolean;
}

export function runSurveyLetters(
  register: Register,
  options: SurveyLetterOptions,
): Result<SurveyLetterRun, string> {
  const letters: SurveyLetter[] = [];
  const skipped: Array<{ connectionId: string; reason: string }> = [];
  const quietSince = addDays(options.asOf, -SURVEY_LETTER_QUIET_DAYS);

  const connections = listConnections(register.db, {
    activeOn: options.asOf,
    ...(options.route === undefined ? {} : { route: options.route }),
  });

  for (const connection of connections) {
    const survey = currentSurvey(register.db, connection.connectionId, options.asOf);
    const reason: SurveyReason | undefined =
      survey === undefined
        ? 'never_walked'
        : survey.premiseUseCode !== connection.premiseUseCode
          ? 'use_changed'
          : survey.nextSurveyDue <= options.asOf
            ? 'interval_expired'
            : undefined;
    if (reason === undefined) {
      continue;
    }

    const written = eventsFor(register.db, 'connection', connection.connectionId).filter(
      (event) => event.kind === 'survey_letter' && event.happenedAt.slice(0, 10) >= quietSince,
    );
    if (written.length > 0) {
      skipped.push({
        connectionId: connection.connectionId,
        reason: `a survey letter went out on ${written[0]?.happenedAt.slice(0, 10) ?? 'a recent day'}`,
      });
      continue;
    }

    const letter: SurveyLetter = {
      connectionId: connection.connectionId,
      accountNumber: connection.accountNumber,
      premiseName: connection.premiseName,
      address: connection.premiseAddress,
      reason,
      ...(survey === undefined ? {} : { lastWalked: survey.surveyedOn, dueOn: survey.nextSurveyDue }),
      body: letterBody(register, connection, reason, survey?.surveyedOn),
    };
    letters.push(letter);

    if (options.dryRun === true) {
      continue;
    }
    appendEvent(register.db, {
      happenedAt: `${options.asOf}T00:00:00Z`,
      actor: register.actor,
      kind: 'survey_letter',
      subjectKind: 'connection',
      subjectId: connection.connectionId,
      detail: `${reason}, written to ${connection.accountNumber}`,
    });
  }

  return ok({ letters, skipped, considered: connections.length });
}

function letterBody(
  register: Register,
  connection: ConnectionRecord,
  reason: SurveyReason,
  lastWalked: CivilDate | undefined,
): string {
  const use = premiseUseByCode(connection.premiseUseCode);
  const lines = [
    register.policy.letter.heading ??
      `${register.policy.purveyorName} cross connection control program`,
    `account ${connection.accountNumber}, ${connection.premiseName}, ${connection.premiseAddress}`,
  ];
  if (reason === 'never_walked') {
    lines.push('our records do not show a hazard survey of this premise at all');
  } else if (reason === 'use_changed') {
    lines.push(
      `the premise is now registered as ${use.ok ? use.value.label : connection.premiseUseCode}, ` +
        'and the survey on file was made against what it used to be',
    );
  } else {
    lines.push(`the last survey of this premise was on ${lastWalked ?? 'a date we cannot read'}`);
  }
  lines.push('please telephone the program office to arrange a time for a surveyor to attend');
  lines.push('there is no charge for the survey and it takes about half an hour');
  if (register.policy.letter.footer !== undefined) {
    lines.push(register.policy.letter.footer);
  }
  return lines.join('\n');
}

export function describeSurveyRun(run: SurveyLetterRun): string {
  return describeLetterRun(
    summarise(
      run.considered,
      run.letters.map((letter) => letter.reason),
      run.skipped.length,
    ),
  );
}

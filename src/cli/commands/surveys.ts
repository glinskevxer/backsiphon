/**
 * Commands about hazard surveys.
 */

import type { Command } from 'commander';

import { err, ok } from '../../util/result';
import { HAZARD_FINDINGS } from '../../domain/hazard';
import { dueSurveys, neverSurveyed, recordSurvey } from '../../service/surveys';
import { currentSurvey, surveyHistory, type SurveyRow } from '../../storage/repositories/surveys';
import { bullet, describe, heading, table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, report } from '../shared';

function splitCodes(value: string | undefined): string[] {
  if (value === undefined || value.trim() === '') {
    return [];
  }
  return value
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => code !== '');
}

export function registerSurveyCommands(program: Command, io: CliIo, runner: Runner): void {
  const survey = program.command('survey').description('walk a premise and record what is on it');

  survey
    .command('record')
    .description('record a survey against a connection')
    .argument('<connection>', 'the connection id')
    .requiredOption('--on <date>', 'the day it was walked')
    .requiredOption('--surveyor <name>', 'who walked it')
    .option('--findings <codes>', 'finding codes, separated by commas')
    .option('--refused', 'the surveyor was kept out')
    .option('--note <note>', 'anything worth keeping')
    .action((connectionId: string, options: Record<string, string | boolean | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        recordSurvey(context.register, {
          connectionId,
          surveyedOn: String(options['on']),
          surveyor: String(options['surveyor']),
          findingCodes: splitCodes(options['findings'] as string | undefined),
          accessGranted: options['refused'] !== true,
          ...(options['note'] === undefined ? {} : { note: String(options['note']) }),
        }),
      );
      report(io, outcome, (recorded) => {
        io.out(
          `${recorded.survey.surveyId} recorded, containment ${recorded.survey.containmentDegree}` +
            `, isolation ${recorded.survey.isolationDegree}`,
        );
        if (recorded.degreeChange !== undefined) {
          io.out(`the containment degree moved ${recorded.degreeChange}`);
        }
        if (recorded.supersededByLater) {
          io.out('a later survey is already on file, so this one changes nothing today');
        }
        io.out(`the next survey is due ${recorded.survey.nextSurveyDue}`);
      });
    });

  survey
    .command('show')
    .description('show the survey the register is working from')
    .argument('<connection>', 'the connection id')
    .option('--history', 'show every survey rather than the current one')
    .action((connectionId: string, options: Record<string, boolean | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        if (options['history'] === true) {
          return ok({ context, rows: surveyHistory(context.register.db, connectionId) });
        }
        const current = currentSurvey(context.register.db, connectionId, context.asOf);
        return current === undefined
          ? err(`the connection ${connectionId} has never been surveyed`)
          : ok({ context, rows: [current] });
      });
      report(io, outcome, ({ context, rows }) => {
        if (context.json) {
          writeJson(io, rows);
          return;
        }
        if (options['history'] === true) {
          for (const line of table(rows, [
            { header: 'survey', value: (row: SurveyRow) => row.surveyId },
            { header: 'walked', value: (row: SurveyRow) => row.surveyedOn },
            { header: 'surveyor', value: (row: SurveyRow) => row.surveyor },
            { header: 'containment', value: (row: SurveyRow) => row.containmentDegree },
            { header: 'isolation', value: (row: SurveyRow) => row.isolationDegree },
            { header: 'next due', value: (row: SurveyRow) => row.nextSurveyDue },
          ])) {
            io.out(line);
          }
          return;
        }
        const row = rows[0];
        if (row === undefined) {
          return;
        }
        for (const line of describe([
          ['survey', row.surveyId],
          ['walked', row.surveyedOn],
          ['surveyor', row.surveyor],
          ['access granted', row.accessGranted],
          ['premise use', row.premiseUseCode],
          ['containment', row.containmentDegree],
          ['isolation', row.isolationDegree],
          ['air gap required', row.airGapRequired],
          ['backpressure', row.backpressure],
          ['basis', row.basis],
          ['next survey due', row.nextSurveyDue],
        ])) {
          io.out(line);
        }
        if (row.findingCodes.length > 0) {
          io.out('findings');
          for (const line of bullet(row.findingCodes.map(describeFinding))) {
            io.out(line);
          }
        }
      });
    });

  survey
    .command('due')
    .description('the surveys that have fallen due')
    .action((_options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({
          context,
          rows: dueSurveys(context.register, context.asOf),
          unwalked: neverSurveyed(context.register),
        }),
      );
      report(io, outcome, ({ context, rows, unwalked }) => {
        if (context.json) {
          writeJson(io, { due: rows, neverSurveyed: unwalked });
          return;
        }
        for (const line of heading('surveys due')) {
          io.out(line);
        }
        for (const line of table(rows, [
          { header: 'connection', value: (row: SurveyRow) => row.connectionId },
          { header: 'last walked', value: (row: SurveyRow) => row.surveyedOn },
          { header: 'due', value: (row: SurveyRow) => row.nextSurveyDue },
          { header: 'containment', value: (row: SurveyRow) => row.containmentDegree },
        ])) {
          io.out(line);
        }
        if (unwalked.length > 0) {
          io.out('');
          for (const line of heading('never walked at all')) {
            io.out(line);
          }
          for (const line of bullet(unwalked)) {
            io.out(line);
          }
        }
      });
    });

  survey
    .command('findings')
    .description('the finding codes a surveyor may write down')
    .action((_options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) => ok(context));
      report(io, outcome, (context) => {
        if (context.json) {
          writeJson(io, HAZARD_FINDINGS);
          return;
        }
        for (const line of table(HAZARD_FINDINGS, [
          { header: 'code', value: (row) => row.code },
          { header: 'degree', value: (row) => row.degree },
          { header: 'scopes', value: (row) => row.scopes.join(' ') },
          { header: 'what it is', value: (row) => row.label },
        ])) {
          io.out(line);
        }
      });
    });
}

function describeFinding(code: string): string {
  const finding = HAZARD_FINDINGS.find((candidate) => candidate.code === code);
  return finding === undefined ? code : `${code}, ${finding.label}`;
}

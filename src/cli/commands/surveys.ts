/**
 * Commands about hazard surveys.
 */

import type { Command } from 'commander';

import { err, ok } from '../../util/result';
import { HAZARD_FINDINGS } from '../../domain/hazard';
import { PREMISE_USES } from '../../domain/premise';
import { dueSurveys, neverSurveyed, recordSurvey } from '../../service/surveys';
import {
  describeSurveyRun,
  runSurveyLetters,
  type SurveyLetter,
} from '../../service/survey-letters';
import { currentSurvey, surveyHistory, type SurveyRow } from '../../storage/repositories/surveys';
import { bullet, describe, heading, table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, printLines, report } from '../shared';

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
    .action(
      (
        connectionId: string,
        options: Record<string, string | boolean | undefined>,
        command: Command,
      ) => {
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
      },
    );

  survey
    .command('show')
    .description('show the survey the register is working from')
    .argument('<connection>', 'the connection id')
    .option('--history', 'show every survey rather than the current one')
    .action(
      (connectionId: string, options: Record<string, boolean | undefined>, command: Command) => {
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
            printLines(
              io,
              table(rows, [
                { header: 'survey', value: (row: SurveyRow) => row.surveyId },
                { header: 'walked', value: (row: SurveyRow) => row.surveyedOn },
                { header: 'surveyor', value: (row: SurveyRow) => row.surveyor },
                { header: 'containment', value: (row: SurveyRow) => row.containmentDegree },
                { header: 'isolation', value: (row: SurveyRow) => row.isolationDegree },
                { header: 'next due', value: (row: SurveyRow) => row.nextSurveyDue },
              ]),
            );
            return;
          }
          const row = rows[0];
          if (row === undefined) {
            return;
          }
          printLines(
            io,
            describe([
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
            ]),
          );
          if (row.findingCodes.length > 0) {
            io.out('findings');
            printLines(io, bullet(row.findingCodes.map(describeFinding)));
          }
        });
      },
    );

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
        printLines(io, heading('surveys due'));
        printLines(
          io,
          table(rows, [
            { header: 'connection', value: (row: SurveyRow) => row.connectionId },
            { header: 'last walked', value: (row: SurveyRow) => row.surveyedOn },
            { header: 'due', value: (row: SurveyRow) => row.nextSurveyDue },
            { header: 'containment', value: (row: SurveyRow) => row.containmentDegree },
          ]),
        );
        if (unwalked.length > 0) {
          io.out('');
          printLines(io, heading('never walked at all'));
          printLines(io, bullet(unwalked));
        }
      });
    });

  survey
    .command('letters')
    .description('write to the customers whose premise needs walking')
    .option('--dry-run', 'work them out without writing anything')
    .option('--route <route>', 'only this route')
    .option('--body', 'print the text of the first letter')
    .action((options: Record<string, string | boolean | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const run = runSurveyLetters(context.register, {
          asOf: context.asOf,
          ...(options['dryRun'] === true ? { dryRun: true } : {}),
          ...(options['route'] === undefined ? {} : { route: String(options['route']) }),
        });
        return run.ok ? ok({ context, run: run.value }) : run;
      });
      report(io, outcome, ({ context, run }) => {
        if (context.json) {
          writeJson(io, run);
          return;
        }
        io.out(describeSurveyRun(run));
        if (options['dryRun'] === true) {
          io.out('this was a dry run, nothing was written');
        }
        printLines(
          io,
          table(run.letters, [
            { header: 'connection', value: (row: SurveyLetter) => row.connectionId },
            { header: 'account', value: (row: SurveyLetter) => row.accountNumber },
            { header: 'premise', value: (row: SurveyLetter) => row.premiseName },
            { header: 'why', value: (row: SurveyLetter) => row.reason },
            { header: 'last walked', value: (row: SurveyLetter) => row.lastWalked },
          ]),
        );
        const first = run.letters[0];
        if (options['body'] === true && first !== undefined) {
          io.out('');
          printLines(io, first.body.split('\n'));
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
        printLines(
          io,
          table(HAZARD_FINDINGS, [
            { header: 'code', value: (row) => row.code },
            { header: 'degree', value: (row) => row.degree },
            { header: 'scopes', value: (row) => row.scopes.join(' ') },
            { header: 'what it is', value: (row) => row.label },
          ]),
        );
      });
    });
}

function describeFinding(code: string): string {
  const finding = HAZARD_FINDINGS.find((candidate) => candidate.code === code);
  return finding === undefined ? code : `${code}, ${finding.label}`;
}

/** Print the premise use table, which a clerk needs when opening a connection. */
export function registerPremiseUseCommand(program: Command, io: CliIo, runner: Runner): void {
  program
    .command('uses')
    .description('the premise use codes and what each one carries on its own')
    .action((_options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) => ok(context));
      report(io, outcome, (context) => {
        if (context.json) {
          writeJson(io, PREMISE_USES);
          return;
        }
        printLines(
          io,
          table(PREMISE_USES, [
            { header: 'code', value: (row) => row.code },
            { header: 'what it is', value: (row) => row.label },
            { header: 'carries', value: (row) => row.categoricalDegree },
            { header: 'survey every', value: (row) => `${row.surveyIntervalMonths} months` },
            { header: 'walked', value: (row) => (row.surveyRefused ? 'never' : 'yes') },
          ]),
        );
      });
    });
}

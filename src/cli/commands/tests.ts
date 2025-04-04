/**
 * Filing a test report from the command line.
 *
 * Readings come in as `--reading key=value` and are the only place the command
 * line has to parse something with a shape. A tightness step is a yes or a no
 * and everything else is a number, and the two are told apart here rather than
 * being guessed at further down.
 */

import type { Command } from 'commander';

import { err, ok, type Result } from '../../util/result';
import type { Readings } from '../../domain/report';
import { fileReport } from '../../service/filing';
import { requiredReadingKeys } from '../../domain/procedure';
import { findAssembly } from '../../storage/repositories/assemblies';
import { reportsForAssembly, type StoredReport } from '../../storage/repositories/reports';
import { bullet, table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, report } from '../shared';

const TRUE_WORDS = ['yes', 'y', 'true', 'held', 'tight'];
const FALSE_WORDS = ['no', 'n', 'false', 'weeping', 'leaking'];

export function parseReadings(pairs: ReadonlyArray<string>): Result<Readings, string> {
  const readings: Record<string, number | boolean> = {};
  for (const pair of pairs) {
    const index = pair.indexOf('=');
    if (index < 1) {
      return err(`"${pair}" is not a reading, write it as key=value`);
    }
    const key = pair.slice(0, index).trim();
    const raw = pair
      .slice(index + 1)
      .trim()
      .toLowerCase();
    if (key === '') {
      return err(`"${pair}" has no reading name on it`);
    }
    if (key in readings) {
      return err(`${key} is on the form twice`);
    }
    if (TRUE_WORDS.includes(raw)) {
      readings[key] = true;
      continue;
    }
    if (FALSE_WORDS.includes(raw)) {
      readings[key] = false;
      continue;
    }
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value)) {
      return err(`"${raw}" is not a reading, it has to be a number or a yes or no`);
    }
    readings[key] = value;
  }
  return ok(readings);
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function registerTestCommands(program: Command, io: CliIo, runner: Runner): void {
  const test = program.command('test').description('field test reports');

  test
    .command('file')
    .description('file a test report against an assembly')
    .argument('<assembly>', 'the assembly id')
    .requiredOption('--tester <id>', 'who tested it')
    .requiredOption('--gauge <id>', 'the gauge they used')
    .requiredOption('--on <date>', 'the day of the test')
    .option('--filed <date>', 'the day the paperwork arrived, today by default')
    .option('--reading <key=value>', 'an as found reading, repeat for each', collect, [])
    .option('--as-left <key=value>', 'an as left reading, repeat for each', collect, [])
    .option('--repair <note>', 'what was put right')
    .option('--remarks <note>', 'anything else on the form')
    .action((assemblyId: string, options: Record<string, unknown>, command: Command) => {
      const asFound = parseReadings(options['reading'] as string[]);
      if (!asFound.ok) {
        io.err(asFound.error);
        return;
      }
      const asLeftPairs = options['asLeft'] as string[];
      const asLeft = parseReadings(asLeftPairs);
      if (!asLeft.ok) {
        io.err(asLeft.error);
        return;
      }
      const repair = options['repair'] as string | undefined;

      const outcome = runner(globals(command), io, (context) =>
        fileReport(context.register, {
          assemblyId,
          testerId: String(options['tester']),
          gaugeId: String(options['gauge']),
          testedOn: String(options['on']),
          filedOn: options['filed'] === undefined ? context.asOf : String(options['filed']),
          asFound: asFound.value,
          repairMade: repair !== undefined,
          ...(asLeftPairs.length === 0 ? {} : { asLeft: asLeft.value }),
          ...(repair === undefined ? {} : { repairNote: repair }),
          ...(options['remarks'] === undefined ? {} : { remarks: String(options['remarks']) }),
        }),
      );

      report(io, outcome, (filed) => {
        io.out(`${filed.stored.report.reportId} filed`);
        if (!filed.ruling.admissible) {
          io.out('the office cannot accept this report, so the assembly is still untested');
          for (const line of bullet(filed.ruling.reasons.map((reason) => reason.detail))) {
            io.out(line);
          }
          return;
        }
        io.out(
          `the readings come to ${filed.evaluation.outcome} on the ${filed.evaluation.phase} set`,
        );
        for (const line of bullet(filed.evaluation.judgements.map((judgement) => judgement.note))) {
          io.out(line);
        }
        if (filed.noticesCleared > 0) {
          io.out(`${filed.noticesCleared} open notices cleared`);
        }
      });
    });

  test
    .command('history')
    .description('the reports filed against an assembly')
    .argument('<assembly>', 'the assembly id')
    .action((assemblyId: string, _options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const assembly = findAssembly(context.register.db, assemblyId);
        if (assembly === undefined) {
          return err(`there is no assembly with the id ${assemblyId}`);
        }
        return ok({ context, rows: reportsForAssembly(context.register.db, assemblyId) });
      });
      report(io, outcome, ({ context, rows }) => {
        if (context.json) {
          writeJson(io, rows);
          return;
        }
        for (const line of table(rows, [
          { header: 'report', value: (row: StoredReport) => row.report.reportId },
          { header: 'tested', value: (row: StoredReport) => row.report.testedOn },
          { header: 'tester', value: (row: StoredReport) => row.report.testerId },
          { header: 'accepted', value: (row: StoredReport) => row.admissible },
          { header: 'outcome', value: (row: StoredReport) => row.outcome },
          { header: 'as found', value: (row: StoredReport) => row.asFoundOutcome },
          {
            header: 'refused because',
            value: (row: StoredReport) => row.inadmissibleCodes.join(' '),
          },
        ])) {
          io.out(line);
        }
      });
    });

  test
    .command('form')
    .description('the readings a procedure asks for')
    .argument('<class>', 'the assembly class')
    .action((assemblyClass: string, _options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, () => {
        const keys = requiredReadingKeys(
          assemblyClass as Parameters<typeof requiredReadingKeys>[0],
        );
        return keys.length === 0
          ? err(`there is no field procedure for a ${assemblyClass}`)
          : ok(keys);
      });
      report(io, outcome, (keys) => {
        io.out(`a ${assemblyClass} report carries`);
        for (const line of bullet(keys)) {
          io.out(line);
        }
      });
    });
}

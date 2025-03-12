/**
 * Showing what the office is running under.
 */

import type { Command } from 'commander';

import { ok } from '../../util/result';
import { CONFIG_FILENAME } from '../../service/config';
import { loadDemoDistrict } from '../../service/demo';
import { manualSections } from '../../service/manual';
import { writeCsv } from '../../util/csv';
import { describe, heading, table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, report } from '../shared';

export function registerConfigCommands(program: Command, io: CliIo, runner: Runner): void {
  program
    .command('manual')
    .description('print the reference tables the rules are read from')
    .option('--section <title>', 'only the section whose title starts with this')
    .option('--csv', 'write each section as a comma separated table')
    .action((options: Record<string, string | boolean | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) => ok(context));
      report(io, outcome, (context) => {
        const wanted = options['section'];
        const sections = manualSections().filter(
          (section) => wanted === undefined || section.title.startsWith(String(wanted)),
        );
        if (context.json) {
          writeJson(io, sections);
          return;
        }
        for (const section of sections) {
          for (const line of heading(section.title)) {
            io.out(line);
          }
          if (options['csv'] === true) {
            for (const line of writeCsv(section.headers, section.rows).split('\n')) {
              io.out(line);
            }
          } else {
            const columns = section.headers.map((header, index) => ({
              header,
              value: (row: ReadonlyArray<string>): string => row[index] ?? '',
            }));
            for (const line of table(section.rows, columns)) {
              io.out(line);
            }
          }
          io.out('');
        }
      });
    });

  program
    .command('demo')
    .description('fill an empty register with a small district to train on')
    .action((_options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const loaded = loadDemoDistrict(context.register, context.asOf);
        return loaded.ok ? ok({ context, loaded: loaded.value }) : loaded;
      });
      report(io, outcome, ({ context, loaded }) => {
        if (context.json) {
          writeJson(io, loaded);
          return;
        }
        for (const line of describe([
          ['connections', loaded.connections],
          ['assemblies fitted', loaded.assemblies],
          ['reports filed', loaded.reports],
          ['letters that went out', loaded.notices],
        ])) {
          io.out(line);
        }
      });
    });

  program
    .command('config')
    .description(`show the policy in force and where it came from`)
    .action((_options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) => ok(context));
      report(io, outcome, (context) => {
        const policy = context.register.policy;
        if (context.json) {
          writeJson(io, { configFile: context.configFile ?? null, policy });
          return;
        }
        for (const line of heading('settings')) {
          io.out(line);
        }
        for (const line of describe([
          ['config file', context.configFile ?? `none found, looked for ${CONFIG_FILENAME}`],
          ['purveyor', policy.purveyorName],
          ['filing window days', policy.filingWindowDays],
          ['survey a new connection within', policy.newConnectionSurveyDays],
        ])) {
          io.out(line);
        }
        io.out('');
        for (const line of heading('test cycle')) {
          io.out(line);
        }
        for (const line of describe([
          ['interval months', policy.cycle.intervalMonths],
          ['close watch months', policy.cycle.closeWatchIntervalMonths],
          ['close watch uses', policy.cycle.closeWatchUses.join(' ')],
          ['days to the first test', policy.cycle.newInstallGraceDays],
          ['working days to repair', policy.cycle.repairWorkdays],
        ])) {
          io.out(line);
        }
      });
    });
}

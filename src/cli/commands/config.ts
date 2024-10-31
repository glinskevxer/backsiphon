/**
 * Showing what the office is running under.
 */

import type { Command } from 'commander';

import { ok } from '../../util/result';
import { CONFIG_FILENAME } from '../../service/config';
import { describe, heading, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, report } from '../shared';

export function registerConfigCommands(program: Command, io: CliIo, runner: Runner): void {
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

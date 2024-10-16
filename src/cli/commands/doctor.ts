/**
 * The command that goes looking for trouble.
 */

import type { Command } from 'commander';

import { ok } from '../../util/result';
import { examine, type Finding } from '../../service/doctor';
import { table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, report } from '../shared';

export function registerDoctorCommands(program: Command, io: CliIo, runner: Runner): void {
  program
    .command('doctor')
    .description('look for the things the store will hold and the office should not')
    .option('--faults-only', 'only the findings that are outright wrong')
    .action((options: Record<string, boolean | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({ context, examination: examine(context.register, context.asOf) }),
      );
      report(io, outcome, ({ context, examination }) => {
        const findings =
          options['faultsOnly'] === true
            ? examination.findings.filter((finding) => finding.severity === 'fault')
            : examination.findings;
        if (context.json) {
          writeJson(io, { ...examination, findings });
          return;
        }
        if (findings.length === 0) {
          io.out('nothing to report');
          return;
        }
        for (const line of table(findings, [
          { header: 'severity', value: (row: Finding) => row.severity },
          { header: 'check', value: (row: Finding) => row.check },
          { header: 'subject', value: (row: Finding) => row.subject },
          { header: 'detail', value: (row: Finding) => row.detail },
        ])) {
          io.out(line);
        }
        io.out('');
        io.out(`${examination.faults} faults, ${examination.warnings} warnings`);
      });
    });
}

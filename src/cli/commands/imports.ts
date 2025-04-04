/**
 * Taking a contractor's file in.
 */

import { readFileSync } from 'node:fs';

import type { Command } from 'commander';

import { err, ok } from '../../util/result';
import { describeImport, importReportsCsv } from '../../service/imports';
import { describeConnectionImport, importConnectionsCsv } from '../../service/connection-import';
import { table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, report } from '../shared';

export function registerImportCommands(program: Command, io: CliIo, runner: Runner): void {
  program
    .command('import-connections')
    .description('take the district in from the billing system')
    .argument('<file>', 'the csv file it exported')
    .option('--update', 'write changes onto the accounts that are already on file')
    .action((file: string, options: Record<string, boolean | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        let text: string;
        try {
          text = readFileSync(file, 'utf8');
        } catch (error) {
          return err(
            `${file} could not be read: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        const summary = importConnectionsCsv(context.register, text, {
          ...(options['update'] === true ? { update: true } : {}),
        });
        return summary.ok ? ok({ context, summary: summary.value }) : summary;
      });
      report(io, outcome, ({ context, summary }) => {
        if (context.json) {
          writeJson(io, summary);
          return;
        }
        io.out(describeConnectionImport(summary));
        if (summary.rejected.length > 0) {
          io.out('');
          for (const line of table(summary.rejected, [
            { header: 'line', value: (row) => row.line, align: 'right' },
            { header: 'why', value: (row) => row.reason },
          ])) {
            io.out(line);
          }
        }
      });
    });

  program
    .command('import')
    .description('take a batch of test reports off a contractor file')
    .argument('<file>', 'the csv file they sent')
    .option('--dry-run', 'say what would happen without writing anything')
    .action((file: string, options: Record<string, boolean | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        let text: string;
        try {
          text = readFileSync(file, 'utf8');
        } catch (error) {
          return err(
            `${file} could not be read: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        const summary = importReportsCsv(context.register, text, {
          ...(options['dryRun'] === true ? { dryRun: true } : {}),
        });
        return summary.ok ? ok({ context, summary: summary.value }) : summary;
      });
      report(io, outcome, ({ context, summary }) => {
        if (context.json) {
          writeJson(io, summary);
          return;
        }
        io.out(describeImport(summary));
        if (options['dryRun'] === true) {
          io.out('this was a dry run, nothing was written');
        }
        const refused = summary.filed.filter((row) => !row.outcome.ruling.admissible);
        if (refused.length > 0) {
          io.out('');
          io.out('refused, so those assemblies are still untested');
          for (const line of table(refused, [
            { header: 'line', value: (row) => row.line, align: 'right' },
            { header: 'assembly', value: (row) => row.assemblyId },
            {
              header: 'because',
              value: (row) => row.outcome.ruling.reasons.map((reason) => reason.code).join(' '),
            },
          ])) {
            io.out(line);
          }
        }
        if (summary.rejected.length > 0) {
          io.out('');
          io.out('rows nobody could read');
          for (const line of table(summary.rejected, [
            { header: 'line', value: (row) => row.line, align: 'right' },
            { header: 'why', value: (row) => row.reason },
          ])) {
            io.out(line);
          }
        }
      });
    });
}

/**
 * Writing an export out.
 */

import { writeFileSync } from 'node:fs';

import type { Command } from 'commander';

import { ok } from '../../util/result';
import { buildExport, EXPORT_NAMES, toCsv, toRecords } from '../../service/exports';
import { writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, printLines, report } from '../shared';

export function registerExportCommands(program: Command, io: CliIo, runner: Runner): void {
  program
    .command('export')
    .description(`write one of ${EXPORT_NAMES.join(', ')} out`)
    .argument('<name>', 'which export')
    .option('--to <file>', 'write to a file rather than the terminal')
    .action((name: string, options: Record<string, string | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const table = buildExport(context.register, name, context.asOf);
        return table.ok ? ok({ context, table: table.value }) : table;
      });
      report(io, outcome, ({ context, table }) => {
        if (context.json) {
          const records = toRecords(table);
          if (options['to'] === undefined) {
            writeJson(io, records);
            return;
          }
          writeFileSync(String(options['to']), `${JSON.stringify(records, undefined, 2)}\n`);
          io.out(`${records.length} rows written to ${String(options['to'])}`);
          return;
        }
        const text = toCsv(table);
        if (options['to'] === undefined) {
          printLines(io, text.split('\n'));
          return;
        }
        writeFileSync(String(options['to']), `${text}\n`);
        io.out(`${table.rows.length} rows written to ${String(options['to'])}`);
      });
    });
}

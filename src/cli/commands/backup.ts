/**
 * Copying the register, and asking sqlite whether it is sound.
 */

import type { Command } from 'commander';

import { ok } from '../../util/result';
import { backupTo, checkIntegrity } from '../../service/backup';
import { describe, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, report } from '../shared';

export function registerBackupCommands(program: Command, io: CliIo, runner: Runner): void {
  program
    .command('backup')
    .description('write a consistent copy of the register somewhere else')
    .argument('<file>', 'where to write it')
    .action((file: string, _options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const written = backupTo(context.register, file);
        return written.ok ? ok({ context, written: written.value }) : written;
      });
      report(io, outcome, ({ context, written }) => {
        if (context.json) {
          writeJson(io, written);
          return;
        }
        for (const line of describe([
          ['written to', written.file],
          ['bytes', written.bytes],
          ['pages', written.pages],
          ['schema', written.schemaVersion],
        ])) {
          io.out(line);
        }
      });
    });

  program
    .command('verify')
    .description('ask sqlite whether the file itself is sound')
    .action((_options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({ context, integrity: checkIntegrity(context.register) }),
      );
      report(io, outcome, ({ context, integrity }) => {
        if (context.json) {
          writeJson(io, integrity);
          return;
        }
        io.out(integrity.ok ? 'the file is sound' : 'the file has something wrong with it');
        for (const message of integrity.messages) {
          io.out(`  ${message}`);
        }
        if (integrity.foreignKeyProblems > 0) {
          io.out(`  ${integrity.foreignKeyProblems} rows point at something that is not there`);
        }
      });
    });
}

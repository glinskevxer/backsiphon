/**
 * The letter run, and reading back what has gone out.
 */

import type { Command } from 'commander';

import { ok } from '../../util/result';
import { cancelNotice, describeRun, runNotices } from '../../service/notices';
import {
  noticesForConnection,
  openNotices,
  type NoticeRecord,
} from '../../storage/repositories/notices';
import { heading, table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, printLines, report } from '../shared';

export function registerNoticeCommands(program: Command, io: CliIo, runner: Runner): void {
  const notice = program.command('notice').description('the letters that go out');

  notice
    .command('run')
    .description('work out and write the letters due today')
    .option('--dry-run', 'work them out without writing anything')
    .option('--route <route>', 'only this route')
    .option('--limit <count>', 'stop after this many letters')
    .action((options: Record<string, string | boolean | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const run = runNotices(context.register, {
          asOf: context.asOf,
          ...(options['dryRun'] === true ? { dryRun: true } : {}),
          ...(options['route'] === undefined ? {} : { route: String(options['route']) }),
          ...(options['limit'] === undefined ? {} : { limit: Number(options['limit']) }),
        });
        return run.ok ? ok({ context, run: run.value }) : run;
      });
      report(io, outcome, ({ context, run }) => {
        if (context.json) {
          writeJson(io, run);
          return;
        }
        io.out(describeRun(run));
        if (options['dryRun'] === true) {
          io.out('this was a dry run, nothing was written');
        }
        printLines(
          io,
          table(run.issued, [
            { header: 'notice', value: (row: NoticeRecord) => row.noticeId },
            { header: 'connection', value: (row: NoticeRecord) => row.connectionId },
            { header: 'stage', value: (row: NoticeRecord) => row.stage },
            { header: 'due', value: (row: NoticeRecord) => row.dueDate },
            { header: 'days past', value: (row: NoticeRecord) => row.daysPastDue, align: 'right' },
            { header: 'ladder', value: (row: NoticeRecord) => row.ladder },
          ]),
        );
        if (run.skipped.length > 0) {
          io.out('');
          printLines(io, heading('skipped'));
          for (const entry of run.skipped) {
            io.out(`  ${entry.connectionId}: ${entry.reason}`);
          }
        }
      });
    });

  notice
    .command('open')
    .description('the letters nobody has answered yet')
    .action((_options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({ context, rows: openNotices(context.register.db, context.asOf) }),
      );
      report(io, outcome, ({ context, rows }) => {
        if (context.json) {
          writeJson(io, rows);
          return;
        }
        printLines(
          io,
          table(rows, [
            { header: 'notice', value: (row: NoticeRecord) => row.noticeId },
            { header: 'connection', value: (row: NoticeRecord) => row.connectionId },
            { header: 'stage', value: (row: NoticeRecord) => row.stage },
            { header: 'issued', value: (row: NoticeRecord) => row.issuedOn },
            { header: 'due', value: (row: NoticeRecord) => row.dueDate },
          ]),
        );
      });
    });

  notice
    .command('cancel')
    .description('take a letter back')
    .argument('<id>', 'the notice id')
    .requiredOption('--on <date>', 'the day it was cancelled')
    .requiredOption('--reason <reason>', 'why')
    .action((id: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        cancelNotice(context.register, id, String(options['on']), String(options['reason'])),
      );
      report(io, outcome, (notice) => {
        io.out(`${notice.noticeId} cancelled on ${notice.clearedOn ?? 'an unknown day'}`);
        io.out('the letter stays on the file, the customer has a copy of it');
      });
    });

  notice
    .command('show')
    .description('the letters on one connection, and what they said')
    .argument('<connection>', 'the connection id')
    .option('--body', 'print the text of the most recent one')
    .action(
      (connectionId: string, options: Record<string, boolean | undefined>, command: Command) => {
        const outcome = runner(globals(command), io, (context) =>
          ok({ context, rows: noticesForConnection(context.register.db, connectionId) }),
        );
        report(io, outcome, ({ context, rows }) => {
          if (context.json) {
            writeJson(io, rows);
            return;
          }
          printLines(
            io,
            table(rows, [
              { header: 'notice', value: (row: NoticeRecord) => row.noticeId },
              { header: 'stage', value: (row: NoticeRecord) => row.stage },
              { header: 'issued', value: (row: NoticeRecord) => row.issuedOn },
              { header: 'cleared', value: (row: NoticeRecord) => row.clearedOn },
            ]),
          );
          const latest = rows[0];
          if (options['body'] === true && latest !== undefined) {
            io.out('');
            printLines(io, latest.body.split('\n'));
          }
        });
      },
    );
}

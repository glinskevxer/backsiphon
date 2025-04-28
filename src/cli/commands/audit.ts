/**
 * Reading the trail, and the one command that writes to it directly.
 *
 * A reinspection visit has no other record: nobody surveys, nobody tests, an
 * inspector drives out and finds the gate locked. It is a fact about the year
 * and the billing run counts it, so it goes on the trail as itself.
 */

import type { Command } from 'commander';

import { err, ok } from '../../util/result';
import { findConnection } from '../../storage/repositories/connections';
import {
  appendEvent,
  countEvents,
  eventKinds,
  eventsFor,
  recentEvents,
  type EventRecord,
  type SubjectKind,
} from '../../storage/repositories/events';
import { heading, table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, printLines, report } from '../shared';

const SUBJECT_KINDS: SubjectKind[] = [
  'connection',
  'survey',
  'assembly',
  'model',
  'tester',
  'gauge',
  'report',
  'notice',
  'variance',
];

export function registerAuditCommands(program: Command, io: CliIo, runner: Runner): void {
  const audit = program.command('audit').description('who changed what, and when');

  audit
    .command('trail')
    .description('the trail for one thing')
    .argument('<kind>', `one of ${SUBJECT_KINDS.join(', ')}`)
    .argument('<id>', 'its id')
    .action((kind: string, id: string, _options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        if (!SUBJECT_KINDS.includes(kind as SubjectKind)) {
          return err(`${kind} is not something the trail is kept against`);
        }
        return ok({ context, rows: eventsFor(context.register.db, kind as SubjectKind, id) });
      });
      report(io, outcome, ({ context, rows }) => {
        if (context.json) {
          writeJson(io, rows);
          return;
        }
        printLines(
          io,
          table(rows, [
            { header: 'when', value: (row: EventRecord) => row.happenedAt },
            { header: 'who', value: (row: EventRecord) => row.actor },
            { header: 'what', value: (row: EventRecord) => row.kind },
            { header: 'detail', value: (row: EventRecord) => row.detail },
          ]),
        );
      });
    });

  audit
    .command('recent')
    .description('the last things that happened')
    .option('--kind <kind>', 'only this kind of event')
    // not --actor, that is the global option naming the clerk at the keyboard
    .option('--by <name>', 'only events this clerk caused')
    .option('--since <timestamp>', 'only after this moment')
    .option('--limit <count>', 'how many to print', '25')
    .action((options: Record<string, string | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({
          context,
          rows: recentEvents(context.register.db, {
            ...(options['kind'] === undefined ? {} : { kind: String(options['kind']) }),
            ...(options['by'] === undefined ? {} : { actor: String(options['by']) }),
            ...(options['since'] === undefined ? {} : { since: String(options['since']) }),
            limit: Number(options['limit'] ?? 25),
          }),
        }),
      );
      report(io, outcome, ({ context, rows }) => {
        if (context.json) {
          writeJson(io, rows);
          return;
        }
        printLines(
          io,
          table(rows, [
            { header: 'when', value: (row: EventRecord) => row.happenedAt },
            { header: 'who', value: (row: EventRecord) => row.actor },
            { header: 'what', value: (row: EventRecord) => row.kind },
            { header: 'about', value: (row: EventRecord) => `${row.subjectKind} ${row.subjectId}` },
          ]),
        );
      });
    });

  audit
    .command('summary')
    .description('what the trail is made of')
    .action((_options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({
          context,
          kinds: eventKinds(context.register.db),
          total: countEvents(context.register.db),
        }),
      );
      report(io, outcome, ({ context, kinds, total }) => {
        if (context.json) {
          writeJson(io, { total, kinds });
          return;
        }
        printLines(io, heading(`${total} events on the trail`));
        printLines(
          io,
          table(kinds, [
            { header: 'kind', value: (row) => row.kind },
            { header: 'how many', value: (row) => row.total, align: 'right' },
          ]),
        );
      });
    });

  program
    .command('reinspection')
    .description('record a visit an inspector had to make')
    .argument('<connection>', 'the connection id')
    .requiredOption('--on <date>', 'the day of the visit')
    .requiredOption('--note <note>', 'what they found')
    .action((connectionId: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        if (findConnection(context.register.db, connectionId) === undefined) {
          return err(`there is no connection with the id ${connectionId}`);
        }
        return appendEvent(context.register.db, {
          happenedAt: `${String(options['on'])}T00:00:00Z`,
          actor: context.register.actor,
          kind: 'reinspection_visit',
          subjectKind: 'connection',
          subjectId: connectionId,
          detail: String(options['note']),
        });
      });
      report(io, outcome, (event) => {
        io.out(`visit recorded against ${event.subjectId} on ${event.happenedAt.slice(0, 10)}`);
        io.out('it goes on the next invoice');
      });
    });
}

/**
 * The contact commands.
 */

import type { Command } from 'commander';

import { err, ok } from '../../util/result';
import { findConnection } from '../../storage/repositories/connections';
import {
  contactsFor,
  CONTACT_ROLES,
  replaceContact,
  retireContact,
  whoToRing,
  type Contact,
  type ContactRole,
} from '../../storage/repositories/contacts';
import { appendEvent } from '../../storage/repositories/events';
import { withTransaction } from '../../storage/db';
import { CONTACT_ID } from '../../util/ids';
import { mintId } from '../../service/register';
import { describe, table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, printLines, report } from '../shared';

export function registerContactCommands(program: Command, io: CliIo, runner: Runner): void {
  const contact = program.command('contact').description('who to write to and who to telephone');

  contact
    .command('set')
    .description('put somebody in a role, retiring whoever was in it')
    .argument('<connection>', 'the connection id')
    .requiredOption('--role <role>', `one of ${CONTACT_ROLES.join(', ')}`)
    .requiredOption('--name <name>', 'their name')
    .requiredOption('--on <date>', 'the day they took the role')
    .option('--telephone <number>', 'a telephone number')
    .option('--email <address>', 'an email address')
    .option('--note <note>', 'anything worth knowing before ringing them')
    .action(
      (connectionId: string, options: Record<string, string | undefined>, command: Command) => {
        const outcome = runner(globals(command), io, (context) => {
          if (findConnection(context.register.db, connectionId) === undefined) {
            return err(`there is no connection with the id ${connectionId}`);
          }
          const role = String(options['role']) as ContactRole;
          if (!CONTACT_ROLES.includes(role)) {
            return err(`${role} is not a role, try ${CONTACT_ROLES.join(', ')}`);
          }
          const record: Contact = {
            contactId: mintId(context.register, CONTACT_ID, 'contacts', 'contact_id'),
            connectionId,
            role,
            name: String(options['name']),
            ...(options['telephone'] === undefined
              ? {}
              : { telephone: String(options['telephone']) }),
            ...(options['email'] === undefined ? {} : { email: String(options['email']) }),
            ...(options['note'] === undefined ? {} : { note: String(options['note']) }),
            addedOn: String(options['on']),
          };
          return withTransaction(context.register.db, () => {
            const written = replaceContact(context.register.db, record);
            if (!written.ok) {
              return written;
            }
            appendEvent(context.register.db, {
              happenedAt: context.register.now(),
              actor: context.register.actor,
              kind: 'contact_set',
              subjectKind: 'connection',
              subjectId: connectionId,
              detail: `${record.role}: ${record.name}`,
            });
            return written;
          });
        });
        report(io, outcome, (record) => {
          io.out(`${record.name} is the ${record.role} contact from ${record.addedOn}`);
        });
      },
    );

  contact
    .command('retire')
    .description('take somebody out of a role and put nobody in it')
    .argument('<id>', 'the contact id')
    .requiredOption('--on <date>', 'the day they left it')
    .action((contactId: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        retireContact(context.register.db, contactId, String(options['on'])),
      );
      report(io, outcome, (record) => {
        io.out(`${record.name} is no longer the ${record.role} contact`);
      });
    });

  contact
    .command('list')
    .description('the contacts on a connection')
    .argument('<connection>', 'the connection id')
    .option('--all', 'include the ones who have been retired')
    .action(
      (connectionId: string, options: Record<string, boolean | undefined>, command: Command) => {
        const outcome = runner(globals(command), io, (context) =>
          ok({
            context,
            rows: contactsFor(context.register.db, connectionId, options['all'] === true),
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
              { header: 'contact', value: (row: Contact) => row.contactId },
              { header: 'role', value: (row: Contact) => row.role },
              { header: 'name', value: (row: Contact) => row.name },
              { header: 'telephone', value: (row: Contact) => row.telephone },
              { header: 'email', value: (row: Contact) => row.email },
              { header: 'since', value: (row: Contact) => row.addedOn },
              { header: 'retired', value: (row: Contact) => row.retiredOn },
            ]),
          );
        });
      },
    );

  contact
    .command('ring')
    .description('who the office should telephone about this connection')
    .argument('<connection>', 'the connection id')
    .action((connectionId: string, _options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const found = whoToRing(context.register.db, connectionId);
        return found === undefined
          ? err(`there is nobody with a telephone number against ${connectionId}`)
          : ok({ context, contact: found });
      });
      report(io, outcome, ({ context, contact: found }) => {
        if (context.json) {
          writeJson(io, found);
          return;
        }
        printLines(
          io,
          describe([
            ['ring', found.name],
            ['role', found.role],
            ['telephone', found.telephone],
            ['note', found.note],
          ]),
        );
      });
    });
}

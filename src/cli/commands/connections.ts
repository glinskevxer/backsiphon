/**
 * Commands about service connections.
 */

import type { Command } from 'commander';

import { err, ok } from '../../util/result';
import { PREMISE_USES } from '../../domain/premise';
import {
  changePremiseUse,
  closeConnection,
  openConnection,
} from '../../service/connections';
import {
  findConnection,
  listConnections,
  type ConnectionRecord,
} from '../../storage/repositories/connections';
import { describe, table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, report } from '../shared';

export function registerConnectionCommands(program: Command, io: CliIo, runner: Runner): void {
  const connection = program
    .command('connection')
    .description('open, list and close service connections');

  connection
    .command('open')
    .description('open a connection on the register')
    .requiredOption('--account <number>', 'the account number the office says out loud')
    .requiredOption('--name <name>', 'what the premise is called')
    .requiredOption('--address <address>', 'where it is')
    .requiredOption('--use <code>', `premise use, one of ${PREMISE_USES.map((use) => use.code).join(', ')}`)
    .requiredOption('--size <inches>', 'service size in inches')
    .requiredOption('--on <date>', 'the day the service went in')
    .option('--route <route>', 'the reading route it sits on')
    .option('--fire', 'a dedicated fire line rather than a domestic service')
    .option('--unmetered', 'the purveyor does not meter this service')
    .option('--note <note>', 'anything the clerk wants on the file')
    .action((options: Record<string, string | boolean | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        openConnection(context.register, {
          accountNumber: String(options['account']),
          premiseName: String(options['name']),
          premiseAddress: String(options['address']),
          premiseUseCode: String(options['use']),
          serviceSizeInches: Number(options['size']),
          fireService: options['fire'] === true,
          purveyorMetered: options['unmetered'] !== true,
          connectedOn: String(options['on']),
          ...(options['route'] === undefined ? {} : { route: String(options['route']) }),
          ...(options['note'] === undefined ? {} : { note: String(options['note']) }),
        }),
      );
      report(io, outcome, (record) => {
        io.out(`opened ${record.connectionId} for account ${record.accountNumber}`);
      });
    });

  connection
    .command('list')
    .description('list the connections on the register')
    .option('--route <route>', 'only this route')
    .option('--use <code>', 'only this premise use')
    .option('--all', 'include the ones that have been disconnected')
    .action((options: Record<string, string | boolean | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({
          context,
          rows: listConnections(context.register.db, {
            ...(options['route'] === undefined ? {} : { route: String(options['route']) }),
            ...(options['use'] === undefined ? {} : { premiseUseCode: String(options['use']) }),
            ...(options['all'] === true ? {} : { activeOn: context.asOf }),
          }),
        }),
      );
      report(io, outcome, ({ context, rows }) => {
        if (context.json) {
          writeJson(io, rows);
          return;
        }
        for (const line of table(rows, [
          { header: 'id', value: (row: ConnectionRecord) => row.connectionId },
          { header: 'account', value: (row: ConnectionRecord) => row.accountNumber },
          { header: 'premise', value: (row: ConnectionRecord) => row.premiseName },
          { header: 'use', value: (row: ConnectionRecord) => row.premiseUseCode },
          { header: 'size', value: (row: ConnectionRecord) => row.serviceSizeInches, align: 'right' },
          { header: 'route', value: (row: ConnectionRecord) => row.route },
        ])) {
          io.out(line);
        }
      });
    });

  connection
    .command('show')
    .description('show one connection')
    .argument('<id>', 'the connection id')
    .action((id: string, _options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const record = findConnection(context.register.db, id);
        return record === undefined
          ? err(`there is no connection with the id ${id}`)
          : ok({ context, record });
      });
      report(io, outcome, ({ context, record }) => {
        if (context.json) {
          writeJson(io, record);
          return;
        }
        for (const line of describe([
          ['id', record.connectionId],
          ['account', record.accountNumber],
          ['premise', record.premiseName],
          ['address', record.premiseAddress],
          ['use', record.premiseUseCode],
          ['size', record.serviceSizeInches],
          ['fire service', record.fireService],
          ['purveyor metered', record.purveyorMetered],
          ['connected', record.connectedOn],
          ['disconnected', record.disconnectedOn],
          ['route', record.route],
          ['riser above outlet', record.outletElevationInches],
          ['indoor riser', record.indoorRiser],
        ])) {
          io.out(line);
        }
      });
    });

  connection
    .command('retenant')
    .description('record a change of premise use')
    .argument('<id>', 'the connection id')
    .requiredOption('--use <code>', 'the new premise use')
    .requiredOption('--on <date>', 'the day it changed')
    .option('--name <name>', 'the new premise name')
    .action((id: string, options: Record<string, string | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        changePremiseUse(context.register, id, {
          premiseUseCode: String(options['use']),
          on: String(options['on']),
          ...(options['name'] === undefined ? {} : { premiseName: String(options['name']) }),
        }),
      );
      report(io, outcome, (change) => {
        io.out(
          `${id} was ${change.previousUseCode} and is now ${change.connection.premiseUseCode}`,
        );
        if (change.resurveyNeeded) {
          io.out('the survey on file is against the old use, walk it again');
        }
      });
    });

  connection
    .command('close')
    .description('take a connection off the register')
    .argument('<id>', 'the connection id')
    .requiredOption('--on <date>', 'the day it came out')
    .requiredOption('--reason <reason>', 'why it came out')
    .action((id: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        closeConnection(context.register, id, String(options['on']), String(options['reason'])),
      );
      report(io, outcome, (record) => {
        io.out(`closed ${record.connectionId} on ${record.disconnectedOn ?? 'an unknown day'}`);
      });
    });
}

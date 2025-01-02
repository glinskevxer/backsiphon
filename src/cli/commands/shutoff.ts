/**
 * The shutoff commands. Four of them, one per step, so that nobody can turn a
 * customer off with a single line typed in a hurry.
 */

import type { Command } from 'commander';

import { ok } from '../../util/result';
import {
  cancelOrder,
  executeOrder,
  openOrders,
  ordersFor,
  raiseOrder,
  restoreOrder,
  type ShutoffOrder,
} from '../../service/shutoff';
import { table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, report } from '../shared';

export function registerShutoffCommands(program: Command, io: CliIo, runner: Runner): void {
  const shutoff = program.command('shutoff').description('shutoff orders and restorations');

  shutoff
    .command('raise')
    .description('raise an order against a connection that is eligible today')
    .argument('<connection>', 'the connection id')
    .requiredOption('--on <date>', 'the day the order is raised')
    .requiredOption('--reason <reason>', 'what it is for')
    .action((connectionId: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        raiseOrder(context.register, connectionId, String(options['on']), String(options['reason'])),
      );
      report(io, outcome, (order) => {
        io.out(`${order.orderId} raised against ${order.connectionId} by ${order.raisedBy}`);
        io.out(`the test it is about was due ${order.dueDate}`);
      });
    });

  shutoff
    .command('execute')
    .description('record that the crew went and the water is off')
    .argument('<order>', 'the order id')
    .requiredOption('--on <date>', 'the day they went')
    .requiredOption('--crew <crew>', 'who went')
    .action((orderId: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        executeOrder(context.register, orderId, String(options['on']), String(options['crew'])),
      );
      report(io, outcome, (order) => {
        io.out(`${order.orderId} carried out on ${order.executedOn ?? 'an unknown day'}`);
      });
    });

  shutoff
    .command('cancel')
    .description('call an order off before the crew goes')
    .argument('<order>', 'the order id')
    .requiredOption('--on <date>', 'the day it was called off')
    .requiredOption('--reason <reason>', 'why')
    .action((orderId: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        cancelOrder(context.register, orderId, String(options['on']), String(options['reason'])),
      );
      report(io, outcome, (order) => {
        io.out(`${order.orderId} called off on ${order.cancelledOn ?? 'an unknown day'}`);
      });
    });

  shutoff
    .command('restore')
    .description('put the water back, if the register agrees it may go back')
    .argument('<order>', 'the order id')
    .requiredOption('--on <date>', 'the day the water went back on')
    .requiredOption('--crew <crew>', 'who went')
    .option('--note <note>', 'anything the crew found')
    .action((orderId: string, options: Record<string, string | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        restoreOrder(
          context.register,
          orderId,
          String(options['on']),
          String(options['crew']),
          options['note'] === undefined ? undefined : String(options['note']),
        ),
      );
      report(io, outcome, (order) => {
        io.out(`${order.orderId} restored on ${order.restoredOn ?? 'an unknown day'}`);
      });
    });

  shutoff
    .command('list')
    .description('the orders that are open, or every order on one connection')
    .option('--connection <id>', 'only this connection, including the closed ones')
    .action((options: Record<string, string | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({
          context,
          rows:
            options['connection'] === undefined
              ? openOrders(context.register)
              : ordersFor(context.register, String(options['connection'])),
        }),
      );
      report(io, outcome, ({ context, rows }) => {
        if (context.json) {
          writeJson(io, rows);
          return;
        }
        for (const line of table(rows, [
          { header: 'order', value: (row: ShutoffOrder) => row.orderId },
          { header: 'connection', value: (row: ShutoffOrder) => row.connectionId },
          { header: 'raised', value: (row: ShutoffOrder) => row.raisedOn },
          { header: 'by', value: (row: ShutoffOrder) => row.raisedBy },
          { header: 'carried out', value: (row: ShutoffOrder) => row.executedOn },
          { header: 'restored', value: (row: ShutoffOrder) => row.restoredOn },
          { header: 'called off', value: (row: ShutoffOrder) => row.cancelledOn },
          { header: 'reason', value: (row: ShutoffOrder) => row.reason },
        ])) {
          io.out(line);
        }
      });
    });
}

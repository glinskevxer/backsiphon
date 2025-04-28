/**
 * Commands about money.
 */

import type { Command } from 'commander';

import { ok } from '../../util/result';
import { formatCents } from '../../domain/fees';
import {
  billingRun,
  describeInvoice,
  invoiceFor,
  type ConnectionInvoice,
} from '../../service/billing';
import { heading, table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, printLines, report } from '../shared';

export function registerBillingCommands(program: Command, io: CliIo, runner: Runner): void {
  const billing = program.command('billing').description('the annual fee and the penalties');

  billing
    .command('invoice')
    .description('what one connection owes')
    .argument('<connection>', 'the connection id')
    .action((connectionId: string, _options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const invoice = invoiceFor(context.register, connectionId, context.asOf);
        return invoice.ok ? ok({ context, invoice: invoice.value }) : invoice;
      });
      report(io, outcome, ({ context, invoice }) => {
        if (context.json) {
          writeJson(io, invoice);
          return;
        }
        printLines(io, heading(`${invoice.connectionId}, account ${invoice.accountNumber}`));
        io.out(`billed against a ${invoice.requiredClass ?? 'nothing required'}`);
        printLines(io, describeInvoice(invoice));
      });
    });

  billing
    .command('run')
    .description('the whole register, or one route of it')
    .option('--route <route>', 'only this route')
    .action((options: Record<string, string | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({
          context,
          run: billingRun(
            context.register,
            context.asOf,
            options['route'] === undefined ? undefined : String(options['route']),
          ),
        }),
      );
      report(io, outcome, ({ context, run }) => {
        if (context.json) {
          writeJson(io, run);
          return;
        }
        printLines(
          io,
          table(run.invoices, [
            { header: 'connection', value: (row: ConnectionInvoice) => row.connectionId },
            { header: 'account', value: (row: ConnectionInvoice) => row.accountNumber },
            { header: 'billed as', value: (row: ConnectionInvoice) => row.requiredClass ?? 'none' },
            { header: 'notice', value: (row: ConnectionInvoice) => row.stage },
            {
              header: 'total',
              value: (row: ConnectionInvoice) => formatCents(row.invoice.totalCents),
              align: 'right',
            },
          ]),
        );
        io.out('');
        io.out(`${run.invoices.length} invoices, ${formatCents(run.totalCents)} in total`);
        for (const entry of run.skipped) {
          io.out(`  ${entry.connectionId} not billed: ${entry.reason}`);
        }
      });
    });
}

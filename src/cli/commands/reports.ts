/**
 * The two commands that print numbers rather than records.
 */

import type { Command } from 'commander';

import { ok } from '../../util/result';
import { programSummary, workList, type WorkItem } from '../../service/reporting';
import { annualReturn, returnRows } from '../../service/annual';
import { writeCsv } from '../../util/csv';
import { describe, heading, table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, report } from '../shared';

function percent(value: number): string {
  return `${(value * 100).toFixed(1)} percent`;
}

export function registerReportCommands(program: Command, io: CliIo, runner: Runner): void {
  program
    .command('summary')
    .description('where the whole program stands')
    .action((_options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({ context, summary: programSummary(context.register, context.asOf) }),
      );
      report(io, outcome, ({ context, summary }) => {
        if (context.json) {
          writeJson(io, summary);
          return;
        }
        for (const line of heading(`the register as at ${summary.asOf}`)) {
          io.out(line);
        }
        for (const line of describe([
          ['connections', summary.connections],
          ['assemblies fitted', summary.assemblies],
          ['of those testable', summary.testableAssemblies],
          ['tested inside the cycle', percent(summary.complianceRate)],
          ['never surveyed', summary.neverSurveyed],
        ])) {
          io.out(line);
        }
        io.out('');
        for (const line of heading('standing')) {
          io.out(line);
        }
        for (const line of describe([
          ['compliant', summary.byStanding.compliant],
          ['nothing due yet', summary.byStanding.not_yet_due],
          ['overdue', summary.byStanding.overdue],
          ['deficient', summary.byStanding.deficient],
          ['eligible for shutoff', summary.byStanding.shutoff_eligible],
          ['could not be read', summary.byStanding.unreadable],
        ])) {
          io.out(line);
        }
        io.out('');
        for (const line of heading('containment hazard')) {
          io.out(line);
        }
        for (const line of describe([
          ['health', summary.byDegree.health],
          ['pollutional', summary.byDegree.nonhealth],
          ['none', summary.byDegree.none],
        ])) {
          io.out(line);
        }
        if (summary.shutoffEligible.length > 0) {
          io.out('');
          io.out(`shutoff eligible: ${summary.shutoffEligible.join(', ')}`);
        }
      });
    });

  program
    .command('annual')
    .description('the return the state asks for, for one calendar year')
    .argument('<year>', 'the reporting year')
    .option('--csv', 'write it as the state wants it rather than as columns')
    .action((year: string, options: Record<string, boolean | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const entry = annualReturn(context.register, Number(year));
        return entry.ok ? ok({ context, entry: entry.value }) : entry;
      });
      report(io, outcome, ({ context, entry }) => {
        if (context.json) {
          writeJson(io, entry);
          return;
        }
        const rows = returnRows(entry);
        if (options['csv'] === true) {
          const text = writeCsv(
            ['measure', 'value'],
            rows.map(([label, value]) => [label, String(value)]),
          );
          for (const line of text.split('\n')) {
            io.out(line);
          }
          return;
        }
        for (const line of heading(`return for ${entry.year}, as at ${entry.asOf}`)) {
          io.out(line);
        }
        for (const line of describe(rows)) {
          io.out(line);
        }
      });
    });

  program
    .command('worklist')
    .description('what somebody should go and do, in route order')
    .option('--route <route>', 'only this route')
    .option('--within <days>', 'look this many days ahead', '0')
    .action((options: Record<string, string | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({
          context,
          items: workList(context.register, {
            asOf: context.asOf,
            withinDays: Number(options['within'] ?? 0),
            ...(options['route'] === undefined ? {} : { route: String(options['route']) }),
          }),
        }),
      );
      report(io, outcome, ({ context, items }) => {
        if (context.json) {
          writeJson(io, items);
          return;
        }
        for (const line of table(items, [
          { header: 'route', value: (row: WorkItem) => row.route },
          { header: 'connection', value: (row: WorkItem) => row.connectionId },
          { header: 'account', value: (row: WorkItem) => row.accountNumber },
          { header: 'address', value: (row: WorkItem) => row.address },
          { header: 'assembly', value: (row: WorkItem) => row.assemblyId ?? 'none fitted' },
          { header: 'where', value: (row: WorkItem) => row.location },
          { header: 'due', value: (row: WorkItem) => row.due },
          { header: 'why', value: (row: WorkItem) => row.urgency },
        ])) {
          io.out(line);
        }
      });
    });
}

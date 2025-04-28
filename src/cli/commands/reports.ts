/**
 * The two commands that print numbers rather than records.
 */

import type { Command } from 'commander';

import { ok } from '../../util/result';
import { programSummary, workList, type WorkItem } from '../../service/reporting';
import { annualReturn, returnRows } from '../../service/annual';
import { drawSchedule, peakMonth, type ScheduleMonth } from '../../service/schedule';
import { writeCsv } from '../../util/csv';
import { describe, heading, table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, printLines, report } from '../shared';

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
        printLines(io, heading(`the register as at ${summary.asOf}`));
        printLines(
          io,
          describe([
            ['connections', summary.connections],
            ['assemblies fitted', summary.assemblies],
            ['of those testable', summary.testableAssemblies],
            ['tested inside the cycle', percent(summary.complianceRate)],
            ['never surveyed', summary.neverSurveyed],
          ]),
        );
        io.out('');
        printLines(io, heading('standing'));
        printLines(
          io,
          describe([
            ['compliant', summary.byStanding.compliant],
            ['nothing due yet', summary.byStanding.not_yet_due],
            ['overdue', summary.byStanding.overdue],
            ['deficient', summary.byStanding.deficient],
            ['eligible for shutoff', summary.byStanding.shutoff_eligible],
            ['could not be read', summary.byStanding.unreadable],
          ]),
        );
        io.out('');
        printLines(io, heading('containment hazard'));
        printLines(
          io,
          describe([
            ['health', summary.byDegree.health],
            ['pollutional', summary.byDegree.nonhealth],
            ['none', summary.byDegree.none],
          ]),
        );
        if (summary.shutoffEligible.length > 0) {
          io.out('');
          io.out(`shutoff eligible: ${summary.shutoffEligible.join(', ')}`);
        }
      });
    });

  program
    .command('schedule')
    .description('what falls due month by month for the year ahead')
    .option('--months <count>', 'how many months to draw', '12')
    .option('--route <route>', 'only this route')
    .action((options: Record<string, string | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({
          context,
          schedule: drawSchedule(context.register, {
            asOf: context.asOf,
            months: Number(options['months'] ?? 12),
            ...(options['route'] === undefined ? {} : { route: String(options['route']) }),
          }),
        }),
      );
      report(io, outcome, ({ context, schedule }) => {
        if (context.json) {
          writeJson(io, schedule);
          return;
        }
        printLines(io, heading(`tests falling due from ${schedule.from}`));
        printLines(
          io,
          table(schedule.months, [
            { header: 'month', value: (row: ScheduleMonth) => row.month },
            { header: 'tests due', value: (row: ScheduleMonth) => row.due, align: 'right' },
            {
              header: 'of those health hazard',
              value: (row: ScheduleMonth) => row.healthHazard,
              align: 'right',
            },
            {
              header: 'connections',
              value: (row: ScheduleMonth) => row.connections.length,
              align: 'right',
            },
          ]),
        );
        io.out('');
        const peak = peakMonth(schedule);
        if (peak !== undefined && peak.due > 0) {
          io.out(`the busiest month is ${peak.month} with ${peak.due} tests in it`);
        }
        io.out(`${schedule.alreadyLate} tests are already past due`);
        if (schedule.unreadable > 0) {
          io.out(`${schedule.unreadable} connections could not be read at all`);
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
          printLines(io, text.split('\n'));
          return;
        }
        printLines(io, heading(`return for ${entry.year}, as at ${entry.asOf}`));
        printLines(io, describe(rows));
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
        printLines(
          io,
          table(items, [
            { header: 'route', value: (row: WorkItem) => row.route },
            { header: 'connection', value: (row: WorkItem) => row.connectionId },
            { header: 'account', value: (row: WorkItem) => row.accountNumber },
            { header: 'address', value: (row: WorkItem) => row.address },
            { header: 'assembly', value: (row: WorkItem) => row.assemblyId ?? 'none fitted' },
            { header: 'where', value: (row: WorkItem) => row.location },
            { header: 'due', value: (row: WorkItem) => row.due },
            { header: 'why', value: (row: WorkItem) => row.urgency },
          ]),
        );
      });
    });
}

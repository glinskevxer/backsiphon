/**
 * Commands about variances.
 */

import type { Command } from 'commander';

import { ok } from '../../util/result';
import type { AssemblyClass } from '../../domain/assembly';
import type { ProtectionScope } from '../../domain/deficiency';
import { varianceStatus, type Variance } from '../../domain/variance';
import { applyForVariance, decideGrant, decideRefusal, revoke } from '../../service/variances';
import { protectionStatus } from '../../service/protection';
import { listGranted, variancesForConnection } from '../../storage/repositories/variances';
import type { GlobalOptions } from '../context';
import { bullet, table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { report } from './connections';

function globals(command: Command): GlobalOptions {
  return command.optsWithGlobals() as GlobalOptions;
}

function conditions(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return value
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

export function registerVarianceCommands(program: Command, io: CliIo, runner: Runner): void {
  const variance = program.command('variance').description('variances against the requirement');

  variance
    .command('apply')
    .description('record an application from a customer')
    .argument('<connection>', 'the connection id')
    .requiredOption('--accept <class>', 'the class the customer wants accepted')
    .requiredOption('--on <date>', 'the day the application arrived')
    .option('--scope <scope>', 'containment or isolation', 'containment')
    .option('--note <note>', 'what the customer says')
    .action((connectionId: string, options: Record<string, string | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        applyForVariance(context.register, {
          connectionId,
          appliedOn: String(options['on']),
          acceptedClass: String(options['accept']) as AssemblyClass,
          scope: String(options['scope'] ?? 'containment') as ProtectionScope,
          ...(options['note'] === undefined ? {} : { note: String(options['note']) }),
        }),
      );
      report(io, outcome, (record) => {
        io.out(`${record.varianceId} taken, asking for a ${record.acceptedClass}`);
        io.out('the notice ladder is held on a pollutional hazard while this is pending');
      });
    });

  variance
    .command('grant')
    .description('grant an application on conditions')
    .argument('<id>', 'the variance id')
    .requiredOption('--on <date>', 'the day of the decision')
    .requiredOption('--from <date>', 'the day it takes effect')
    .requiredOption('--conditions <list>', 'the conditions, separated by semicolons')
    .option('--until <date>', 'the day it runs out')
    .option('--note <note>', 'anything else')
    .action((id: string, options: Record<string, string | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        decideGrant(context.register, id, {
          decidedOn: String(options['on']),
          effectiveFrom: String(options['from']),
          ...(options['until'] === undefined ? {} : { expiresOn: String(options['until']) }),
          conditions: conditions(options['conditions']),
          ...(options['note'] === undefined ? {} : { note: String(options['note']) }),
        }),
      );
      report(io, outcome, (record) => {
        io.out(
          `${record.varianceId} granted, a ${record.acceptedClass} is accepted from ` +
            `${record.effectiveFrom ?? 'the decision'} to ${record.expiresOn ?? 'no end date'}`,
        );
        io.out('the test cycle and the notice ladder are unchanged');
        for (const line of bullet(record.conditions)) {
          io.out(line);
        }
      });
    });

  variance
    .command('deny')
    .description('refuse an application')
    .argument('<id>', 'the variance id')
    .requiredOption('--on <date>', 'the day of the decision')
    .requiredOption('--reason <reason>', 'why')
    .action((id: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        decideRefusal(context.register, id, String(options['on']), String(options['reason'])),
      );
      report(io, outcome, (record) => {
        io.out(`${record.varianceId} refused on ${record.decidedOn ?? 'an unknown day'}`);
      });
    });

  variance
    .command('revoke')
    .description('revoke a granted variance')
    .argument('<id>', 'the variance id')
    .requiredOption('--on <date>', 'the day it stops')
    .requiredOption('--reason <reason>', 'why')
    .action((id: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        revoke(context.register, id, String(options['on']), String(options['reason'])),
      );
      report(io, outcome, (record) => {
        io.out(`${record.varianceId} revoked from ${record.revokedOn ?? 'an unknown day'}`);
        io.out('the underlying requirement is back from that day');
      });
    });

  variance
    .command('list')
    .description('the variances on file')
    .option('--connection <id>', 'only this connection')
    .option('--in-effect', 'only the ones running today')
    .action((options: Record<string, string | boolean | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const rows =
          options['connection'] === undefined
            ? listGranted(context.register.db, context.asOf)
            : variancesForConnection(context.register.db, String(options['connection']));
        const filtered =
          options['inEffect'] === true
            ? rows.filter((row) => statusOf(context, row) === 'in_effect')
            : rows;
        return ok({ context, rows: filtered });
      });
      report(io, outcome, ({ context, rows }) => {
        if (context.json) {
          writeJson(io, rows);
          return;
        }
        for (const line of table(rows, [
          { header: 'variance', value: (row: Variance) => row.varianceId },
          { header: 'connection', value: (row: Variance) => row.connectionId },
          { header: 'accepts', value: (row: Variance) => row.acceptedClass },
          { header: 'applied', value: (row: Variance) => row.appliedOn },
          { header: 'decision', value: (row: Variance) => row.decision ?? 'pending' },
          { header: 'from', value: (row: Variance) => row.effectiveFrom },
          { header: 'until', value: (row: Variance) => row.expiresOn },
          { header: 'standing', value: (row: Variance) => statusOf(context, row) },
        ])) {
          io.out(line);
        }
      });
    });
}

function statusOf(
  context: { register: Parameters<typeof protectionStatus>[0]; asOf: string },
  variance: Variance,
): string {
  const status = protectionStatus(context.register, variance.connectionId, context.asOf);
  const degree = status.ok ? status.value.survey.containmentDegree : variance.grantedAgainstDegree;
  return varianceStatus(variance, context.asOf, degree);
}

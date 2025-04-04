/**
 * Commands about the hardware: the approval list and what is in the ground.
 */

import type { Command } from 'commander';

import { ok } from '../../util/result';
import type { AssemblyClass } from '../../domain/assembly';
import {
  installAssembly,
  relocateAssembly,
  remedyForAssembly,
  swapAssembly,
  takeAssemblyOut,
} from '../../service/assemblies';
import type { InstalledAssembly, ProtectionScope } from '../../domain/deficiency';
import {
  delistModel,
  insertModel,
  listAssemblies,
  listModels,
} from '../../storage/repositories/assemblies';
import type { AssemblyModel } from '../../domain/approvals';
import { firstTimeFailureRate, fleetRecord, type ModelRecord } from '../../service/fleet';
import { table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, report } from '../shared';

function sizes(value: string): number[] {
  return value
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
}

export function registerAssemblyCommands(program: Command, io: CliIo, runner: Runner): void {
  const model = program.command('model').description('the approved assembly list');

  model
    .command('add')
    .description('put a model on the approval list')
    .requiredOption('--id <id>', 'the model id the office quotes')
    .requiredOption('--maker <maker>', 'who makes it')
    .requiredOption('--model <model>', 'what they call it')
    .requiredOption('--class <class>', 'the assembly class')
    .requiredOption('--sizes <sizes>', 'the sizes it is listed at, separated by commas')
    .requiredOption('--listed <date>', 'the day the laboratory listed it')
    .option('--note <note>', 'anything worth keeping')
    .action((options: Record<string, string | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        insertModel(context.register.db, {
          modelId: String(options['id']),
          maker: String(options['maker']),
          model: String(options['model']),
          assemblyClass: String(options['class']) as AssemblyClass,
          sizes: sizes(String(options['sizes'])),
          listedOn: String(options['listed']),
          note: options['note'] ?? '',
        }),
      );
      report(io, outcome, (record) => {
        io.out(`${record.modelId} is on the list from ${record.listedOn}`);
      });
    });

  model
    .command('delist')
    .description('take a model off the list, leaving the fitted ones alone')
    .argument('<id>', 'the model id')
    .requiredOption('--on <date>', 'the day it came off')
    .action((id: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        delistModel(context.register.db, id, String(options['on'])),
      );
      report(io, outcome, (record) => {
        io.out(`${record.modelId} came off the list on ${record.delistedOn ?? 'an unknown day'}`);
        io.out('the ones already fitted stay until they fail or are moved');
      });
    });

  model
    .command('list')
    .description('the approval list')
    .option('--class <class>', 'only this class')
    .action((options: Record<string, string | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({
          context,
          rows: listModels(
            context.register.db,
            options['class'] === undefined ? undefined : (options['class'] as AssemblyClass),
          ),
        }),
      );
      report(io, outcome, ({ context, rows }) => {
        if (context.json) {
          writeJson(io, rows);
          return;
        }
        for (const line of table(rows, [
          { header: 'model', value: (row: AssemblyModel) => row.modelId },
          { header: 'maker', value: (row: AssemblyModel) => row.maker },
          { header: 'class', value: (row: AssemblyModel) => row.assemblyClass },
          { header: 'sizes', value: (row: AssemblyModel) => row.sizes.join(' ') },
          { header: 'listed', value: (row: AssemblyModel) => row.listedOn },
          { header: 'delisted', value: (row: AssemblyModel) => row.delistedOn },
        ])) {
          io.out(line);
        }
      });
    });

  model
    .command('fleet')
    .description('what the district has learned about each model')
    .action((_options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const records = fleetRecord(context.register, context.asOf);
        return records.ok ? ok({ context, rows: records.value }) : records;
      });
      report(io, outcome, ({ context, rows }) => {
        if (context.json) {
          writeJson(
            io,
            rows.map((row) => ({
              ...row,
              firstTimeFailureRate: firstTimeFailureRate(row) ?? null,
            })),
          );
          return;
        }
        for (const line of table(rows, [
          { header: 'model', value: (row: ModelRecord) => row.modelId },
          { header: 'maker', value: (row: ModelRecord) => row.maker },
          { header: 'class', value: (row: ModelRecord) => row.assemblyClass },
          { header: 'listing', value: (row: ModelRecord) => row.listing },
          { header: 'fitted', value: (row: ModelRecord) => row.fitted, align: 'right' },
          { header: 'out', value: (row: ModelRecord) => row.removed, align: 'right' },
          { header: 'mean age', value: (row: ModelRecord) => row.meanAgeYears, align: 'right' },
          { header: 'tests', value: (row: ModelRecord) => row.testsJudged, align: 'right' },
          {
            header: 'failed first time',
            value: (row: ModelRecord) => firstTimeFailureRate(row) ?? 'too few',
            align: 'right',
          },
        ])) {
          io.out(line);
        }
      });
    });

  const assembly = program.command('assembly').description('what is in the ground');

  assembly
    .command('install')
    .description('fit an assembly at a connection')
    .argument('<connection>', 'the connection id')
    .requiredOption('--scope <scope>', 'containment or isolation')
    .requiredOption('--class <class>', 'the assembly class')
    .requiredOption('--model <id>', 'the model id off the approval list')
    .requiredOption('--serial <serial>', 'the serial number on the body')
    .requiredOption('--size <inches>', 'the size in inches')
    .requiredOption('--on <date>', 'the day it went in')
    .requiredOption('--location <where>', 'where the tester will find it')
    .action((connectionId: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        installAssembly(context.register, {
          connectionId,
          scope: String(options['scope']) as ProtectionScope,
          assemblyClass: String(options['class']) as AssemblyClass,
          modelId: String(options['model']),
          serialNumber: String(options['serial']),
          sizeInches: Number(options['size']),
          installedOn: String(options['on']),
          location: String(options['location']),
        }),
      );
      report(io, outcome, (record) => {
        io.out(`${record.assemblyId} fitted at ${record.location}`);
      });
    });

  assembly
    .command('remove')
    .description('take an assembly out')
    .argument('<id>', 'the assembly id')
    .requiredOption('--on <date>', 'the day it came out')
    .requiredOption('--reason <reason>', 'why')
    .action((id: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        takeAssemblyOut(context.register, id, String(options['on']), String(options['reason'])),
      );
      report(io, outcome, (record) => {
        io.out(`${record.assemblyId} came out on ${record.removedOn ?? 'an unknown day'}`);
      });
    });

  assembly
    .command('swap')
    .description('replace one assembly with another on the same day')
    .argument('<id>', 'the assembly coming out')
    .requiredOption('--class <class>', 'the class of the one going in')
    .requiredOption('--model <id>', 'the model id of the one going in')
    .requiredOption('--serial <serial>', 'its serial number')
    .requiredOption('--size <inches>', 'its size')
    .requiredOption('--on <date>', 'the day of the work')
    .requiredOption('--location <where>', 'where it sits')
    .requiredOption('--reason <reason>', 'why the old one came out')
    .action((id: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        swapAssembly(
          context.register,
          id,
          {
            assemblyClass: String(options['class']) as AssemblyClass,
            modelId: String(options['model']),
            serialNumber: String(options['serial']),
            sizeInches: Number(options['size']),
            installedOn: String(options['on']),
            location: String(options['location']),
          },
          String(options['reason']),
        ),
      );
      report(io, outcome, (swapped) => {
        io.out(`${swapped.removed.assemblyId} out, ${swapped.installed.assemblyId} in`);
      });
    });

  assembly
    .command('move')
    .description('move an assembly to another point, under a new id')
    .argument('<id>', 'the assembly being moved')
    .requiredOption('--to <connection>', 'the connection it is going to')
    .requiredOption('--scope <scope>', 'containment or isolation')
    .requiredOption('--on <date>', 'the day of the work')
    .requiredOption('--location <where>', 'where it sits now')
    .requiredOption('--reason <reason>', 'why it moved')
    .action((id: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        relocateAssembly(context.register, id, {
          connectionId: String(options['to']),
          scope: String(options['scope']) as ProtectionScope,
          location: String(options['location']),
          on: String(options['on']),
          reason: String(options['reason']),
        }),
      );
      report(io, outcome, (moved) => {
        io.out(`${moved.from.assemblyId} came out and went back in as ${moved.to.assemblyId}`);
        io.out('the test history stays with the old id, the cycle starts again on the new one');
      });
    });

  assembly
    .command('list')
    .description('the assemblies on the register')
    .option('--connection <id>', 'only this connection')
    .option('--scope <scope>', 'only this point')
    .option('--all', 'include the ones that have come out')
    .action((options: Record<string, string | boolean | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({
          context,
          rows: listAssemblies(context.register.db, {
            ...(options['connection'] === undefined
              ? {}
              : { connectionId: String(options['connection']) }),
            ...(options['scope'] === undefined
              ? {}
              : { scope: String(options['scope']) as ProtectionScope }),
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
          { header: 'assembly', value: (row: InstalledAssembly) => row.assemblyId },
          { header: 'connection', value: (row: InstalledAssembly) => row.connectionId },
          { header: 'scope', value: (row: InstalledAssembly) => row.scope },
          { header: 'class', value: (row: InstalledAssembly) => row.assemblyClass },
          { header: 'model', value: (row: InstalledAssembly) => row.modelId },
          { header: 'serial', value: (row: InstalledAssembly) => row.serialNumber },
          { header: 'fitted', value: (row: InstalledAssembly) => row.installedOn },
          { header: 'removed', value: (row: InstalledAssembly) => row.removedOn },
        ])) {
          io.out(line);
        }
      });
    });

  assembly
    .command('remedy')
    .description('whether a failing assembly may be repaired or has to be replaced')
    .argument('<id>', 'the assembly id')
    .action((id: string, _options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        remedyForAssembly(context.register, id, context.asOf),
      );
      report(io, outcome, (remedy) => {
        io.out(
          remedy === 'repair'
            ? 'the model is on the list, so a repair may be put back'
            : 'the model is off the list, so this one has to be replaced',
        );
      });
    });
}

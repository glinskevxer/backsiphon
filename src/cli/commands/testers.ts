/**
 * Commands about the people who test and the gauges they carry.
 */

import type { Command } from 'commander';

import { ok } from '../../util/result';
import type { AssemblyClass } from '../../domain/assembly';
import {
  calibrationDueOn,
  certificationStatus,
  gaugeStatus,
  type Gauge,
  type TesterCertification,
} from '../../domain/tester';
import {
  gaugesOf,
  insertGauge,
  insertTester,
  listTesters,
  recalibrate,
  renewCertificate,
  retireGauge,
  suspendTester,
} from '../../storage/repositories/testers';
import { testerRecord, testerRoster, passRate, type TesterRecord } from '../../service/testers';
import { describe, table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, printLines, report } from '../shared';

function endorsements(value: string): AssemblyClass[] {
  return value
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry !== '') as AssemblyClass[];
}

export function registerTesterCommands(program: Command, io: CliIo, runner: Runner): void {
  const tester = program.command('tester').description('certified testers');

  tester
    .command('add')
    .description('put a tester on the register')
    .requiredOption('--id <id>', 'the id the office files them under')
    .requiredOption('--name <name>', 'their name')
    .requiredOption('--agency <agency>', 'who issued the certificate')
    .requiredOption('--certificate <number>', 'the certificate number')
    .requiredOption('--issued <date>', 'the day it was issued')
    .requiredOption('--expires <date>', 'the day it runs out')
    .requiredOption('--endorsements <classes>', 'the classes it covers, separated by commas')
    .action((options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        insertTester(context.register.db, {
          testerId: String(options['id']),
          name: String(options['name']),
          agency: String(options['agency']),
          certificateNumber: String(options['certificate']),
          issuedOn: String(options['issued']),
          expiresOn: String(options['expires']),
          endorsements: endorsements(String(options['endorsements'])),
        }),
      );
      report(io, outcome, (record) => {
        io.out(`${record.testerId} on file, certificate good to ${record.expiresOn}`);
      });
    });

  tester
    .command('renew')
    .description('write a renewed certificate onto a tester')
    .argument('<id>', 'the tester id')
    .requiredOption('--issued <date>', 'the day the new one was issued')
    .requiredOption('--expires <date>', 'the day it runs out')
    .requiredOption('--endorsements <classes>', 'the classes it covers')
    .action((id: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        renewCertificate(
          context.register.db,
          id,
          String(options['issued']),
          String(options['expires']),
          endorsements(String(options['endorsements'])),
        ),
      );
      report(io, outcome, (record) => {
        io.out(
          `${record.testerId} renewed to ${record.expiresOn}, ${record.endorsements.join(', ')}`,
        );
      });
    });

  tester
    .command('suspend')
    .description('suspend a tester from the day given')
    .argument('<id>', 'the tester id')
    .requiredOption('--on <date>', 'the day the suspension starts')
    .requiredOption('--reason <reason>', 'why')
    .action((id: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        suspendTester(context.register.db, id, String(options['on']), String(options['reason'])),
      );
      report(io, outcome, (record) => {
        io.out(`${record.testerId} suspended from ${record.suspendedOn ?? 'an unknown day'}`);
        io.out('reports they filed before that day stand');
      });
    });

  tester
    .command('list')
    .description('the testers on the register and where their certificates stand')
    .action((_options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({ context, rows: listTesters(context.register.db) }),
      );
      report(io, outcome, ({ context, rows }) => {
        if (context.json) {
          writeJson(io, rows);
          return;
        }
        printLines(
          io,
          table(rows, [
            { header: 'id', value: (row: TesterCertification) => row.testerId },
            { header: 'name', value: (row: TesterCertification) => row.name },
            { header: 'agency', value: (row: TesterCertification) => row.agency },
            { header: 'expires', value: (row: TesterCertification) => row.expiresOn },
            {
              header: 'standing',
              value: (row: TesterCertification) => certificationStatus(row, context.asOf),
            },
            {
              header: 'endorsed for',
              value: (row: TesterCertification) => row.endorsements.join(' '),
            },
          ]),
        );
      });
    });

  tester
    .command('record')
    .description('what one tester has filed and how the paperwork arrives')
    .argument('<id>', 'the tester id')
    .action((id: string, _options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const record = testerRecord(context.register, id, context.asOf);
        return record.ok ? ok({ context, record: record.value }) : record;
      });
      report(io, outcome, ({ context, record }) => {
        if (context.json) {
          writeJson(io, { ...record, passRate: passRate(record) ?? null });
          return;
        }
        printLines(
          io,
          describe([
            ['tester', `${record.testerId}, ${record.name}`],
            ['certificate', record.standing],
            ['reports filed', record.filed],
            ['accepted', record.accepted],
            ['refused', record.refused],
            ['passing', record.passed],
            ['failing', record.failed],
            ['repairs on site', record.repairs],
            ['pass rate', passRate(record) ?? 'nothing accepted yet'],
            ['mean days to file', record.meanFilingDays],
            ['worst days to file', record.worstFilingDays],
            ['refused for', record.refusalCodes.join(', ')],
          ]),
        );
      });
    });

  tester
    .command('roster')
    .description('every tester with what they have filed, busiest first')
    .action((_options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({ context, rows: testerRoster(context.register, context.asOf) }),
      );
      report(io, outcome, ({ context, rows }) => {
        if (context.json) {
          writeJson(io, rows);
          return;
        }
        printLines(
          io,
          table(rows, [
            { header: 'tester', value: (row: TesterRecord) => row.testerId },
            { header: 'name', value: (row: TesterRecord) => row.name },
            { header: 'standing', value: (row: TesterRecord) => row.standing },
            { header: 'filed', value: (row: TesterRecord) => row.filed, align: 'right' },
            { header: 'refused', value: (row: TesterRecord) => row.refused, align: 'right' },
            {
              header: 'pass rate',
              value: (row: TesterRecord) => passRate(row) ?? '',
              align: 'right',
            },
            {
              header: 'mean days to file',
              value: (row: TesterRecord) => row.meanFilingDays,
              align: 'right',
            },
          ]),
        );
      });
    });

  const gauge = program.command('gauge').description('test gauges and their calibration');

  gauge
    .command('add')
    .description('register a gauge to a tester')
    .requiredOption('--id <id>', 'the gauge id')
    .requiredOption('--tester <id>', 'the tester it belongs to')
    .requiredOption('--maker <maker>', 'who made it')
    .requiredOption('--serial <serial>', 'its serial number')
    .requiredOption('--calibrated <date>', 'the day it was last calibrated')
    .requiredOption('--accuracy <psid>', 'the band the laboratory certified it to')
    .option('--interval <months>', 'months between calibrations', '12')
    .action((options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        insertGauge(context.register.db, {
          gaugeId: String(options['id']),
          testerId: String(options['tester']),
          maker: String(options['maker']),
          serialNumber: String(options['serial']),
          calibratedOn: String(options['calibrated']),
          calibrationIntervalMonths: Number(options['interval']),
          accuracyPsid: Number(options['accuracy']),
        }),
      );
      report(io, outcome, (record) => {
        io.out(`${record.gaugeId} registered, calibration good to ${calibrationDueOn(record)}`);
      });
    });

  gauge
    .command('calibrate')
    .description('record a calibration')
    .argument('<id>', 'the gauge id')
    .requiredOption('--on <date>', 'the day it was done')
    .requiredOption('--accuracy <psid>', 'the band on the new certificate')
    .action((id: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        recalibrate(context.register.db, id, String(options['on']), Number(options['accuracy'])),
      );
      report(io, outcome, (record) => {
        io.out(
          `${record.gaugeId} calibrated ${record.calibratedOn}, good to ${calibrationDueOn(record)}`,
        );
      });
    });

  gauge
    .command('retire')
    .description('retire a gauge')
    .argument('<id>', 'the gauge id')
    .requiredOption('--on <date>', 'the day it was retired')
    .action((id: string, options: Record<string, string>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        retireGauge(context.register.db, id, String(options['on'])),
      );
      report(io, outcome, (record) => {
        io.out(`${record.gaugeId} retired on ${record.retiredOn ?? 'an unknown day'}`);
      });
    });

  gauge
    .command('list')
    .description('the gauges a tester carries')
    .argument('<tester>', 'the tester id')
    .action((testerId: string, _options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({ context, rows: gaugesOf(context.register.db, testerId) }),
      );
      report(io, outcome, ({ context, rows }) => {
        if (context.json) {
          writeJson(io, rows);
          return;
        }
        printLines(
          io,
          table(rows, [
            { header: 'gauge', value: (row: Gauge) => row.gaugeId },
            { header: 'maker', value: (row: Gauge) => row.maker },
            { header: 'serial', value: (row: Gauge) => row.serialNumber },
            { header: 'calibrated', value: (row: Gauge) => row.calibratedOn },
            { header: 'due', value: (row: Gauge) => calibrationDueOn(row) },
            { header: 'band', value: (row: Gauge) => row.accuracyPsid, align: 'right' },
            { header: 'standing', value: (row: Gauge) => gaugeStatus(row, context.asOf) },
          ]),
        );
      });
    });
}

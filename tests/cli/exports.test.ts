import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../src/service/register';
import { parseCsv, toRecords } from '../../src/util/csv';
import { borrow, cliRunner } from '../support/cli';
import { capturingIo } from '../../src/cli/output';
import { run } from '../../src/cli/program';

let register: Register;

const cli = cliRunner(() => register, '2024-10-20');
let scratch: string;

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'backsiphon-'));
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-10-20T09:00:00Z',
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
  await cli(
    'model',
    'add',
    '--id',
    'WK-375',
    '--maker',
    'watkin',
    '--model',
    '375',
    '--class',
    'RP',
    '--sizes',
    '2',
    '--listed',
    '2016-04-01',
  );
  await cli(
    'tester',
    'add',
    '--id',
    'T-118',
    '--name',
    'p. adeyemi',
    '--agency',
    'board',
    '--certificate',
    'BF-4471',
    '--issued',
    '2019-05-01',
    '--expires',
    '2029-04-30',
    '--endorsements',
    'RP',
  );
  await cli(
    'gauge',
    'add',
    '--id',
    'G-77',
    '--tester',
    'T-118',
    '--maker',
    'midwest',
    '--serial',
    '845-C',
    '--calibrated',
    '2019-05-01',
    '--accuracy',
    '0.2',
    '--interval',
    '240',
  );
  await cli(
    'connection',
    'open',
    '--account',
    'A-1001',
    '--name',
    'kerrigan plating',
    '--address',
    '14 forge road, vault',
    '--use',
    'INDUSTRIAL',
    '--size',
    '2',
    '--on',
    '2018-01-01',
  );
  await cli(
    'survey',
    'record',
    'SC-00001',
    '--on',
    '2023-01-10',
    '--surveyor',
    'r. okafor',
    '--findings',
    'AUX_WELL',
  );
  await cli(
    'assembly',
    'install',
    'SC-00001',
    '--scope',
    'containment',
    '--class',
    'RP',
    '--model',
    'WK-375',
    '--serial',
    '1',
    '--size',
    '2',
    '--on',
    '2023-02-01',
    '--location',
    'meter vault, north side',
  );
  await cli(
    'test',
    'file',
    'BA-00001',
    '--tester',
    'T-118',
    '--gauge',
    'G-77',
    '--on',
    '2024-03-01',
    '--filed',
    '2024-03-01',
    '--reading',
    'check1Differential=8.2',
    '--reading',
    'reliefOpening=3.1',
  );
});

afterEach(() => {
  closeRegister(register);
  rmSync(scratch, { recursive: true, force: true });
});

describe('export', () => {
  it('writes the connections as csv', async () => {
    const result = await cli('export', 'connections');
    const parsed = parseCsv(result.out);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(toRecords(parsed.value)[0]).toMatchObject({
      connection: 'SC-00001',
      account: 'A-1001',
      use: 'INDUSTRIAL',
    });
  });

  it('quotes a value with a comma in it', async () => {
    const result = await cli('export', 'assemblies');
    expect(result.out).toContain('"meter vault, north side"');
    const parsed = parseCsv(result.out);
    expect(parsed.ok && toRecords(parsed.value)[0]?.['location']).toBe('meter vault, north side');
  });

  it('writes the reports with the ruling on them', async () => {
    const result = await cli('export', 'reports');
    const parsed = parseCsv(result.out);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(toRecords(parsed.value)[0]).toMatchObject({
      report: 'TR-000001',
      accepted: 'yes',
      outcome: 'pass',
    });
  });

  it('works the standing out for every connection', async () => {
    const result = await cli('export', 'standing');
    const parsed = parseCsv(result.out);
    expect(parsed.ok && toRecords(parsed.value)[0]).toMatchObject({
      connection: 'SC-00001',
      standing: 'compliant',
      required: 'RP',
    });
  });

  it('names a connection it could not work out rather than dropping it', async () => {
    await cli(
      'connection',
      'open',
      '--account',
      'A-1002',
      '--name',
      'unwalked',
      '--address',
      'somewhere',
      '--use',
      'OFFICE',
      '--size',
      '1',
      '--on',
      '2020-01-01',
    );
    const result = await cli('export', 'standing');
    expect(result.out).toContain('SC-00002');
    expect(result.out).toContain('unknown');
  });

  it('writes json when it is asked to', async () => {
    const io = capturingIo();
    await run(['--json', 'export', 'connections'], {
      io,
      runner: borrow(() => register, '2024-10-20'),
    });
    const rows = JSON.parse(io.lines.join('\n')) as Array<Record<string, string>>;
    expect(rows[0]?.['connection']).toBe('SC-00001');
  });

  it('writes to a file and says how many rows', async () => {
    const target = join(scratch, 'connections.csv');
    const result = await cli('export', 'connections', '--to', target);
    expect(result.out).toContain('1 rows written to');
    expect(readFileSync(target, 'utf8')).toContain('SC-00001');
  });

  it('refuses an export nobody has heard of', async () => {
    const result = await cli('export', 'weather');
    expect(result.err).toContain('there is no export called weather');
  });
});

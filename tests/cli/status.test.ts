import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../src/service/register';
import { borrow, cliRunner } from '../support/cli';
import { capturingIo } from '../../src/cli/output';
import { run } from '../../src/cli/program';

let register: Register;

const cli = cliRunner(() => register, '2024-09-01');

async function setUpConnection(account: string, use: string): Promise<void> {
  await cli(
    'connection',
    'open',
    '--account',
    account,
    '--name',
    `premise ${account}`,
    '--address',
    'somewhere',
    '--use',
    use,
    '--size',
    '2',
    '--on',
    '2018-01-01',
  );
}

beforeEach(async () => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-09-01T09:00:00Z',
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
    'model',
    'add',
    '--id',
    'WK-350',
    '--maker',
    'watkin',
    '--model',
    '350',
    '--class',
    'DC',
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
    'RP,DC',
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
});

afterEach(() => {
  closeRegister(register);
});

describe('status', () => {
  beforeEach(async () => {
    await setUpConnection('A-1001', 'INDUSTRIAL');
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
  });

  it('says a connection with nothing fitted is deficient', async () => {
    const status = await cli('status', 'SC-00001');
    expect(status.out).toMatch(/standing\s+deficient/);
    expect(status.out).toMatch(/urgency\s+immediate/);
    expect(status.out).toMatch(/required\s+RP/);
    expect(status.out).toMatch(/deficiency\s+missing/);
  });

  it('reads both points', async () => {
    const status = await cli('status', 'SC-00001');
    expect(status.out).toContain('containment');
    expect(status.out).toContain('isolation');
  });

  it('turns compliant once the right assembly is fitted and tested', async () => {
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
      'vault',
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
      '2024-03-02',
      '--reading',
      'check1Differential=8.2',
      '--reading',
      'reliefOpening=3.1',
    );
    const status = await cli('status', 'SC-00001');
    expect(status.out).toMatch(/standing\s+compliant/);
    expect(status.out).toMatch(/test due\s+2025-03-01/);
  });

  it('says what a wrong class is short of', async () => {
    await cli(
      'assembly',
      'install',
      'SC-00001',
      '--scope',
      'containment',
      '--class',
      'DC',
      '--model',
      'WK-350',
      '--serial',
      '2',
      '--size',
      '2',
      '--on',
      '2023-02-01',
      '--location',
      'vault',
    );
    const status = await cli('status', 'SC-00001');
    expect(status.out).toContain('stopsHealthHazard');
  });

  it('writes the whole thing as json', async () => {
    const io = capturingIo();
    await run(['--json', 'status', 'SC-00001'], {
      io,
      runner: borrow(() => register, '2024-09-01'),
    });
    const parsed = JSON.parse(io.lines.join('\n')) as { standing: string; connectionId: string };
    expect(parsed.connectionId).toBe('SC-00001');
    expect(parsed.standing).toBe('deficient');
  });

  it('says so when the connection has never been walked', async () => {
    await setUpConnection('A-1002', 'OFFICE');
    const status = await cli('status', 'SC-00002');
    expect(status.err).toContain('never been surveyed');
  });
});

describe('standing', () => {
  beforeEach(async () => {
    await setUpConnection('A-1001', 'INDUSTRIAL');
    await setUpConnection('A-1002', 'OFFICE');
    await cli(
      'survey',
      'record',
      'SC-00001',
      '--on',
      '2023-01-10',
      '--surveyor',
      'r',
      '--findings',
      'AUX_WELL',
    );
    await cli('survey', 'record', 'SC-00002', '--on', '2023-01-10', '--surveyor', 'r');
  });

  it('lists the whole register in columns', async () => {
    const standing = await cli('standing');
    expect(standing.out).toContain('SC-00001');
    expect(standing.out).toContain('SC-00002');
    expect(standing.out).toContain('deficient');
  });

  it('filters to one standing', async () => {
    const standing = await cli('standing', '--only', 'not_yet_due');
    expect(standing.out).not.toContain('SC-00001');
  });

  it('names the connections it could not read', async () => {
    await setUpConnection('A-1003', 'OFFICE');
    const standing = await cli('standing');
    expect(standing.out).toContain('not read');
    expect(standing.out).toContain('SC-00003');
  });
});

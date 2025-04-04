import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../src/service/register';
import { borrow, cliRunner } from '../support/cli';
import { capturingIo } from '../../src/cli/output';
import { run } from '../../src/cli/program';

let register: Register;

const cli = cliRunner(() => register, '2024-10-30');

beforeEach(async () => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-10-30T09:00:00Z',
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
    '14 forge road',
    '--use',
    'INDUSTRIAL',
    '--size',
    '2',
    '--on',
    '2018-01-01',
    '--route',
    'north',
  );
  await cli(
    'survey',
    'record',
    'SC-00001',
    '--on',
    '2022-01-10',
    '--surveyor',
    'r. okafor',
    '--findings',
    'AUX_WELL',
  );
  await cli(
    'connection',
    'open',
    '--account',
    'A-1002',
    '--name',
    'harbour cannery',
    '--address',
    '2 quay street',
    '--use',
    'INDUSTRIAL',
    '--size',
    '2',
    '--on',
    '2018-01-01',
    '--route',
    'south',
  );
});

afterEach(() => {
  closeRegister(register);
});

describe('summary', () => {
  it('counts the register and reads the rate as a percentage', async () => {
    const summary = await cli('summary');
    expect(summary.out).toMatch(/connections\s+2/);
    expect(summary.out).toMatch(/tested inside the cycle\s+100.0 percent/);
    expect(summary.out).toMatch(/never surveyed\s+1/);
  });

  it('counts the standing and the degrees', async () => {
    const summary = await cli('summary');
    expect(summary.out).toMatch(/deficient\s+1/);
    expect(summary.out).toMatch(/could not be read\s+1/);
    expect(summary.out).toMatch(/health\s+1/);
  });

  it('names the connections eligible for shutoff', async () => {
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
      '2022-02-01',
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
      '2022-03-01',
      '--filed',
      '2022-03-01',
      '--reading',
      'check1Differential=8.2',
      '--reading',
      'reliefOpening=3.1',
    );
    const summary = await cli('summary');
    expect(summary.out).toContain('shutoff eligible: SC-00001');
  });

  it('writes json for a script', async () => {
    const io = capturingIo();
    await run(['--json', 'summary'], { io, runner: borrow(() => register, '2024-10-30') });
    const parsed = JSON.parse(io.lines.join('\n')) as { connections: number };
    expect(parsed.connections).toBe(2);
  });
});

describe('worklist', () => {
  it('lists what is due and what has nothing fitted, in route order', async () => {
    const list = await cli('worklist');
    const lines = list.out.split('\n');
    expect(lines[2]).toContain('north');
    expect(lines[2]).toContain('none fitted');
    expect(lines[3]).toContain('south');
  });

  it('looks ahead when it is asked to', async () => {
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
      '2022-02-01',
      '--location',
      'meter vault',
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
      '2024-06-01',
      '--filed',
      '2024-06-01',
      '--reading',
      'check1Differential=8.2',
      '--reading',
      'reliefOpening=3.1',
    );
    const now = await cli('worklist', '--route', 'north');
    expect(now.out).not.toContain('BA-00001');
    const ahead = await cli('worklist', '--route', 'north', '--within', '300');
    expect(ahead.out).toContain('BA-00001');
    expect(ahead.out).toContain('meter vault');
  });
});

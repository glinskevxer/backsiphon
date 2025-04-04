import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../src/service/register';
import { cliRunner } from '../support/cli';

let register: Register;

const cli = cliRunner(() => register, '2024-08-20');

async function addTester(id = 'T-118'): Promise<void> {
  await cli(
    'tester',
    'add',
    '--id',
    id,
    '--name',
    'p. adeyemi',
    '--agency',
    'state waterworks board',
    '--certificate',
    `BF-${id}`,
    '--issued',
    '2023-05-01',
    '--expires',
    '2026-04-30',
    '--endorsements',
    'rp, dc, rpda',
  );
}

beforeEach(() => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-08-20T09:00:00Z',
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
});

afterEach(() => {
  closeRegister(register);
});

describe('testers', () => {
  it('adds one and reads the endorsements in any case', async () => {
    await addTester();
    const listed = await cli('tester', 'list');
    expect(listed.out).toContain('T-118');
    expect(listed.out).toContain('RP DC RPDA');
    expect(listed.out).toContain('valid');
  });

  it('reads the standing as at the day asked about', async () => {
    await addTester();
    const later = await cli('--as-of', '2027-01-01', 'tester', 'list');
    expect(later.out).toContain('expired');
    const earlier = await cli('--as-of', '2022-01-01', 'tester', 'list');
    expect(earlier.out).toContain('not_yet');
  });

  it('renews a certificate', async () => {
    await addTester();
    const renewed = await cli(
      'tester',
      'renew',
      'T-118',
      '--issued',
      '2026-05-01',
      '--expires',
      '2029-04-30',
      '--endorsements',
      'RP,PVB',
    );
    expect(renewed.out).toContain('renewed to 2029-04-30, RP, PVB');
  });

  it('suspends one and says the old reports stand', async () => {
    await addTester();
    const suspended = await cli(
      'tester',
      'suspend',
      'T-118',
      '--on',
      '2024-06-01',
      '--reason',
      'falsified three reports',
    );
    expect(suspended.out).toContain('suspended from 2024-06-01');
    expect(suspended.out).toContain('reports they filed before that day stand');
    const listed = await cli('tester', 'list');
    expect(listed.out).toContain('suspended');
  });

  it('refuses a renewal that covers nothing', async () => {
    await addTester();
    const renewed = await cli(
      'tester',
      'renew',
      'T-118',
      '--issued',
      '2026-05-01',
      '--expires',
      '2029-04-30',
      '--endorsements',
      ' ',
    );
    expect(renewed.err).toContain('covers nothing');
  });
});

describe('gauges', () => {
  beforeEach(async () => {
    await addTester();
  });

  async function addGauge(): Promise<{ out: string; err: string }> {
    return cli(
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
      '2024-02-15',
      '--accuracy',
      '0.2',
    );
  }

  it('registers one and works out when it is due', async () => {
    const added = await addGauge();
    expect(added.out).toContain('calibration good to 2025-02-15');
  });

  it('lists what a tester carries with its standing', async () => {
    await addGauge();
    const listed = await cli('gauge', 'list', 'T-118');
    expect(listed.out).toContain('G-77');
    expect(listed.out).toContain('in_calibration');
    const later = await cli('--as-of', '2026-01-01', 'gauge', 'list', 'T-118');
    expect(later.out).toContain('out_of_calibration');
  });

  it('records a calibration', async () => {
    await addGauge();
    const done = await cli('gauge', 'calibrate', 'G-77', '--on', '2025-02-10', '--accuracy', '0.1');
    expect(done.out).toContain('calibrated 2025-02-10, good to 2026-02-10');
  });

  it('retires one and will not calibrate it afterwards', async () => {
    await addGauge();
    const retired = await cli('gauge', 'retire', 'G-77', '--on', '2025-06-01');
    expect(retired.out).toContain('retired on 2025-06-01');
    const late = await cli('gauge', 'calibrate', 'G-77', '--on', '2025-07-01', '--accuracy', '0.2');
    expect(late.err).toContain('retired');
  });

  it('refuses one belonging to a tester nobody has', async () => {
    const orphan = await cli(
      'gauge',
      'add',
      '--id',
      'G-9',
      '--tester',
      'T-404',
      '--maker',
      'midwest',
      '--serial',
      '1',
      '--calibrated',
      '2024-01-01',
      '--accuracy',
      '0.2',
    );
    expect(orphan.err).toContain('not on file');
  });
});

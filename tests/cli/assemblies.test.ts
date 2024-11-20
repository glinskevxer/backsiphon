import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../src/service/register';
import { cliRunner } from '../support/cli';

let register: Register;

const cli = cliRunner(() => register, '2024-08-15');

beforeEach(async () => {
  const opened = openRegister({ file: ':memory:', actor: 'clerk.hines', now: () => '2024-08-15T09:00:00Z' });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
  await cli(
    'connection', 'open',
    '--account', 'A-1001',
    '--name', 'kerrigan plating',
    '--address', '14 forge road',
    '--use', 'PLATING',
    '--size', '2',
    '--on', '2019-04-02',
  );
  await cli(
    'model', 'add',
    '--id', 'WK-375',
    '--maker', 'watkin',
    '--model', '375 series',
    '--class', 'RP',
    '--sizes', '1,1.5,2',
    '--listed', '2016-04-01',
  );
});

afterEach(() => {
  closeRegister(register);
});

describe('the approval list', () => {
  it('adds a model and lists it', async () => {
    const added = await cli(
      'model', 'add',
      '--id', 'WK-350',
      '--maker', 'watkin',
      '--model', '350 series',
      '--class', 'DC',
      '--sizes', '2, 3 ,4',
      '--listed', '2014-01-15',
    );
    expect(added.out).toContain('WK-350 is on the list from 2014-01-15');
    const listed = await cli('model', 'list');
    expect(listed.out).toContain('WK-350');
    expect(listed.out).toContain('2 3 4');
  });

  it('filters the list by class', async () => {
    const listed = await cli('model', 'list', '--class', 'DC');
    expect(listed.out).not.toContain('WK-375');
  });

  it('delists one and says the fitted ones stay', async () => {
    const delisted = await cli('model', 'delist', 'WK-375', '--on', '2023-09-30');
    expect(delisted.out).toContain('came off the list on 2023-09-30');
    expect(delisted.out).toContain('stay until they fail');
  });

  it('refuses a duplicate model', async () => {
    const again = await cli(
      'model', 'add',
      '--id', 'WK-375',
      '--maker', 'watkin',
      '--model', '375 series',
      '--class', 'RP',
      '--sizes', '2',
      '--listed', '2016-04-01',
    );
    expect(again.err).toContain('already on file');
  });
});

describe('assemblies', () => {
  async function install(serial = '4471182'): Promise<{ out: string; err: string }> {
    return cli(
      'assembly', 'install', 'SC-00001',
      '--scope', 'containment',
      '--class', 'RP',
      '--model', 'WK-375',
      '--serial', serial,
      '--size', '2',
      '--on', '2021-06-01',
      '--location', 'meter vault, north side',
    );
  }

  it('fits one and lists it', async () => {
    const fitted = await install();
    expect(fitted.out).toContain('BA-00001 fitted at meter vault, north side');
    const listed = await cli('assembly', 'list');
    expect(listed.out).toContain('BA-00001');
    expect(listed.out).toContain('WK-375');
  });

  it('refuses a second one at the same point', async () => {
    await install();
    const second = await install('999');
    expect(second.err).toContain('already at the containment point');
  });

  it('takes one out and leaves it off the live list', async () => {
    await install();
    const removed = await cli('assembly', 'remove', 'BA-00001', '--on', '2024-02-01', '--reason', 'cracked');
    expect(removed.out).toContain('came out on 2024-02-01');
    const live = await cli('assembly', 'list');
    expect(live.out).not.toContain('BA-00001');
    const all = await cli('assembly', 'list', '--all');
    expect(all.out).toContain('BA-00001');
  });

  it('swaps one for another in a single command', async () => {
    await install();
    const swapped = await cli(
      'assembly', 'swap', 'BA-00001',
      '--class', 'RP',
      '--model', 'WK-375',
      '--serial', '5582001',
      '--size', '2',
      '--on', '2024-03-04',
      '--location', 'meter vault, north side',
      '--reason', 'body cracked by frost',
    );
    expect(swapped.out).toContain('BA-00001 out, BA-00002 in');
  });

  it('says whether a failure may be repaired', async () => {
    await install();
    const repair = await cli('assembly', 'remedy', 'BA-00001');
    expect(repair.out).toContain('a repair may be put back');
    await cli('model', 'delist', 'WK-375', '--on', '2023-09-30');
    const replace = await cli('assembly', 'remedy', 'BA-00001');
    expect(replace.out).toContain('has to be replaced');
  });

  it('reads the remedy as at the day asked about', async () => {
    await install();
    await cli('model', 'delist', 'WK-375', '--on', '2023-09-30');
    const earlier = await cli('--as-of', '2023-01-01', 'assembly', 'remedy', 'BA-00001');
    expect(earlier.out).toContain('a repair may be put back');
  });
});

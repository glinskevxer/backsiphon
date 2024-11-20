import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../src/service/register';
import { borrow, cliRunner } from '../support/cli';
import { capturingIo } from '../../src/cli/output';
import { run } from '../../src/cli/program';

let register: Register;

const cli = cliRunner(() => register, '2024-08-05');

/** A runner that hands every command the one store this file holds open. */
beforeEach(() => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-08-05T09:00:00Z',
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
});

afterEach(() => {
  closeRegister(register);
});

describe('connection open', () => {
  it('opens one and says what it minted', async () => {
    const result = await cli(
      'connection',
      'open',
      '--account',
      'A-1001',
      '--name',
      'kerrigan plating',
      '--address',
      '14 forge road',
      '--use',
      'PLATING',
      '--size',
      '2',
      '--on',
      '2019-04-02',
    );
    expect(result.code).toBe(0);
    expect(result.out).toContain('opened SC-00001 for account A-1001');
    expect(result.err).toBe('');
  });

  it('reads the fire and unmetered flags', async () => {
    await cli(
      'connection', 'open',
      '--account', 'A-1002',
      '--name', 'warehouse loop',
      '--address', '9 dock road',
      '--use', 'WAREHOUSE',
      '--size', '6',
      '--on', '2020-01-01',
      '--fire',
      '--unmetered',
    );
    const shown = await cli('connection', 'show', 'SC-00001');
    expect(shown.out).toContain('fire service        yes');
    expect(shown.out).toContain('purveyor metered    no');
  });

  it('prints the refusal on the error channel', async () => {
    const result = await cli(
      'connection', 'open',
      '--account', 'A-1003',
      '--name', 'somewhere',
      '--address', 'nowhere',
      '--use', 'SPACEPORT',
      '--size', '2',
      '--on', '2020-01-01',
    );
    expect(result.err).toContain('SPACEPORT');
    expect(result.out).toBe('');
  });

  it('will not run without the options it needs', async () => {
    const result = await cli('connection', 'open', '--account', 'A-1');
    expect(result.code).not.toBe(0);
  });
});

describe('connection list', () => {
  beforeEach(async () => {
    await cli(
      'connection', 'open',
      '--account', 'A-1001',
      '--name', 'kerrigan plating',
      '--address', '14 forge road',
      '--use', 'PLATING',
      '--size', '2',
      '--on', '2019-04-02',
      '--route', 'north',
    );
    await cli(
      'connection', 'open',
      '--account', 'A-1002',
      '--name', 'harbour cannery',
      '--address', '2 quay street',
      '--use', 'FOOD_PROC',
      '--size', '4',
      '--on', '2021-06-01',
      '--route', 'south',
    );
  });

  it('lines them up in columns', async () => {
    const result = await cli('connection', 'list');
    expect(result.out).toContain('id        account');
    expect(result.out).toContain('SC-00001  A-1001');
    expect(result.out).toContain('SC-00002  A-1002');
  });

  it('filters by route and by use', async () => {
    const byRoute = await cli('connection', 'list', '--route', 'south');
    expect(byRoute.out).toContain('SC-00002');
    expect(byRoute.out).not.toContain('SC-00001');
    const byUse = await cli('connection', 'list', '--use', 'PLATING');
    expect(byUse.out).toContain('SC-00001');
    expect(byUse.out).not.toContain('SC-00002');
  });

  it('writes json when it is asked to', async () => {
    const io = capturingIo();
    const code = await run(['connection', 'list', '--json'], { io, runner: borrow(() => register, '2024-08-05') });
    expect(code).toBe(0);
    const rows = JSON.parse(io.lines.join('\n')) as Array<{ connectionId: string }>;
    expect(rows.map((row) => row.connectionId)).toEqual(['SC-00001', 'SC-00002']);
  });

  it('leaves a closed connection out unless it is asked for', async () => {
    await cli('connection', 'close', 'SC-00002', '--on', '2024-01-01', '--reason', 'demolished');
    const open = await cli('connection', 'list');
    expect(open.out).not.toContain('SC-00002');
    const all = await cli('connection', 'list', '--all');
    expect(all.out).toContain('SC-00002');
  });
});

describe('the other connection commands', () => {
  beforeEach(async () => {
    await cli(
      'connection', 'open',
      '--account', 'A-1001',
      '--name', 'kerrigan plating',
      '--address', '14 forge road',
      '--use', 'PLATING',
      '--size', '2',
      '--on', '2019-04-02',
    );
  });

  it('shows one', async () => {
    const result = await cli('connection', 'show', 'SC-00001');
    expect(result.out).toContain('premise             kerrigan plating');
    expect(result.out).toContain('use                 PLATING');
  });

  it('says so when there is nothing to show', async () => {
    const result = await cli('connection', 'show', 'SC-00404');
    expect(result.err).toContain('SC-00404');
  });

  it('records a change of tenant and asks for a fresh survey', async () => {
    const result = await cli(
      'connection', 'retenant', 'SC-00001',
      '--use', 'WAREHOUSE',
      '--on', '2024-06-01',
      '--name', 'forge road storage',
    );
    expect(result.out).toContain('was PLATING and is now WAREHOUSE');
    expect(result.out).toContain('walk it again');
  });

  it('closes one with a reason', async () => {
    const result = await cli(
      'connection', 'close', 'SC-00001',
      '--on', '2024-07-01',
      '--reason', 'premise demolished',
    );
    expect(result.out).toContain('closed SC-00001 on 2024-07-01');
  });

  it('refuses to close one twice', async () => {
    await cli('connection', 'close', 'SC-00001', '--on', '2024-07-01', '--reason', 'demolished');
    const again = await cli('connection', 'close', 'SC-00001', '--on', '2024-08-01', '--reason', 'again');
    expect(again.err).toContain('came out on 2024-07-01');
  });
});

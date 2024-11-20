import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../src/service/register';
import { cliRunner } from '../support/cli';

let register: Register;

const cli = cliRunner(() => register, '2024-09-20');

beforeEach(async () => {
  const opened = openRegister({ file: ':memory:', actor: 'clerk.hines', now: () => '2024-09-20T09:00:00Z' });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
  await cli(
    'model', 'add', '--id', 'WK-350', '--maker', 'watkin', '--model', '350',
    '--class', 'DC', '--sizes', '2', '--listed', '2016-04-01',
  );
  await cli(
    'connection', 'open', '--account', 'A-1001', '--name', 'kerrigan plating',
    '--address', '14 forge road', '--use', 'INDUSTRIAL', '--size', '2', '--on', '2018-01-01',
  );
  await cli(
    'survey', 'record', 'SC-00001', '--on', '2023-01-10', '--surveyor', 'r. okafor',
    '--findings', 'AUX_WELL',
  );
});

afterEach(() => {
  closeRegister(register);
});

describe('applying', () => {
  it('takes one and says what it holds', async () => {
    const applied = await cli(
      'variance', 'apply', 'SC-00001', '--accept', 'DC', '--on', '2024-03-01',
      '--note', 'the well was capped',
    );
    expect(applied.out).toContain('V-0001 taken, asking for a DC');
    expect(applied.out).toContain('held on a pollutional hazard');
  });

  it('refuses one that asks for what the rules already allow', async () => {
    const applied = await cli('variance', 'apply', 'SC-00001', '--accept', 'RPDA', '--on', '2024-03-01');
    expect(applied.err).toContain('no variance is needed');
  });
});

describe('deciding', () => {
  beforeEach(async () => {
    await cli('variance', 'apply', 'SC-00001', '--accept', 'DC', '--on', '2024-03-01');
  });

  it('grants one on conditions and says what it does not change', async () => {
    const granted = await cli(
      'variance', 'grant', 'V-0001', '--on', '2024-03-20', '--from', '2024-04-01',
      '--until', '2025-03-31', '--conditions', 'the well stays capped; quarterly inspection',
    );
    expect(granted.out).toContain('a DC is accepted from 2024-04-01 to 2025-03-31');
    expect(granted.out).toContain('the test cycle and the notice ladder are unchanged');
    expect(granted.out).toContain('- the well stays capped');
    expect(granted.out).toContain('- quarterly inspection');
  });

  it('will not grant one with nothing written on it', async () => {
    const granted = await cli(
      'variance', 'grant', 'V-0001', '--on', '2024-03-20', '--from', '2024-04-01',
      '--conditions', '  ',
    );
    expect(granted.err).toContain('write at least one down');
  });

  it('refuses one with a reason', async () => {
    const denied = await cli(
      'variance', 'deny', 'V-0001', '--on', '2024-03-20', '--reason', 'the injector is still there',
    );
    expect(denied.out).toContain('V-0001 refused on 2024-03-20');
  });

  it('revokes a granted one', async () => {
    await cli(
      'variance', 'grant', 'V-0001', '--on', '2024-03-20', '--from', '2024-04-01',
      '--conditions', 'the well stays capped',
    );
    const revoked = await cli('variance', 'revoke', 'V-0001', '--on', '2024-09-01', '--reason', 'cap came off');
    expect(revoked.out).toContain('revoked from 2024-09-01');
    expect(revoked.out).toContain('the underlying requirement is back');
  });
});

describe('listing', () => {
  beforeEach(async () => {
    await cli('variance', 'apply', 'SC-00001', '--accept', 'DC', '--on', '2024-03-01');
  });

  it('shows a pending one against its connection', async () => {
    const listed = await cli('variance', 'list', '--connection', 'SC-00001');
    expect(listed.out).toContain('V-0001');
    expect(listed.out).toContain('pending');
  });

  it('shows a granted one as in effect once it starts', async () => {
    await cli(
      'variance', 'grant', 'V-0001', '--on', '2024-03-20', '--from', '2024-04-01',
      '--until', '2025-03-31', '--conditions', 'capped',
    );
    const early = await cli('--as-of', '2024-03-25', 'variance', 'list', '--connection', 'SC-00001');
    expect(early.out).toContain('not_yet_effective');
    const later = await cli('--as-of', '2024-06-01', 'variance', 'list', '--connection', 'SC-00001');
    expect(later.out).toContain('in_effect');
  });

  it('lists everything running across the register', async () => {
    await cli(
      'variance', 'grant', 'V-0001', '--on', '2024-03-20', '--from', '2024-04-01',
      '--conditions', 'capped',
    );
    const listed = await cli('--as-of', '2024-06-01', 'variance', 'list', '--in-effect');
    expect(listed.out).toContain('V-0001');
  });
});

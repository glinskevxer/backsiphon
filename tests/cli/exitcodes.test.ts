import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../src/service/register';
import { cliRunner } from '../support/cli';

let register: Register;

const cli = cliRunner(() => register, '2024-12-13');

beforeEach(async () => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-12-13T09:00:00Z',
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
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
    'PLATING',
    '--size',
    '2',
    '--on',
    '2019-04-02',
  );
});

afterEach(() => {
  closeRegister(register);
});

describe('what the shell sees', () => {
  it('exits zero when the command did what it was asked', async () => {
    const listed = await cli('connection', 'list');
    expect(listed.code).toBe(0);
    expect(listed.err).toBe('');
  });

  it('exits non zero when the register refused', async () => {
    const missing = await cli('connection', 'show', 'SC-00404');
    expect(missing.code).toBe(1);
    expect(missing.err).toContain('SC-00404');
  });

  it('exits non zero on a bad option rather than pretending', async () => {
    const bad = await cli('survey', 'record', 'SC-00001', '--on', 'yesterday', '--surveyor', 'r');
    expect(bad.code).toBe(1);
  });

  it('exits non zero when commander cannot parse the line at all', async () => {
    const missing = await cli('connection', 'open', '--account', 'A-1');
    expect(missing.code).not.toBe(0);
  });

  it('exits zero for a command that found nothing to print', async () => {
    const empty = await cli('notice', 'open');
    expect(empty.code).toBe(0);
  });

  it('exits non zero for a subcommand nobody has', async () => {
    const nonsense = await cli('connection', 'levitate');
    expect(nonsense.code).not.toBe(0);
  });
});

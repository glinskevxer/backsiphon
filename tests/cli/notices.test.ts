import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../src/service/register';
import { contextFor, type CommandContext, type GlobalOptions } from '../../src/cli/context';
import { capturingIo, type CliIo } from '../../src/cli/output';
import { run, type Runner } from '../../src/cli/program';
import type { Result } from '../../src/util/result';

let register: Register;

function borrow(): Runner {
  return <T>(
    options: GlobalOptions,
    io: CliIo,
    work: (context: CommandContext) => Result<T, string>,
  ): Result<T, string> =>
    work(contextFor(register, io, options.asOf ?? '2024-09-10', options.json === true));
}

async function cli(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const io = capturingIo();
  const code = await run(argv, { io, runner: borrow() });
  return { code, out: io.lines.join('\n'), err: io.errors.join('\n') };
}

beforeEach(async () => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-09-10T09:00:00Z',
    policy: { purveyorName: 'north valley water' },
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
  await cli(
    'model', 'add', '--id', 'WK-375', '--maker', 'watkin', '--model', '375',
    '--class', 'RP', '--sizes', '2', '--listed', '2016-04-01',
  );
  await cli(
    'tester', 'add', '--id', 'T-118', '--name', 'p. adeyemi', '--agency', 'board',
    '--certificate', 'BF-4471', '--issued', '2019-05-01', '--expires', '2029-04-30',
    '--endorsements', 'RP',
  );
  await cli(
    'gauge', 'add', '--id', 'G-77', '--tester', 'T-118', '--maker', 'midwest',
    '--serial', '845-C', '--calibrated', '2019-05-01', '--accuracy', '0.2', '--interval', '240',
  );
  await cli(
    'connection', 'open', '--account', 'A-1001', '--name', 'kerrigan plating',
    '--address', '14 forge road', '--use', 'INDUSTRIAL', '--size', '2', '--on', '2018-01-01',
  );
  await cli(
    'survey', 'record', 'SC-00001', '--on', '2022-01-10', '--surveyor', 'r. okafor',
    '--findings', 'AUX_WELL',
  );
  await cli(
    'assembly', 'install', 'SC-00001', '--scope', 'containment', '--class', 'RP',
    '--model', 'WK-375', '--serial', '1', '--size', '2', '--on', '2022-02-01',
    '--location', 'vault',
  );
  await cli(
    'test', 'file', 'BA-00001', '--tester', 'T-118', '--gauge', 'G-77',
    '--on', '2023-03-01', '--filed', '2023-03-01',
    '--reading', 'check1Differential=8.2', '--reading', 'reliefOpening=3.1',
  );
});

afterEach(() => {
  closeRegister(register);
});

describe('notice run', () => {
  it('writes nothing where nothing is due', async () => {
    const result = await cli('--as-of', '2024-01-01', 'notice', 'run');
    expect(result.out).toContain('1 connections, 0 letters (none), 0 skipped');
  });

  it('writes the rung the connection has reached', async () => {
    const result = await cli('--as-of', '2024-03-05', 'notice', 'run');
    expect(result.out).toContain('N-000001');
    expect(result.out).toContain('first');
    expect(result.out).toContain('health hazard');
  });

  it('writes nothing on a dry run and says so', async () => {
    const dry = await cli('--as-of', '2024-03-05', 'notice', 'run', '--dry-run');
    expect(dry.out).toContain('nothing was written');
    const open = await cli('notice', 'open');
    expect(open.out).not.toContain('N-000001');
  });

  it('skips a rung that has already gone out', async () => {
    await cli('--as-of', '2024-03-05', 'notice', 'run');
    const again = await cli('--as-of', '2024-03-06', 'notice', 'run');
    expect(again.out).toContain('skipped');
    expect(again.out).toContain('already gone out');
  });

  it('takes one route at a time', async () => {
    const result = await cli('--as-of', '2024-03-05', 'notice', 'run', '--route', 'south');
    expect(result.out).toContain('0 connections');
  });
});

describe('reading the letters back', () => {
  beforeEach(async () => {
    await cli('--as-of', '2024-03-05', 'notice', 'run');
  });

  it('lists what is open', async () => {
    const open = await cli('notice', 'open');
    expect(open.out).toContain('N-000001');
    expect(open.out).toContain('SC-00001');
  });

  it('shows the ladder on one connection', async () => {
    const shown = await cli('notice', 'show', 'SC-00001');
    expect(shown.out).toContain('N-000001');
    expect(shown.out).toContain('first');
  });

  it('prints the text of the letter when asked', async () => {
    const shown = await cli('notice', 'show', 'SC-00001', '--body');
    expect(shown.out).toContain('north valley water cross connection control program');
    expect(shown.out).toContain('please arrange a test');
  });

  it('drops a letter off the open list once a passing test lands', async () => {
    await cli(
      'test', 'file', 'BA-00001', '--tester', 'T-118', '--gauge', 'G-77',
      '--on', '2024-03-20', '--filed', '2024-03-20',
      '--reading', 'check1Differential=8.2', '--reading', 'reliefOpening=3.1',
    );
    const open = await cli('notice', 'open');
    expect(open.out).not.toContain('N-000001');
    const shown = await cli('notice', 'show', 'SC-00001');
    expect(shown.out).toContain('2024-03-20');
  });
});

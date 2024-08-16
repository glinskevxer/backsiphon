import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../src/service/register';
import { contextFor, type CommandContext, type GlobalOptions } from '../../src/cli/context';
import { capturingIo, type CliIo } from '../../src/cli/output';
import { run, type Runner } from '../../src/cli/program';
import { parseReadings } from '../../src/cli/commands/tests';
import type { Result } from '../../src/util/result';

let register: Register;

function borrow(): Runner {
  return <T>(
    options: GlobalOptions,
    io: CliIo,
    work: (context: CommandContext) => Result<T, string>,
  ): Result<T, string> =>
    work(contextFor(register, io, options.asOf ?? '2024-08-25', options.json === true));
}

async function cli(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const io = capturingIo();
  const code = await run(argv, { io, runner: borrow() });
  return { code, out: io.lines.join('\n'), err: io.errors.join('\n') };
}

beforeEach(async () => {
  const opened = openRegister({ file: ':memory:', actor: 'clerk.hines', now: () => '2024-08-25T09:00:00Z' });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
  await cli(
    'connection', 'open', '--account', 'A-1001', '--name', 'kerrigan plating',
    '--address', '14 forge road', '--use', 'PLATING', '--size', '2', '--on', '2019-04-02',
  );
  await cli(
    'model', 'add', '--id', 'WK-375', '--maker', 'watkin', '--model', '375',
    '--class', 'RP', '--sizes', '2', '--listed', '2016-04-01',
  );
  await cli(
    'tester', 'add', '--id', 'T-118', '--name', 'p. adeyemi', '--agency', 'board',
    '--certificate', 'BF-4471', '--issued', '2019-05-01', '--expires', '2029-04-30',
    '--endorsements', 'RP,DC',
  );
  await cli(
    'gauge', 'add', '--id', 'G-77', '--tester', 'T-118', '--maker', 'midwest',
    '--serial', '845-C', '--calibrated', '2024-02-15', '--accuracy', '0.2',
  );
  await cli(
    'assembly', 'install', 'SC-00001', '--scope', 'containment', '--class', 'RP',
    '--model', 'WK-375', '--serial', '4471182', '--size', '2', '--on', '2021-06-01',
    '--location', 'vault',
  );
});

afterEach(() => {
  closeRegister(register);
});

describe('reading the readings off the command line', () => {
  it('takes numbers', () => {
    expect(parseReadings(['check1Differential=8.2', 'reliefOpening=3.1'])).toEqual({
      ok: true,
      value: { check1Differential: 8.2, reliefOpening: 3.1 },
    });
  });

  it('takes a yes or a no in the words a tester writes', () => {
    const parsed = parseReadings(['bypassTight=yes', 'ventTight=weeping']);
    expect(parsed.ok && parsed.value).toEqual({ bypassTight: true, ventTight: false });
  });

  it('refuses a pair with no equals in it, a blank name, or a word', () => {
    expect(parseReadings(['check1Differential']).ok).toBe(false);
    expect(parseReadings(['=8.2']).ok).toBe(false);
    expect(parseReadings(['check1Differential=lovely']).ok).toBe(false);
    expect(parseReadings(['check1Differential=']).ok).toBe(false);
  });

  it('refuses the same reading twice', () => {
    const parsed = parseReadings(['check1Differential=8.2', 'check1Differential=7']);
    expect(parsed.ok).toBe(false);
  });

  it('takes an empty list', () => {
    expect(parseReadings([])).toEqual({ ok: true, value: {} });
  });
});

describe('test file', () => {
  it('files a passing report and says what it read', async () => {
    const filed = await cli(
      'test', 'file', 'BA-00001',
      '--tester', 'T-118', '--gauge', 'G-77', '--on', '2024-05-14', '--filed', '2024-05-16',
      '--reading', 'check1Differential=8.2', '--reading', 'reliefOpening=3.1',
    );
    expect(filed.out).toContain('TR-000001 filed');
    expect(filed.out).toContain('pass on the as_found set');
    expect(filed.out).toContain('differential across the first check read 8.2');
  });

  it('says the assembly is still untested when the report is refused', async () => {
    await cli('tester', 'suspend', 'T-118', '--on', '2024-01-01', '--reason', 'falsified reports');
    const filed = await cli(
      'test', 'file', 'BA-00001',
      '--tester', 'T-118', '--gauge', 'G-77', '--on', '2024-05-14', '--filed', '2024-05-16',
      '--reading', 'check1Differential=8.2', '--reading', 'reliefOpening=3.1',
    );
    expect(filed.out).toContain('still untested');
    expect(filed.out).toContain('suspended');
  });

  it('files a repair with its as left readings', async () => {
    const filed = await cli(
      'test', 'file', 'BA-00001',
      '--tester', 'T-118', '--gauge', 'G-77', '--on', '2024-05-14', '--filed', '2024-05-16',
      '--reading', 'check1Differential=0.4', '--reading', 'reliefOpening=3.1',
      '--as-left', 'check1Differential=8.8', '--as-left', 'reliefOpening=3.1',
      '--repair', 'new first check rubber',
    );
    expect(filed.out).toContain('pass on the as_left set');
  });

  it('refuses a repair with no as left readings', async () => {
    const filed = await cli(
      'test', 'file', 'BA-00001',
      '--tester', 'T-118', '--gauge', 'G-77', '--on', '2024-05-14', '--filed', '2024-05-16',
      '--reading', 'check1Differential=0.4', '--reading', 'reliefOpening=3.1',
      '--repair', 'reground the check',
    );
    expect(filed.err).toContain('as left');
  });

  it('files against today when nobody says when the paperwork arrived', async () => {
    const filed = await cli(
      'test', 'file', 'BA-00001',
      '--tester', 'T-118', '--gauge', 'G-77', '--on', '2024-08-20',
      '--reading', 'check1Differential=8.2', '--reading', 'reliefOpening=3.1',
    );
    expect(filed.out).toContain('TR-000001 filed');
    const history = await cli('test', 'history', 'BA-00001');
    expect(history.out).toContain('2024-08-20');
  });

  it('refuses a malformed reading before it opens anything', async () => {
    const filed = await cli(
      'test', 'file', 'BA-00001',
      '--tester', 'T-118', '--gauge', 'G-77', '--on', '2024-05-14',
      '--reading', 'check1Differential',
    );
    expect(filed.err).toContain('write it as key=value');
  });
});

describe('the other test commands', () => {
  it('lists the history with the refusals in it', async () => {
    await cli(
      'test', 'file', 'BA-00001',
      '--tester', 'T-118', '--gauge', 'G-77', '--on', '2023-05-14', '--filed', '2023-05-16',
      '--reading', 'check1Differential=8.2', '--reading', 'reliefOpening=3.1',
    );
    await cli(
      'test', 'file', 'BA-00001',
      '--tester', 'T-118', '--gauge', 'G-77', '--on', '2024-05-14', '--filed', '2024-07-30',
      '--reading', 'check1Differential=8.2', '--reading', 'reliefOpening=3.1',
    );
    const history = await cli('test', 'history', 'BA-00001');
    expect(history.out).toContain('TR-000002');
    expect(history.out).toContain('filed_too_late');
  });

  it('says so when the assembly is not on file', async () => {
    const history = await cli('test', 'history', 'BA-00404');
    expect(history.err).toContain('BA-00404');
  });

  it('prints the form a class asks for', async () => {
    const form = await cli('test', 'form', 'RP');
    expect(form.out).toContain('check1Differential');
    expect(form.out).toContain('reliefOpening');
    const none = await cli('test', 'form', 'AVB');
    expect(none.err).toContain('no field procedure');
  });
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../src/service/register';
import { contextFor, type CommandContext, type GlobalOptions } from '../../src/cli/context';
import { capturingIo, type CliIo } from '../../src/cli/output';
import { run, type Runner } from '../../src/cli/program';
import type { Result } from '../../src/util/result';

let register: Register;
let scratch: string;

function borrow(): Runner {
  return <T>(
    options: GlobalOptions,
    io: CliIo,
    work: (context: CommandContext) => Result<T, string>,
  ): Result<T, string> =>
    work(contextFor(register, io, options.asOf ?? '2024-10-25', options.json === true));
}

async function cli(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const io = capturingIo();
  const code = await run(argv, { io, runner: borrow() });
  return { code, out: io.lines.join('\n'), err: io.errors.join('\n') };
}

function fileWith(text: string): string {
  const path = join(scratch, 'batch.csv');
  writeFileSync(path, text);
  return path;
}

const HEADER = 'assembly,tester,gauge,tested,filed,repair,found.check1Differential,found.reliefOpening';

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'backsiphon-import-'));
  const opened = openRegister({ file: ':memory:', actor: 'clerk.hines', now: () => '2024-10-25T09:00:00Z' });
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
    'assembly', 'install', 'SC-00001', '--scope', 'containment', '--class', 'RP',
    '--model', 'WK-375', '--serial', '1', '--size', '2', '--on', '2019-01-01',
    '--location', 'vault',
  );
});

afterEach(() => {
  closeRegister(register);
  rmSync(scratch, { recursive: true, force: true });
});

describe('import', () => {
  it('files what it can and counts it', async () => {
    const path = fileWith(`${HEADER}\nBA-00001,T-118,G-77,2024-03-01,2024-03-05,,8.2,3.1`);
    const result = await cli('import', path);
    expect(result.out).toContain('1 filed, 1 accepted, 1 of those passing');
    const history = await cli('test', 'history', 'BA-00001');
    expect(history.out).toContain('TR-000001');
  });

  it('writes nothing on a dry run and says the same numbers', async () => {
    const path = fileWith(`${HEADER}\nBA-00001,T-118,G-77,2024-03-01,2024-03-05,,8.2,3.1`);
    const dry = await cli('import', path, '--dry-run');
    expect(dry.out).toContain('1 filed, 1 accepted');
    expect(dry.out).toContain('nothing was written');
    const history = await cli('test', 'history', 'BA-00001');
    expect(history.out).not.toContain('TR-000001');
  });

  it('names the rows it could not read and files the rest', async () => {
    const path = fileWith(
      `${HEADER}\n,T-118,G-77,2024-03-01,2024-03-05,,8.2,3.1\nBA-00001,T-118,G-77,2024-03-02,2024-03-05,,7.9,2.8`,
    );
    const result = await cli('import', path);
    expect(result.out).toContain('rows nobody could read');
    expect(result.out).toContain('1 filed');
  });

  it('lists the refused ones with their reason', async () => {
    await cli('tester', 'suspend', 'T-118', '--on', '2024-01-01', '--reason', 'falsified reports');
    const path = fileWith(`${HEADER}\nBA-00001,T-118,G-77,2024-03-01,2024-03-05,,8.2,3.1`);
    const result = await cli('import', path);
    expect(result.out).toContain('still untested');
    expect(result.out).toContain('tester_suspended');
  });

  it('says so when the file is not there', async () => {
    const result = await cli('import', join(scratch, 'nothing.csv'));
    expect(result.err).toContain('could not be read');
  });

  it('says so when the file is the wrong shape', async () => {
    const path = fileWith('tester,gauge\nT-118,G-77');
    const result = await cli('import', path);
    expect(result.err).toContain('no assembly');
  });
});

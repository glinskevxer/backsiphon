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
    work(contextFor(register, io, options.asOf ?? '2024-10-01', options.json === true));
}

async function cli(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const io = capturingIo();
  const code = await run(argv, { io, runner: borrow() });
  return { code, out: io.lines.join('\n'), err: io.errors.join('\n') };
}

beforeEach(async () => {
  const opened = openRegister({ file: ':memory:', actor: 'clerk.hines', now: () => '2024-10-01T09:00:00Z' });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
  await cli(
    'connection', 'open', '--account', 'A-1001', '--name', 'kerrigan plating',
    '--address', '14 forge road', '--use', 'PLATING', '--size', '2', '--on', '2019-04-02',
  );
  await cli('survey', 'record', 'SC-00001', '--on', '2023-01-10', '--surveyor', 'r. okafor');
});

afterEach(() => {
  closeRegister(register);
});

describe('audit trail', () => {
  it('shows what happened to one connection in order', async () => {
    const trail = await cli('audit', 'trail', 'connection', 'SC-00001');
    expect(trail.out).toContain('connection_opened');
    expect(trail.out).toContain('survey_recorded');
    expect(trail.out).toContain('clerk.hines');
  });

  it('refuses a subject kind nobody keeps a trail against', async () => {
    const trail = await cli('audit', 'trail', 'weather', 'SC-00001');
    expect(trail.err).toContain('not something the trail is kept against');
  });

  it('lists the recent ones newest first and takes a limit', async () => {
    const recent = await cli('audit', 'recent', '--limit', '1');
    expect(recent.out).toContain('survey_recorded');
    expect(recent.out).not.toContain('connection_opened');
  });

  it('filters by kind and by clerk', async () => {
    const byKind = await cli('audit', 'recent', '--kind', 'connection_opened');
    expect(byKind.out).toContain('connection_opened');
    expect(byKind.out).not.toContain('survey_recorded');
    const byActor = await cli('audit', 'recent', '--by', 'somebody.else');
    expect(byActor.out).not.toContain('clerk.hines');
    const mine = await cli('audit', 'recent', '--by', 'clerk.hines');
    expect(mine.out).toContain('survey_recorded');
  });

  it('counts what the trail is made of', async () => {
    const summary = await cli('audit', 'summary');
    expect(summary.out).toContain('2 events on the trail');
    expect(summary.out).toContain('connection_opened');
  });

  it('writes json for a script', async () => {
    const io = capturingIo();
    await run(['--json', 'audit', 'summary'], { io, runner: borrow() });
    const parsed = JSON.parse(io.lines.join('\n')) as { total: number };
    expect(parsed.total).toBe(2);
  });
});

describe('reinspection', () => {
  it('records a visit and says it will be billed', async () => {
    const visit = await cli(
      'reinspection', 'SC-00001', '--on', '2024-05-01', '--note', 'gate locked, nobody on site',
    );
    expect(visit.out).toContain('visit recorded against SC-00001 on 2024-05-01');
    expect(visit.out).toContain('next invoice');
    const trail = await cli('audit', 'trail', 'connection', 'SC-00001');
    expect(trail.out).toContain('reinspection_visit');
    expect(trail.out).toContain('gate locked');
  });

  it('refuses one against a connection nobody has', async () => {
    const visit = await cli('reinspection', 'SC-00404', '--on', '2024-05-01', '--note', 'x');
    expect(visit.err).toContain('SC-00404');
  });
});

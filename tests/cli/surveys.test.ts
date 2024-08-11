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
    work(contextFor(register, io, options.asOf ?? '2024-08-11', options.json === true));
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
    now: () => '2024-08-11T09:00:00Z',
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
  await cli(
    'connection', 'open',
    '--account', 'A-1001',
    '--name', 'kerrigan plating',
    '--address', '14 forge road',
    '--use', 'INDUSTRIAL',
    '--size', '2',
    '--on', '2019-04-02',
  );
});

afterEach(() => {
  closeRegister(register);
});

describe('survey record', () => {
  it('records one and reports both degrees', async () => {
    const result = await cli(
      'survey', 'record', 'SC-00001',
      '--on', '2023-05-02',
      '--surveyor', 'r. okafor',
      '--findings', 'AUX_WELL,DOCK_HYDRANT',
    );
    expect(result.code).toBe(0);
    expect(result.out).toContain('SV-00001 recorded, containment health, isolation nonhealth');
    expect(result.out).toContain('the next survey is due 2024-05-02');
  });

  it('takes the codes in any case with spaces round them', async () => {
    const result = await cli(
      'survey', 'record', 'SC-00001',
      '--on', '2023-05-02',
      '--surveyor', 'r. okafor',
      '--findings', ' aux_well , dock_hydrant ',
    );
    expect(result.out).toContain('containment health');
  });

  it('records a survey with nothing on it', async () => {
    const result = await cli(
      'survey', 'record', 'SC-00001',
      '--on', '2023-05-02',
      '--surveyor', 'r. okafor',
    );
    expect(result.out).toContain('containment nonhealth');
  });

  it('records a refused survey as the worst case at the meter', async () => {
    const result = await cli(
      'survey', 'record', 'SC-00001',
      '--on', '2023-05-02',
      '--surveyor', 'r. okafor',
      '--refused',
    );
    expect(result.out).toContain('containment health');
  });

  it('reports a degree that moved', async () => {
    await cli('survey', 'record', 'SC-00001', '--on', '2021-05-02', '--surveyor', 'r');
    const second = await cli(
      'survey', 'record', 'SC-00001',
      '--on', '2023-05-02',
      '--surveyor', 'r',
      '--findings', 'AUX_WELL',
    );
    expect(second.out).toContain('the containment degree moved nonhealth to health');
  });

  it('says so when a code is not one of ours', async () => {
    const result = await cli(
      'survey', 'record', 'SC-00001',
      '--on', '2023-05-02',
      '--surveyor', 'r',
      '--findings', 'GHOSTS',
    );
    expect(result.err).toContain('GHOSTS');
  });
});

describe('survey show', () => {
  beforeEach(async () => {
    await cli('survey', 'record', 'SC-00001', '--on', '2021-05-02', '--surveyor', 'r. okafor');
    await cli(
      'survey', 'record', 'SC-00001',
      '--on', '2023-05-02',
      '--surveyor', 'j. mbeki',
      '--findings', 'AUX_WELL',
    );
  });

  it('shows the current one with its findings spelled out', async () => {
    const result = await cli('survey', 'show', 'SC-00001');
    expect(result.out).toContain('surveyor          j. mbeki');
    expect(result.out).toContain('AUX_WELL, auxiliary supply from a private well');
  });

  it('shows the history newest first', async () => {
    const result = await cli('survey', 'show', 'SC-00001', '--history');
    const lines = result.out.split('\n');
    expect(lines[2]).toContain('SV-00002');
    expect(lines[3]).toContain('SV-00001');
  });

  it('reads the register as at a day', async () => {
    const result = await cli('--as-of', '2022-01-01', 'survey', 'show', 'SC-00001');
    expect(result.out).toContain('SV-00001');
  });

  it('says so when nobody has walked it', async () => {
    await cli(
      'connection', 'open',
      '--account', 'A-1002',
      '--name', 'unwalked',
      '--address', 'somewhere',
      '--use', 'OFFICE',
      '--size', '1',
      '--on', '2020-01-01',
    );
    const result = await cli('survey', 'show', 'SC-00002');
    expect(result.err).toContain('never been surveyed');
  });
});

describe('survey due', () => {
  it('lists the ones past their date and the ones nobody has walked', async () => {
    await cli(
      'connection', 'open',
      '--account', 'A-1002',
      '--name', 'unwalked',
      '--address', 'somewhere',
      '--use', 'OFFICE',
      '--size', '1',
      '--on', '2020-01-01',
    );
    await cli(
      'survey', 'record', 'SC-00001',
      '--on', '2023-05-02',
      '--surveyor', 'r',
      '--findings', 'AUX_WELL',
    );
    const result = await cli('--as-of', '2024-08-11', 'survey', 'due');
    expect(result.out).toContain('SC-00001');
    expect(result.out).toContain('never walked at all');
    expect(result.out).toContain('SC-00002');
  });

  it('writes json for a script', async () => {
    await cli('survey', 'record', 'SC-00001', '--on', '2023-05-02', '--surveyor', 'r');
    const io = capturingIo();
    await run(['--json', 'survey', 'due'], { io, runner: borrow() });
    const parsed = JSON.parse(io.lines.join('\n')) as { due: unknown[]; neverSurveyed: string[] };
    expect(Array.isArray(parsed.due)).toBe(true);
    expect(parsed.neverSurveyed).toEqual([]);
  });
});

describe('survey findings', () => {
  it('prints the catalogue a surveyor writes from', async () => {
    const result = await cli('survey', 'findings');
    expect(result.out).toContain('AUX_WELL');
    expect(result.out).toContain('health');
    expect(result.out.split('\n').length).toBeGreaterThan(20);
  });
});

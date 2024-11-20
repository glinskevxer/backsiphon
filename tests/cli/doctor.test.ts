import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { suspendTester } from '../../src/storage/repositories/testers';
import { openOffice, open, walk, fit, fileTest, type Office } from '../support/office';
import { borrow, cliRunner } from '../support/cli';
import { capturingIo } from '../../src/cli/output';
import { run } from '../../src/cli/program';

let office: Office;

const cli = cliRunner(() => office.register, '2024-11-05');
let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'backsiphon-backup-'));
  office = openOffice();
});

afterEach(() => {
  office.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe('doctor', () => {
  it('says so when there is nothing to report', async () => {
    const connectionId = open(office, { accountNumber: 'A-1' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2024-02-01' });
    fileTest(office, { assemblyId, testedOn: '2024-02-05' });
    const result = await cli('--as-of', '2024-06-01', 'doctor');
    expect(result.out).toBe('nothing to report');
  });

  it('lists what it found and counts it', async () => {
    open(office, { accountNumber: 'A-2' });
    suspendTester(office.register.db, 'T-118', '2024-06-01', 'falsified reports');
    const result = await cli('doctor');
    expect(result.out).toContain('never surveyed');
    expect(result.out).toContain('certificate not current');
    expect(result.out).toContain('0 faults, 2 warnings');
  });

  it('takes only the faults when it is asked to', async () => {
    open(office, { accountNumber: 'A-3' });
    const result = await cli('doctor', '--faults-only');
    expect(result.out).toBe('nothing to report');
  });
});

describe('backup and verify', () => {
  it('writes a copy and says how big it is', async () => {
    const connectionId = open(office, { accountNumber: 'A-4' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    const target = join(scratch, 'copy.sqlite');
    const result = await cli('backup', target);
    expect(existsSync(target)).toBe(true);
    expect(result.out).toContain('written to');
    expect(result.out).toContain('004_fixture');
  });

  it('will not write over a copy that is already there', async () => {
    const target = join(scratch, 'copy.sqlite');
    await cli('backup', target);
    const again = await cli('backup', target);
    expect(again.err).toContain('never writes over one');
  });

  it('says the file is sound', async () => {
    const result = await cli('verify');
    expect(result.out).toContain('the file is sound');
    expect(result.out).toContain('ok');
  });

  it('writes the verification as json', async () => {
    const io = capturingIo();
    await run(['--json', 'verify'], { io, runner: borrow(() => office.register, '2024-11-05') });
    const parsed = JSON.parse(io.lines.join('\n')) as { ok: boolean; foreignKeyProblems: number };
    expect(parsed.ok).toBe(true);
    expect(parsed.foreignKeyProblems).toBe(0);
  });
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { backupTo, checkIntegrity, readBackup } from '../../../src/service/backup';
import { loadDemoDistrict } from '../../../src/service/demo';
import { listConnections } from '../../../src/storage/repositories/connections';
import { openOffice, type Office } from '../../support/office';

let office: Office;
let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'backsiphon-backup-'));
  office = openOffice();
  const loaded = loadDemoDistrict(office.register, '2025-06-01');
  if (!loaded.ok) {
    throw new Error(loaded.error);
  }
});

afterEach(() => {
  office.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe('writing one', () => {
  it('writes a file with the schema and the pages in it', () => {
    const target = join(scratch, 'copy.sqlite');
    const written = backupTo(office.register, target);
    expect(written.ok).toBe(true);
    if (!written.ok) {
      return;
    }
    expect(written.value.bytes).toBeGreaterThan(1000);
    expect(written.value.pages).toBeGreaterThan(0);
    expect(written.value.schemaVersion).toMatch(/^[0-9]{3}_/);
  });

  it('will not write over one and will not write nowhere', () => {
    const target = join(scratch, 'copy.sqlite');
    backupTo(office.register, target);
    expect(backupTo(office.register, target).ok).toBe(false);
    expect(backupTo(office.register, '   ').ok).toBe(false);
  });
});

describe('reading one back', () => {
  it('counts what is in it without touching the register', () => {
    const target = join(scratch, 'copy.sqlite');
    backupTo(office.register, target);
    const reading = readBackup(target);
    expect(reading.ok).toBe(true);
    if (!reading.ok) {
      return;
    }
    expect(reading.value.connections).toBe(listConnections(office.register.db).length);
    expect(reading.value.assemblies).toBe(8);
    expect(reading.value.sound).toBe(true);
    expect(reading.value.events).toBeGreaterThan(20);
  });

  it('reads a backup taken before the district grew', () => {
    const early = join(scratch, 'early.sqlite');
    backupTo(office.register, early);
    const before = readBackup(early);
    expect(before.ok && before.value.connections).toBe(11);
  });

  it('says so when there is no file there', () => {
    expect(readBackup(join(scratch, 'nothing.sqlite')).ok).toBe(false);
  });

  it('says so when the file is not a database at all', () => {
    const rubbish = join(scratch, 'rubbish.sqlite');
    writeFileSync(rubbish, 'this is not a database, it is a letter');
    expect(readBackup(rubbish).ok).toBe(false);
  });
});

describe('what sqlite says about the live file', () => {
  it('reads it as sound with nothing pointing at nothing', () => {
    const integrity = checkIntegrity(office.register);
    expect(integrity.ok).toBe(true);
    expect(integrity.messages).toEqual(['ok']);
    expect(integrity.foreignKeyProblems).toBe(0);
  });
});

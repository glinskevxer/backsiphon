import { afterEach, describe, expect, it } from 'vitest';

import {
  asActor,
  closeRegister,
  DEFAULT_PROGRAM_POLICY,
  mergePolicy,
  mintId,
  openRegister,
  type Register,
} from '../../../src/service/register';
import { CONNECTION_ID } from '../../../src/util/ids';
import { execute, tableNames } from '../../../src/storage/db';
import { schemaVersion } from '../../../src/storage/migrations';

let register: Register | undefined;

function open(overrides: Parameters<typeof openRegister>[0] = { file: ':memory:' }): Register {
  const result = openRegister(overrides);
  if (!result.ok) {
    throw new Error(result.error);
  }
  register = result.value;
  return result.value;
}

afterEach(() => {
  if (register !== undefined) {
    closeRegister(register);
    register = undefined;
  }
});

describe('opening one', () => {
  it('migrates the store on the way in', () => {
    const open1 = open();
    expect(tableNames(open1.db)).toContain('service_connections');
    expect(schemaVersion(open1.db)).toBe('003_testing');
  });

  it('takes the default policy when it is given none', () => {
    expect(open().policy).toEqual(DEFAULT_PROGRAM_POLICY);
  });

  it('takes a clock so a test can hold time still', () => {
    const held = open({ file: ':memory:', now: () => '2024-06-01T12:00:00Z' });
    expect(held.now()).toBe('2024-06-01T12:00:00Z');
    expect(held.now()).toBe('2024-06-01T12:00:00Z');
  });

  it('names the clerk, or says it does not know', () => {
    expect(open().actor).toBe('unknown');
    const known = asActor(open({ file: ':memory:', actor: 'clerk.hines' }), 'clerk.owusu');
    expect(known.actor).toBe('clerk.owusu');
  });

  it('builds a working calendar covering the years it was asked for', () => {
    const narrow = open({ file: ':memory:', calendarYears: { from: 2024, to: 2024 } });
    expect(narrow.calendar.holidays.has('2024-07-04')).toBe(true);
    expect(narrow.calendar.holidays.has('2025-07-04')).toBe(false);
  });
});

describe('policy merging', () => {
  it('keeps the defaults nobody overrode', () => {
    const merged = mergePolicy({ purveyorName: 'north valley water' });
    expect(merged.purveyorName).toBe('north valley water');
    expect(merged.filingWindowDays).toBe(DEFAULT_PROGRAM_POLICY.filingWindowDays);
    expect(merged.cycle).toEqual(DEFAULT_PROGRAM_POLICY.cycle);
  });

  it('merges the cycle policy one field at a time', () => {
    const merged = mergePolicy({ cycle: { ...DEFAULT_PROGRAM_POLICY.cycle, repairWorkdays: 10 } });
    expect(merged.cycle.repairWorkdays).toBe(10);
    expect(merged.cycle.intervalMonths).toBe(12);
  });

  it('hands the default straight back when there is nothing to merge', () => {
    expect(mergePolicy(undefined)).toBe(DEFAULT_PROGRAM_POLICY);
  });
});

describe('minting an id', () => {
  function addConnection(store: Register, id: string, account: string): void {
    execute(
      store.db,
      `insert into service_connections (
         connection_id, account_number, premise_name, premise_address, premise_use_code,
         service_size_inches, fire_service, purveyor_metered, connected_on
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, account, 'a premise', 'somewhere', 'OFFICE', 1, 0, 1, '2020-01-01'],
    );
  }

  it('starts at one on an empty store', () => {
    expect(mintId(open(), CONNECTION_ID, 'service_connections', 'connection_id')).toBe('SC-00001');
  });

  it('follows the highest on file', () => {
    const store = open();
    addConnection(store, 'SC-00001', 'A-1');
    addConnection(store, 'SC-00007', 'A-2');
    addConnection(store, 'SC-00003', 'A-3');
    expect(mintId(store, CONNECTION_ID, 'service_connections', 'connection_id')).toBe('SC-00008');
  });

  it('steps over ids that came in from somewhere else', () => {
    const store = open();
    addConnection(store, 'SC-00002', 'A-1');
    addConnection(store, 'LEGACY-88', 'A-2');
    expect(mintId(store, CONNECTION_ID, 'service_connections', 'connection_id')).toBe('SC-00003');
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, type Database } from '../../../../src/storage/db';
import { migrate } from '../../../../src/storage/schema';
import {
  disconnect,
  findConnection,
  findConnectionByAccount,
  insertConnection,
  isInService,
  listConnections,
  updateConnection,
  type ConnectionRecord,
} from '../../../../src/storage/repositories/connections';

let db: Database;

function record(overrides: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return {
    connectionId: 'SC-1',
    accountNumber: 'A-1001',
    premiseName: 'kerrigan plating',
    premiseAddress: '14 forge road',
    premiseUseCode: 'PLATING',
    serviceSizeInches: 2,
    fireService: false,
    purveyorMetered: true,
    connectedOn: '2019-04-02',
    route: 'north',
    ...overrides,
  };
}

beforeEach(() => {
  db = openDatabase({ file: ':memory:' });
  const run = migrate(db, '2024-04-05T09:00:00Z');
  if (!run.ok) {
    throw new Error(run.error);
  }
});

afterEach(() => {
  closeDatabase(db);
});

describe('writing one', () => {
  it('reads back everything that went in', () => {
    insertConnection(db, record({ note: 'gate code 4471' }));
    const found = findConnection(db, 'SC-1');
    expect(found?.premiseName).toBe('kerrigan plating');
    expect(found?.fireService).toBe(false);
    expect(found?.purveyorMetered).toBe(true);
    expect(found?.note).toBe('gate code 4471');
  });

  it('leaves an absent note absent rather than null', () => {
    insertConnection(db, record());
    const found = findConnection(db, 'SC-1');
    expect(found).toBeDefined();
    expect('note' in (found ?? {})).toBe(false);
    expect(found?.disconnectedOn).toBeUndefined();
  });

  it('keeps the two flags apart', () => {
    insertConnection(db, record({ fireService: true, purveyorMetered: false }));
    const found = findConnection(db, 'SC-1');
    expect(found?.fireService).toBe(true);
    expect(found?.purveyorMetered).toBe(false);
  });

  it('says which connection clashed on the account number', () => {
    insertConnection(db, record());
    const again = insertConnection(db, record({ connectionId: 'SC-2' }));
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.error).toContain('SC-2');
      expect(again.error).toContain('already on file');
    }
  });

  it('refuses a size the store will not hold', () => {
    const result = insertConnection(db, record({ serviceSizeInches: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('breaks a rule');
    }
  });
});

describe('finding them', () => {
  beforeEach(() => {
    insertConnection(db, record());
    insertConnection(
      db,
      record({
        connectionId: 'SC-2',
        accountNumber: 'A-1002',
        premiseName: 'harbour cannery',
        premiseUseCode: 'FOOD_PROC',
        route: 'south',
      }),
    );
    insertConnection(
      db,
      record({
        connectionId: 'SC-3',
        accountNumber: 'A-1003',
        premiseName: 'old mill',
        route: 'north',
        connectedOn: '2015-01-01',
        disconnectedOn: '2022-06-30',
      }),
    );
  });

  it('finds one by account number', () => {
    expect(findConnectionByAccount(db, 'A-1002')?.connectionId).toBe('SC-2');
    expect(findConnectionByAccount(db, 'A-9999')).toBeUndefined();
  });

  it('lists everything in account order', () => {
    expect(listConnections(db).map((entry) => entry.accountNumber)).toEqual([
      'A-1001',
      'A-1002',
      'A-1003',
    ]);
  });

  it('filters by route and by use', () => {
    expect(listConnections(db, { route: 'north' })).toHaveLength(2);
    expect(listConnections(db, { premiseUseCode: 'FOOD_PROC' })).toHaveLength(1);
    expect(listConnections(db, { route: 'north', premiseUseCode: 'FOOD_PROC' })).toHaveLength(0);
  });

  it('filters to the ones in service on a day', () => {
    expect(listConnections(db, { activeOn: '2024-01-01' }).map((entry) => entry.connectionId)).toEqual([
      'SC-1',
      'SC-2',
    ]);
    expect(listConnections(db, { activeOn: '2021-01-01' })).toHaveLength(3);
    expect(listConnections(db, { activeOn: '2014-01-01' })).toHaveLength(0);
  });

  it('reads whether one was in service on a day', () => {
    const old = findConnection(db, 'SC-3');
    expect(old).toBeDefined();
    if (old === undefined) {
      return;
    }
    expect(isInService(old, '2022-06-29')).toBe(true);
    expect(isInService(old, '2022-06-30')).toBe(false);
    expect(isInService(old, '2014-12-31')).toBe(false);
  });
});

describe('changing one', () => {
  beforeEach(() => {
    insertConnection(db, record());
  });

  it('changes only what it was given', () => {
    const updated = updateConnection(db, 'SC-1', { route: 'east' });
    expect(updated.ok).toBe(true);
    const found = findConnection(db, 'SC-1');
    expect(found?.route).toBe('east');
    expect(found?.premiseName).toBe('kerrigan plating');
  });

  it('takes a new use code, which is what a change of tenant means', () => {
    updateConnection(db, 'SC-1', { premiseUseCode: 'WAREHOUSE', premiseName: 'forge road storage' });
    const found = findConnection(db, 'SC-1');
    expect(found?.premiseUseCode).toBe('WAREHOUSE');
    expect(found?.premiseName).toBe('forge road storage');
  });

  it('says so when there is nothing to change', () => {
    const result = updateConnection(db, 'SC-404', { route: 'east' });
    expect(result.ok).toBe(false);
  });
});

describe('taking one out', () => {
  beforeEach(() => {
    insertConnection(db, record());
  });

  it('records the date it came out', () => {
    const result = disconnect(db, 'SC-1', '2024-03-01');
    expect(result.ok).toBe(true);
    expect(findConnection(db, 'SC-1')?.disconnectedOn).toBe('2024-03-01');
  });

  it('will not take one out twice', () => {
    disconnect(db, 'SC-1', '2024-03-01');
    const again = disconnect(db, 'SC-1', '2024-04-01');
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.error).toContain('came out on 2024-03-01');
    }
  });

  it('will not take one out before it went in', () => {
    expect(disconnect(db, 'SC-1', '2018-01-01').ok).toBe(false);
  });

  it('says so when there is nothing to take out', () => {
    expect(disconnect(db, 'SC-404', '2024-03-01').ok).toBe(false);
  });
});

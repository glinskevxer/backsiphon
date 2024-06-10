import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, type Database } from '../../../../src/storage/db';
import { migrate } from '../../../../src/storage/schema';
import { insertConnection } from '../../../../src/storage/repositories/connections';
import {
  clearNotices,
  findNotice,
  highestStageSent,
  insertNotice,
  noticeAlreadySent,
  noticesForConnection,
  openNotices,
  type NoticeRecord,
} from '../../../../src/storage/repositories/notices';

let db: Database;

function notice(overrides: Partial<NoticeRecord> = {}): NoticeRecord {
  return {
    noticeId: 'N-1',
    connectionId: 'SC-1',
    stage: 'first',
    dueDate: '2024-05-01',
    issuedOn: '2024-05-02',
    ladder: 'standard',
    daysPastDue: 1,
    body: 'your backflow assembly test is past due',
    ...overrides,
  };
}

beforeEach(() => {
  db = openDatabase({ file: ':memory:' });
  const run = migrate(db, '2024-05-02T09:00:00Z');
  if (!run.ok) {
    throw new Error(run.error);
  }
  for (const [id, account] of [
    ['SC-1', 'A-1'],
    ['SC-2', 'A-2'],
  ] as const) {
    insertConnection(db, {
      connectionId: id,
      accountNumber: account,
      premiseName: 'a premise',
      premiseAddress: 'somewhere',
      premiseUseCode: 'RETAIL',
      serviceSizeInches: 1,
      fireService: false,
      purveyorMetered: true,
      connectedOn: '2015-01-01',
      route: 'north',
      outletElevationInches: 12,
      indoorRiser: false,
      downstreamShutoff: true,
      continuousPressureHours: 24,
    });
  }
});

afterEach(() => {
  closeDatabase(db);
});

describe('sending one', () => {
  it('reads back what went out', () => {
    insertNotice(db, notice());
    const found = findNotice(db, 'N-1');
    expect(found?.body).toContain('past due');
    expect(found?.clearedOn).toBeUndefined();
    expect(found?.assemblyId).toBeUndefined();
  });

  it('refuses the same rung twice for one due date', () => {
    insertNotice(db, notice());
    const again = insertNotice(db, notice({ noticeId: 'N-2', issuedOn: '2024-05-03' }));
    expect(again.ok).toBe(false);
    expect(noticeAlreadySent(db, 'SC-1', '2024-05-01', 'first')).toBe(true);
    expect(noticeAlreadySent(db, 'SC-1', '2024-05-01', 'second')).toBe(false);
  });

  it('takes the same rung again for the next cycle', () => {
    insertNotice(db, notice());
    const next = insertNotice(
      db,
      notice({ noticeId: 'N-2', dueDate: '2025-05-01', issuedOn: '2025-05-02' }),
    );
    expect(next.ok).toBe(true);
  });

  it('refuses one on a connection nobody has', () => {
    expect(insertNotice(db, notice({ noticeId: 'N-9', connectionId: 'SC-404' })).ok).toBe(false);
  });
});

describe('the ladder that went out', () => {
  beforeEach(() => {
    insertNotice(db, notice({ noticeId: 'N-1', stage: 'first', issuedOn: '2024-05-02' }));
    insertNotice(
      db,
      notice({ noticeId: 'N-2', stage: 'second', issuedOn: '2024-06-01', daysPastDue: 31 }),
    );
    insertNotice(db, notice({ noticeId: 'N-3', connectionId: 'SC-2', issuedOn: '2024-05-10' }));
  });

  it('lists a connection newest first', () => {
    expect(noticesForConnection(db, 'SC-1').map((entry) => entry.noticeId)).toEqual(['N-2', 'N-1']);
  });

  it('reads the highest rung sent for a due date', () => {
    expect(highestStageSent(db, 'SC-1', '2024-05-01')).toBe('second');
    expect(highestStageSent(db, 'SC-2', '2024-05-01')).toBe('first');
    expect(highestStageSent(db, 'SC-1', '2030-01-01')).toBeUndefined();
  });

  it('lists what is still open across the whole register', () => {
    expect(openNotices(db).map((entry) => entry.noticeId)).toEqual(['N-1', 'N-3', 'N-2']);
    expect(openNotices(db, '2024-05-15').map((entry) => entry.noticeId)).toEqual(['N-1', 'N-3']);
  });
});

describe('clearing them', () => {
  beforeEach(() => {
    insertNotice(db, notice({ noticeId: 'N-1', stage: 'first', issuedOn: '2024-05-02' }));
    insertNotice(
      db,
      notice({ noticeId: 'N-2', stage: 'second', issuedOn: '2024-06-01', daysPastDue: 31 }),
    );
    insertNotice(db, notice({ noticeId: 'N-3', connectionId: 'SC-2', issuedOn: '2024-05-10' }));
  });

  it('clears the whole ladder on one connection', () => {
    const cleared = clearNotices(db, 'SC-1', '2024-06-14');
    expect(cleared.ok).toBe(true);
    if (cleared.ok) {
      expect(cleared.value).toBe(2);
    }
    expect(openNotices(db).map((entry) => entry.noticeId)).toEqual(['N-3']);
    expect(findNotice(db, 'N-2')?.clearedOn).toBe('2024-06-14');
  });

  it('leaves the other connections alone', () => {
    clearNotices(db, 'SC-1', '2024-06-14');
    expect(findNotice(db, 'N-3')?.clearedOn).toBeUndefined();
  });

  it('will not clear a notice before it went out', () => {
    const result = clearNotices(db, 'SC-1', '2024-05-15');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('N-2');
    }
    expect(findNotice(db, 'N-1')?.clearedOn).toBeUndefined();
  });

  it('clears nothing quietly where there is nothing open', () => {
    clearNotices(db, 'SC-1', '2024-06-14');
    const again = clearNotices(db, 'SC-1', '2024-07-01');
    expect(again.ok && again.value).toBe(0);
  });
});

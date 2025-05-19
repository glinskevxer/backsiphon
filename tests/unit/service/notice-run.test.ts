import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runNotices } from '../../../src/service/notices';
import { openNotices } from '../../../src/storage/repositories/notices';
import { recentEvents } from '../../../src/storage/repositories/events';
import { fileTest, fit, open, openOffice, walk, type Office } from '../../support/office';

let office: Office;

function overdue(account: string): string {
  const connectionId = open(office, { accountNumber: account });
  walk(office, connectionId, '2023-01-10', ['AUX_WELL']);
  const assemblyId = fit(office, { connectionId, installedOn: '2023-02-01' });
  fileTest(office, { assemblyId, testedOn: '2023-02-05' });
  return connectionId;
}

beforeEach(() => {
  office = openOffice();
});

afterEach(() => {
  office.close();
});

describe('a run with a limit on it', () => {
  beforeEach(() => {
    overdue('A-1');
    overdue('A-2');
    overdue('A-3');
  });

  it('stops after the number of letters it was given', () => {
    const run = runNotices(office.register, { asOf: '2024-02-20', limit: 2 });
    expect(run.ok).toBe(true);
    if (!run.ok) {
      return;
    }
    expect(run.value.issued).toHaveLength(2);
    expect(openNotices(office.register.db)).toHaveLength(2);
  });

  it('writes the rest the next time it is run', () => {
    runNotices(office.register, { asOf: '2024-02-20', limit: 2 });
    const rest = runNotices(office.register, { asOf: '2024-02-20' });
    expect(rest.ok && rest.value.issued).toHaveLength(1);
    expect(openNotices(office.register.db)).toHaveLength(3);
  });

  it('numbers the second run on from the first', () => {
    runNotices(office.register, { asOf: '2024-02-20', limit: 2 });
    const rest = runNotices(office.register, { asOf: '2024-02-20' });
    expect(rest.ok && rest.value.issued[0]?.noticeId).toBe('N-000003');
  });

  it('stops at the limit on a dry run and writes nothing', () => {
    const dry = runNotices(office.register, { asOf: '2024-02-20', dryRun: true, limit: 1 });
    expect(dry.ok && dry.value.issued).toHaveLength(1);
    expect(openNotices(office.register.db)).toEqual([]);
  });

  it('writes every letter of a run or none of it', () => {
    const run = runNotices(office.register, { asOf: '2024-02-20' });
    expect(run.ok && run.value.issued).toHaveLength(3);
    expect(openNotices(office.register.db)).toHaveLength(3);
    expect(recentEvents(office.register.db, { kind: 'notice_issued' })).toHaveLength(3);
  });

  it('leaves no transaction open behind it', () => {
    runNotices(office.register, { asOf: '2024-02-20' });
    expect(office.register.db.inTransaction).toBe(false);
  });
});

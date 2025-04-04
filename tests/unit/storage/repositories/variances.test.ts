import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, type Database } from '../../../../src/storage/db';
import { migrate } from '../../../../src/storage/schema';
import { insertConnection } from '../../../../src/storage/repositories/connections';
import {
  conditionCount,
  denyVariance,
  findVariance,
  grantVariance,
  insertVariance,
  listGranted,
  pendingVariance,
  revokeVariance,
  variancesForConnection,
} from '../../../../src/storage/repositories/variances';
import type { Variance } from '../../../../src/domain/variance';

let db: Database;

function application(overrides: Partial<Variance> = {}): Variance {
  return {
    varianceId: 'V-1',
    connectionId: 'SC-1',
    appliedOn: '2024-03-01',
    acceptedClass: 'DC',
    grantedAgainstDegree: 'health',
    conditions: [],
    ...overrides,
  };
}

beforeEach(() => {
  db = openDatabase({ file: ':memory:' });
  const run = migrate(db, '2024-05-20T09:00:00Z');
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
      premiseUseCode: 'INDUSTRIAL',
      serviceSizeInches: 2,
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

describe('applications', () => {
  it('stores one with no decision on it', () => {
    insertVariance(db, application());
    const found = findVariance(db, 'V-1');
    expect(found?.decision).toBeUndefined();
    expect(found?.conditions).toEqual([]);
  });

  it('finds the pending one on a connection', () => {
    insertVariance(db, application());
    expect(pendingVariance(db, 'SC-1')?.varianceId).toBe('V-1');
    expect(pendingVariance(db, 'SC-2')).toBeUndefined();
  });

  it('refuses a condition holding the separator', () => {
    const result = insertVariance(db, application({ conditions: ['a | b'] }));
    expect(result.ok).toBe(false);
  });

  it('lists them newest first', () => {
    insertVariance(db, application());
    insertVariance(db, application({ varianceId: 'V-2', appliedOn: '2024-06-01' }));
    expect(variancesForConnection(db, 'SC-1').map((entry) => entry.varianceId)).toEqual([
      'V-2',
      'V-1',
    ]);
  });
});

describe('granting', () => {
  beforeEach(() => {
    insertVariance(db, application());
  });

  it('writes the decision, the span and the conditions', () => {
    const granted = grantVariance(db, 'V-1', {
      decidedOn: '2024-03-20',
      effectiveFrom: '2024-04-01',
      expiresOn: '2025-03-31',
      conditions: ['quarterly inspection of the boiler room', 'no chemical feed without notice'],
      note: 'the injector was removed and capped',
    });
    expect(granted.ok).toBe(true);
    const found = findVariance(db, 'V-1');
    expect(found?.decision).toBe('granted');
    expect(found?.effectiveFrom).toBe('2024-04-01');
    expect(found?.conditions).toHaveLength(2);
    expect(conditionCount(db, 'V-1')).toBe(2);
  });

  it('takes an open ended grant', () => {
    grantVariance(db, 'V-1', {
      decidedOn: '2024-03-20',
      effectiveFrom: '2024-04-01',
      conditions: [],
    });
    expect(findVariance(db, 'V-1')?.expiresOn).toBeUndefined();
  });

  it('refuses a second decision', () => {
    grantVariance(db, 'V-1', {
      decidedOn: '2024-03-20',
      effectiveFrom: '2024-04-01',
      conditions: [],
    });
    const again = grantVariance(db, 'V-1', {
      decidedOn: '2024-04-20',
      effectiveFrom: '2024-05-01',
      conditions: [],
    });
    expect(again.ok).toBe(false);
    expect(denyVariance(db, 'V-1', '2024-04-20', 'changed our minds').ok).toBe(false);
  });

  it('refuses a decision before the application and a span that runs backwards', () => {
    expect(
      grantVariance(db, 'V-1', {
        decidedOn: '2024-01-01',
        effectiveFrom: '2024-04-01',
        conditions: [],
      }).ok,
    ).toBe(false);
    expect(
      grantVariance(db, 'V-1', {
        decidedOn: '2024-03-20',
        effectiveFrom: '2024-04-01',
        expiresOn: '2024-03-25',
        conditions: [],
      }).ok,
    ).toBe(false);
  });
});

describe('denying and revoking', () => {
  beforeEach(() => {
    insertVariance(db, application());
  });

  it('denies with a reason', () => {
    expect(denyVariance(db, 'V-1', '2024-03-20', 'the injector is still on the line').ok).toBe(
      true,
    );
    const found = findVariance(db, 'V-1');
    expect(found?.decision).toBe('denied');
    expect(found?.note).toContain('injector');
  });

  it('will not deny without a reason', () => {
    expect(denyVariance(db, 'V-1', '2024-03-20', '  ').ok).toBe(false);
  });

  it('revokes a granted one', () => {
    grantVariance(db, 'V-1', {
      decidedOn: '2024-03-20',
      effectiveFrom: '2024-04-01',
      conditions: [],
    });
    expect(revokeVariance(db, 'V-1', '2024-09-01', 'condition two was breached').ok).toBe(true);
    expect(findVariance(db, 'V-1')?.revokedOn).toBe('2024-09-01');
  });

  it('will not revoke one that was never granted or was revoked already', () => {
    expect(revokeVariance(db, 'V-1', '2024-09-01', 'x').ok).toBe(false);
    grantVariance(db, 'V-1', {
      decidedOn: '2024-03-20',
      effectiveFrom: '2024-04-01',
      conditions: [],
    });
    revokeVariance(db, 'V-1', '2024-09-01', 'x');
    expect(revokeVariance(db, 'V-1', '2024-10-01', 'x').ok).toBe(false);
    expect(revokeVariance(db, 'V-404', '2024-10-01', 'x').ok).toBe(false);
  });
});

describe('what is in effect on a day', () => {
  beforeEach(() => {
    insertVariance(db, application());
    insertVariance(db, application({ varianceId: 'V-2', connectionId: 'SC-2' }));
    grantVariance(db, 'V-1', {
      decidedOn: '2024-03-20',
      effectiveFrom: '2024-04-01',
      expiresOn: '2025-03-31',
      conditions: [],
    });
    grantVariance(db, 'V-2', {
      decidedOn: '2024-03-20',
      effectiveFrom: '2024-04-01',
      conditions: [],
    });
  });

  it('lists the ones running on the day', () => {
    expect(listGranted(db, '2024-06-01').map((entry) => entry.varianceId)).toEqual(['V-1', 'V-2']);
    expect(listGranted(db, '2024-03-01')).toEqual([]);
    expect(listGranted(db, '2026-01-01').map((entry) => entry.varianceId)).toEqual(['V-2']);
  });

  it('drops one from the day it is revoked', () => {
    revokeVariance(db, 'V-2', '2024-07-01', 'breached');
    expect(listGranted(db, '2024-06-30').map((entry) => entry.varianceId)).toEqual(['V-1', 'V-2']);
    expect(listGranted(db, '2024-07-01').map((entry) => entry.varianceId)).toEqual(['V-1']);
  });
});

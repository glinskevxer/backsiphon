import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, type Database } from '../../../../src/storage/db';
import { migrate } from '../../../../src/storage/schema';
import { insertConnection } from '../../../../src/storage/repositories/connections';
import {
  contactInRole,
  contactsFor,
  findContact,
  insertContact,
  replaceContact,
  retireContact,
  whoToRing,
  type Contact,
} from '../../../../src/storage/repositories/contacts';

let db: Database;

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    contactId: 'C-1',
    connectionId: 'SC-1',
    role: 'site',
    name: 'j. kerrigan',
    telephone: '555 0142',
    addedOn: '2024-02-01',
    ...overrides,
  };
}

beforeEach(() => {
  db = openDatabase({ file: ':memory:' });
  const run = migrate(db, '2025-02-01T09:00:00Z');
  if (!run.ok) {
    throw new Error(run.error);
  }
  insertConnection(db, {
    connectionId: 'SC-1',
    accountNumber: 'A-1',
    premiseName: 'kerrigan plating',
    premiseAddress: '14 forge road',
    premiseUseCode: 'PLATING',
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
});

afterEach(() => {
  closeDatabase(db);
});

describe('adding one', () => {
  it('reads back what went in', () => {
    insertContact(db, contact({ note: 'ask for the works manager' }));
    const found = findContact(db, 'C-1');
    expect(found?.name).toBe('j. kerrigan');
    expect(found?.note).toContain('works manager');
    expect(found?.email).toBeUndefined();
  });

  it('refuses one nobody can reach', () => {
    const result = insertContact(db, { ...contact(), telephone: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('no way to reach');
    }
  });

  it('refuses one with no name and one with no connection', () => {
    expect(insertContact(db, contact({ name: '  ' })).ok).toBe(false);
    expect(insertContact(db, contact({ contactId: 'C-9', connectionId: 'SC-404' })).ok).toBe(false);
  });

  it('refuses two live contacts in the same role', () => {
    insertContact(db, contact());
    const second = insertContact(db, contact({ contactId: 'C-2', name: 'somebody else' }));
    expect(second.ok).toBe(false);
  });

  it('takes another role on the same connection', () => {
    insertContact(db, contact());
    expect(insertContact(db, contact({ contactId: 'C-2', role: 'account', name: 'head office' })).ok).toBe(
      true,
    );
    expect(contactsFor(db, 'SC-1')).toHaveLength(2);
  });
});

describe('replacing one', () => {
  it('retires the one in the role and puts the new one in', () => {
    insertContact(db, contact());
    const replaced = replaceContact(
      db,
      contact({ contactId: 'C-2', name: 'r. odiete', addedOn: '2025-01-05' }),
    );
    expect(replaced.ok).toBe(true);
    expect(findContact(db, 'C-1')?.retiredOn).toBe('2025-01-05');
    expect(contactInRole(db, 'SC-1', 'site')?.name).toBe('r. odiete');
  });

  it('keeps the retired one on the file', () => {
    insertContact(db, contact());
    replaceContact(db, contact({ contactId: 'C-2', name: 'r. odiete', addedOn: '2025-01-05' }));
    expect(contactsFor(db, 'SC-1')).toHaveLength(1);
    expect(contactsFor(db, 'SC-1', true)).toHaveLength(2);
  });

  it('will not retire one twice or before it was added', () => {
    insertContact(db, contact());
    retireContact(db, 'C-1', '2025-01-05');
    expect(retireContact(db, 'C-1', '2025-02-05').ok).toBe(false);
    expect(retireContact(db, 'C-404', '2025-02-05').ok).toBe(false);
    insertContact(db, contact({ contactId: 'C-3' }));
    expect(retireContact(db, 'C-3', '2020-01-01').ok).toBe(false);
  });
});

describe('who the office rings', () => {
  it('tries the site first', () => {
    insertContact(db, contact({ contactId: 'C-1', role: 'account', name: 'head office' }));
    insertContact(db, contact({ contactId: 'C-2', role: 'site', name: 'j. kerrigan' }));
    expect(whoToRing(db, 'SC-1')?.name).toBe('j. kerrigan');
  });

  it('falls back to the account when there is nobody on site', () => {
    insertContact(db, contact({ contactId: 'C-1', role: 'account', name: 'head office' }));
    expect(whoToRing(db, 'SC-1')?.role).toBe('account');
  });

  it('steps over a contact with only an email on it', () => {
    insertContact(db, {
      ...contact({ contactId: 'C-1', role: 'site' }),
      telephone: undefined,
      email: 'site@example.test',
    });
    insertContact(db, contact({ contactId: 'C-2', role: 'plumber', name: 'byrne and sons' }));
    expect(whoToRing(db, 'SC-1')?.role).toBe('plumber');
  });

  it('says nothing where there is nobody at all', () => {
    expect(whoToRing(db, 'SC-1')).toBeUndefined();
  });
});

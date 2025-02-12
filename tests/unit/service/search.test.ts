import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { search } from '../../../src/service/search';
import { closeConnection } from '../../../src/service/connections';
import { insertContact } from '../../../src/storage/repositories/contacts';
import { fit, open, openOffice, walk, type Office } from '../../support/office';

let office: Office;

beforeEach(() => {
  office = openOffice();
  const plating = open(office, {
    accountNumber: 'A-1001',
    premiseName: 'kerrigan plating',
    premiseAddress: '14 forge road',
  });
  walk(office, plating, '2024-01-10', ['AUX_WELL']);
  fit(office, { connectionId: plating, installedOn: '2024-02-01', serialNumber: '4471182' });
  insertContact(office.register.db, {
    contactId: 'C-1',
    connectionId: plating,
    role: 'site',
    name: 'j. kerrigan',
    telephone: '555 0142',
    addedOn: '2024-02-01',
  });
  open(office, {
    accountNumber: 'A-1002',
    premiseName: 'forge road storage',
    premiseAddress: '16 forge road',
  });
});

afterEach(() => {
  office.close();
});

describe('finding a connection', () => {
  it('finds one by account number', () => {
    const hits = search(office.register, 'A-1001');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.matchedOn).toBe('account');
  });

  it('finds one by part of the premise name, in any case', () => {
    const hits = search(office.register, 'KERRIGAN');
    expect(hits.map((hit) => hit.matchedOn)).toContain('premise');
  });

  it('finds two by a shared street', () => {
    const hits = search(office.register, 'forge road');
    expect(new Set(hits.map((hit) => hit.connectionId)).size).toBe(2);
  });

  it('finds one by the serial stamped on the assembly', () => {
    const hits = search(office.register, '4471182');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.matchedOn).toBe('serial');
    expect(hits[0]?.matchedValue).toBe('4471182');
  });

  it('finds one by the name of the person who answers the telephone', () => {
    const hits = search(office.register, 'kerrigan');
    expect(hits.map((hit) => hit.matchedOn)).toContain('contact');
  });

  it('says nothing for a term that matches nothing, and for an empty one', () => {
    expect(search(office.register, 'zzzz')).toEqual([]);
    expect(search(office.register, '   ')).toEqual([]);
  });

  it('leaves a closed connection out unless it is asked for', () => {
    closeConnection(office.register, 'SC-00002', '2025-01-01', 'demolished');
    expect(search(office.register, 'forge road').map((hit) => hit.connectionId)).toEqual(['SC-00001']);
    const all = search(office.register, 'forge road', { includeClosed: true });
    expect(new Set(all.map((hit) => hit.connectionId)).size).toBe(2);
  });

  it('takes a limit', () => {
    expect(search(office.register, 'forge road', { limit: 1 })).toHaveLength(1);
  });

  it('does not report the same connection twice for the same reason', () => {
    fit(office, {
      connectionId: 'SC-00001',
      scope: 'isolation',
      assemblyClass: 'PVB',
      modelId: 'CB-40P',
      sizeInches: 1,
      installedOn: '2024-02-01',
      serialNumber: '4471182b',
    });
    const hits = search(office.register, '4471182');
    expect(hits.filter((hit) => hit.matchedOn === 'serial')).toHaveLength(1);
  });
});

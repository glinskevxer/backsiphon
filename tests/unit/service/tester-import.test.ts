import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { importTesterRoster, lapsedTesters } from '../../../src/service/tester-import';
import { findTester, listTesters } from '../../../src/storage/repositories/testers';
import { eventsFor } from '../../../src/storage/repositories/events';
import { openOffice, type Office } from '../../support/office';

let office: Office;

const HEADER = 'tester,name,agency,certificate,issued,expires,endorsements';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

beforeEach(() => {
  office = openOffice();
});

afterEach(() => {
  office.close();
});

describe('taking the agency list', () => {
  it('adds a tester nobody had on file', () => {
    const summary = importTesterRoster(
      office.register,
      csv('T-200,a. bello,state waterworks board,BF-9001,2024-01-05,2027-01-04,RP DC'),
    );
    expect(summary.ok).toBe(true);
    if (!summary.ok) {
      return;
    }
    expect(summary.value.added).toBe(1);
    expect(findTester(office.register.db, 'T-200')?.endorsements).toEqual(['RP', 'DC']);
    expect(eventsFor(office.register.db, 'tester', 'T-200')[0]?.kind).toBe('tester_added');
  });

  it('renews one that is already there', () => {
    const summary = importTesterRoster(
      office.register,
      csv('T-118,p. adeyemi,state waterworks board,BF-4471,2025-01-01,2028-12-31,RP DC PVB'),
    );
    expect(summary.ok && summary.value.renewed).toBe(1);
    const renewed = findTester(office.register.db, 'T-118');
    expect(renewed?.expiresOn).toBe('2028-12-31');
    expect(renewed?.endorsements).toEqual(['RP', 'DC', 'PVB']);
  });

  it('leaves one alone where nothing has changed', () => {
    const existing = findTester(office.register.db, 'T-118');
    expect(existing).toBeDefined();
    if (existing === undefined) {
      return;
    }
    const summary = importTesterRoster(
      office.register,
      csv(
        `T-118,${existing.name},${existing.agency},${existing.certificateNumber},` +
          `${existing.issuedOn},${existing.expiresOn},${existing.endorsements.join(' ')}`,
      ),
    );
    expect(summary.ok && summary.value.rows[0]?.action).toBe('unchanged');
    expect(summary.ok && summary.value.renewed).toBe(0);
  });

  it('names the office testers the agency no longer carries', () => {
    const summary = importTesterRoster(
      office.register,
      csv('T-200,a. bello,state waterworks board,BF-9001,2024-01-05,2027-01-04,RP'),
    );
    expect(summary.ok && summary.value.notOnTheList).toEqual(['T-118']);
  });

  it('rejects the rows it cannot read and keeps the rest', () => {
    const summary = importTesterRoster(
      office.register,
      csv(
        ',a. bello,board,BF-1,2024-01-05,2027-01-04,RP',
        'T-201,b. okoro,board,BF-2,2024-01-05,2023-01-04,RP',
        'T-202,c. mensah,board,BF-3,january,2027-01-04,RP',
        'T-203,d. quaye,board,BF-4,2024-01-05,2027-01-04,',
        'T-204,e. tetteh,board,BF-5,2024-01-05,2027-01-04,RPZ',
        'T-205,f. asare,board,BF-6,2024-01-05,2027-01-04,RP DC',
      ),
    );
    expect(summary.ok).toBe(true);
    if (!summary.ok) {
      return;
    }
    expect(summary.value.rejected).toHaveLength(5);
    expect(summary.value.added).toBe(1);
    expect(summary.value.rejected[4]?.reason).toContain('RPZ');
  });

  it('refuses a list with a column missing', () => {
    expect(importTesterRoster(office.register, 'tester,name\nT-1,a').ok).toBe(false);
  });

  it('says which testers the office would refuse a report from today', () => {
    importTesterRoster(office.register, csv('T-300,g. mensah,board,BF-7,2019-01-01,2020-01-01,RP'));
    expect(lapsedTesters(office.register, '2025-05-01')).toEqual(['T-300']);
    expect(listTesters(office.register.db)).toHaveLength(2);
  });
});

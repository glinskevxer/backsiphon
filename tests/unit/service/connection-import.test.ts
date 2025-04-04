import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  describeConnectionImport,
  importConnectionsCsv,
} from '../../../src/service/connection-import';
import {
  findConnectionByAccount,
  listConnections,
} from '../../../src/storage/repositories/connections';
import { openOffice, type Office } from '../../support/office';

let office: Office;

const HEADER = 'account,premise,address,use,size,connected,route,fire,metered';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

beforeEach(() => {
  office = openOffice();
});

afterEach(() => {
  office.close();
});

describe('taking the district in', () => {
  it('opens what is new', () => {
    const summary = importConnectionsCsv(
      office.register,
      csv(
        'A-1001,kerrigan plating,14 forge road,PLATING,2,2016-04-01,north,no,yes',
        'A-1002,valley storage,40 dock road,WAREHOUSE,6,2018-01-01,south,yes,no',
      ),
    );
    expect(summary.ok).toBe(true);
    if (!summary.ok) {
      return;
    }
    expect(summary.value.opened).toBe(2);
    expect(listConnections(office.register.db)).toHaveLength(2);
    const fire = findConnectionByAccount(office.register.db, 'A-1002');
    expect(fire?.fireService).toBe(true);
    expect(fire?.purveyorMetered).toBe(false);
    expect(fire?.route).toBe('south');
  });

  it('leaves an account that is already on file alone', () => {
    const rows = csv('A-1001,kerrigan plating,14 forge road,PLATING,2,2016-04-01,north,no,yes');
    importConnectionsCsv(office.register, rows);
    const again = importConnectionsCsv(
      office.register,
      csv('A-1001,kerrigan plating limited,14 forge road,PLATING,2,2016-04-01,north,no,yes'),
    );
    expect(again.ok && again.value.rows[0]?.action).toBe('unchanged');
    expect(findConnectionByAccount(office.register.db, 'A-1001')?.premiseName).toBe(
      'kerrigan plating',
    );
  });

  it('writes a rename onto it when it is asked to', () => {
    importConnectionsCsv(
      office.register,
      csv('A-1001,kerrigan plating,14 forge road,PLATING,2,2016-04-01,north,no,yes'),
    );
    const updated = importConnectionsCsv(
      office.register,
      csv('A-1001,kerrigan plating limited,14 forge road,PLATING,2,2016-04-01,east,no,yes'),
      { update: true },
    );
    expect(updated.ok && updated.value.updated).toBe(1);
    const found = findConnectionByAccount(office.register.db, 'A-1001');
    expect(found?.premiseName).toBe('kerrigan plating limited');
    expect(found?.route).toBe('east');
  });

  it('will not change the premise use, because that is a change of tenant', () => {
    importConnectionsCsv(
      office.register,
      csv('A-1001,kerrigan plating,14 forge road,PLATING,2,2016-04-01,north,no,yes'),
    );
    importConnectionsCsv(
      office.register,
      csv('A-1001,kerrigan plating,14 forge road,WAREHOUSE,2,2016-04-01,north,no,yes'),
      { update: true },
    );
    expect(findConnectionByAccount(office.register.db, 'A-1001')?.premiseUseCode).toBe('PLATING');
  });

  it('reports a row that has not moved as unchanged', () => {
    const rows = csv('A-1001,kerrigan plating,14 forge road,PLATING,2,2016-04-01,north,no,yes');
    importConnectionsCsv(office.register, rows);
    const again = importConnectionsCsv(office.register, rows, { update: true });
    expect(again.ok && again.value.updated).toBe(0);
    expect(again.ok && again.value.rows[0]?.action).toBe('unchanged');
  });

  it('rejects the rows it cannot read and keeps the rest', () => {
    const summary = importConnectionsCsv(
      office.register,
      csv(
        ',kerrigan plating,14 forge road,PLATING,2,2016-04-01,north,no,yes',
        'A-1002,valley storage,40 dock road,SPACEPORT,6,2018-01-01,south,no,yes',
        'A-1003,harbour cannery,2 quay street,FOOD_PROC,nought,2018-01-01,south,no,yes',
        'A-1004,brightwater,9 canal street,OFFICE,1,last tuesday,north,no,yes',
        'A-1005,the old mill,1 mill lane,WAREHOUSE,3,2019-01-01,east,no,yes',
      ),
    );
    expect(summary.ok).toBe(true);
    if (!summary.ok) {
      return;
    }
    expect(summary.value.rejected).toHaveLength(4);
    expect(summary.value.opened).toBe(1);
    expect(summary.value.rejected[1]?.reason).toContain('SPACEPORT');
    expect(describeConnectionImport(summary.value)).toContain('4 rejected');
  });

  it('refuses a file with a column it does not know', () => {
    const summary = importConnectionsCsv(
      office.register,
      'account,premise,address,use,size,connected,colour\nA,B,C,OFFICE,1,2020-01-01,blue',
    );
    expect(summary.ok).toBe(false);
    if (!summary.ok) {
      expect(summary.error).toContain('colour');
    }
  });

  it('refuses a file with a column missing', () => {
    expect(importConnectionsCsv(office.register, 'account,premise\nA,B').ok).toBe(false);
  });

  it('takes a file with only the required columns', () => {
    const summary = importConnectionsCsv(
      office.register,
      'account,premise,address,use,size,connected\nA-1,a premise,somewhere,OFFICE,1,2020-01-01',
    );
    expect(summary.ok && summary.value.opened).toBe(1);
    expect(findConnectionByAccount(office.register.db, 'A-1')?.purveyorMetered).toBe(true);
  });
});

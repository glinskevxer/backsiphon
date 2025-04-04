import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, selectAll, type Database } from '../../../../src/storage/db';
import { migrate } from '../../../../src/storage/schema';
import { insertConnection } from '../../../../src/storage/repositories/connections';
import { insertAssembly, insertModel } from '../../../../src/storage/repositories/assemblies';
import { insertGauge, insertTester } from '../../../../src/storage/repositories/testers';
import {
  countReports,
  findReport,
  insertReport,
  lastFailingTest,
  lastPassingTest,
  reportsFiledBy,
  reportsForAssembly,
  type StoredReport,
} from '../../../../src/storage/repositories/reports';

let db: Database;

function stored(
  overrides: Partial<StoredReport> = {},
  report: Partial<StoredReport['report']> = {},
): StoredReport {
  return {
    report: {
      reportId: 'TR-1',
      assemblyId: 'BA-1',
      testerId: 'T-118',
      gaugeId: 'G-77',
      assemblyClassTested: 'RP',
      testedOn: '2024-03-04',
      filedOn: '2024-03-06',
      asFound: { check1Differential: 8.2, reliefOpening: 3.1 },
      repairMade: false,
      ...report,
    },
    admissible: true,
    inadmissibleCodes: [],
    outcome: 'pass',
    asFoundOutcome: 'pass',
    recordedAt: '2024-03-06T10:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  db = openDatabase({ file: ':memory:' });
  const run = migrate(db, '2024-04-19T09:00:00Z');
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
  insertModel(db, {
    modelId: 'WK-375',
    maker: 'watkin',
    model: '375',
    assemblyClass: 'RP',
    sizes: [2],
    listedOn: '2016-04-01',
    note: '',
  });
  insertTester(db, {
    testerId: 'T-118',
    name: 'p. adeyemi',
    agency: 'board',
    certificateNumber: 'BF-4471',
    issuedOn: '2023-05-01',
    expiresOn: '2026-04-30',
    endorsements: ['RP'],
  });
  insertGauge(db, {
    gaugeId: 'G-77',
    testerId: 'T-118',
    maker: 'midwest',
    serialNumber: '845-C',
    calibratedOn: '2024-02-15',
    calibrationIntervalMonths: 12,
    accuracyPsid: 0.2,
  });
  insertAssembly(db, {
    assemblyId: 'BA-1',
    connectionId: 'SC-1',
    scope: 'containment',
    assemblyClass: 'RP',
    modelId: 'WK-375',
    serialNumber: '4471182',
    sizeInches: 2,
    installedOn: '2019-05-01',
    location: 'vault',
  });
});

afterEach(() => {
  closeDatabase(db);
});

describe('writing one', () => {
  it('reads the readings back as numbers', () => {
    insertReport(db, stored());
    expect(findReport(db, 'TR-1')?.report.asFound).toEqual({
      check1Differential: 8.2,
      reliefOpening: 3.1,
    });
  });

  it('reads a flag reading back as a boolean', () => {
    insertReport(
      db,
      stored(
        {},
        { assemblyClassTested: 'DCDA', asFound: { check1Differential: 2, bypassTight: true } },
      ),
    );
    expect(findReport(db, 'TR-1')?.report.asFound['bypassTight']).toBe(true);
  });

  it('keeps the two phases apart', () => {
    insertReport(
      db,
      stored(
        { asFoundOutcome: 'fail' },
        {
          asFound: { check1Differential: 0.4, reliefOpening: 3.1 },
          repairMade: true,
          repairNote: 'new first check',
          asLeft: { check1Differential: 8.8, reliefOpening: 3.1 },
        },
      ),
    );
    const found = findReport(db, 'TR-1');
    expect(found?.report.asFound['check1Differential']).toBe(0.4);
    expect(found?.report.asLeft?.['check1Differential']).toBe(8.8);
    expect(found?.asFoundOutcome).toBe('fail');
  });

  it('leaves as left off entirely when there was no repair', () => {
    insertReport(db, stored());
    expect(findReport(db, 'TR-1')?.report.asLeft).toBeUndefined();
  });

  it('keeps the readings of a report the office refused', () => {
    insertReport(
      db,
      stored({
        admissible: false,
        inadmissibleCodes: ['gauge_out_of_calibration'],
        outcome: 'pass',
      }),
    );
    const found = findReport(db, 'TR-1');
    expect(found?.admissible).toBe(false);
    expect(found?.inadmissibleCodes).toEqual(['gauge_out_of_calibration']);
    expect(found?.report.asFound['check1Differential']).toBe(8.2);
  });

  it('writes nothing when the readings fail', () => {
    const bad = stored({}, { asFound: { check1Differential: 8.2 } });
    insertReport(db, bad);
    const clash = insertReport(db, bad);
    expect(clash.ok).toBe(false);
    expect(countReports(db)).toBe(1);
    expect(selectAll(db, 'select * from report_readings')).toHaveLength(1);
  });

  it('refuses one against an assembly nobody has fitted', () => {
    expect(insertReport(db, stored({}, { assemblyId: 'BA-404' })).ok).toBe(false);
  });
});

describe('looking them up', () => {
  beforeEach(() => {
    insertReport(db, stored({}, { reportId: 'TR-1', testedOn: '2022-01-10' }));
    insertReport(
      db,
      stored(
        { outcome: 'fail', asFoundOutcome: 'fail' },
        { reportId: 'TR-2', testedOn: '2023-01-12' },
      ),
    );
    insertReport(db, stored({}, { reportId: 'TR-3', testedOn: '2023-02-02' }));
    insertReport(
      db,
      stored(
        { admissible: false, inadmissibleCodes: ['tester_not_endorsed'] },
        { reportId: 'TR-4', testedOn: '2024-02-20' },
      ),
    );
  });

  it('lists them newest first', () => {
    expect(reportsForAssembly(db, 'BA-1').map((entry) => entry.report.reportId)).toEqual([
      'TR-4',
      'TR-3',
      'TR-2',
      'TR-1',
    ]);
  });

  it('takes the last passing accepted test as the anniversary', () => {
    expect(lastPassingTest(db, 'BA-1')?.report.reportId).toBe('TR-3');
  });

  it('does not let a refused report move the anniversary', () => {
    const passing = lastPassingTest(db, 'BA-1');
    expect(passing?.report.testedOn).toBe('2023-02-02');
    expect(passing?.admissible).toBe(true);
  });

  it('reads the anniversary as at an earlier date', () => {
    expect(lastPassingTest(db, 'BA-1', '2022-06-01')?.report.reportId).toBe('TR-1');
    expect(lastPassingTest(db, 'BA-1', '2021-01-01')).toBeUndefined();
  });

  it('finds the last failing test', () => {
    expect(lastFailingTest(db, 'BA-1')?.report.reportId).toBe('TR-2');
  });

  it('lists what a tester filed', () => {
    expect(reportsFiledBy(db, 'T-118')).toHaveLength(4);
    expect(reportsFiledBy(db, 'T-404')).toEqual([]);
    expect(countReports(db)).toBe(4);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, type Database } from '../../../../src/storage/db';
import { migrate } from '../../../../src/storage/schema';
import {
  findGauge,
  findTester,
  gaugesOf,
  insertGauge,
  insertTester,
  listTesters,
  recalibrate,
  renewCertificate,
  retireGauge,
  suspendTester,
} from '../../../../src/storage/repositories/testers';
import type { Gauge, TesterCertification } from '../../../../src/domain/tester';

let db: Database;

const tester: TesterCertification = {
  testerId: 'T-118',
  name: 'p. adeyemi',
  agency: 'state waterworks board',
  certificateNumber: 'BF-4471',
  issuedOn: '2023-05-01',
  expiresOn: '2026-04-30',
  endorsements: ['RP', 'RPDA', 'DC', 'DCDA'],
};

const gauge: Gauge = {
  gaugeId: 'G-77',
  testerId: 'T-118',
  maker: 'midwest',
  serialNumber: '845-C',
  calibratedOn: '2024-02-15',
  calibrationIntervalMonths: 12,
  accuracyPsid: 0.2,
};

beforeEach(() => {
  db = openDatabase({ file: ':memory:' });
  const run = migrate(db, '2024-04-15T09:00:00Z');
  if (!run.ok) {
    throw new Error(run.error);
  }
  insertTester(db, tester);
});

afterEach(() => {
  closeDatabase(db);
});

describe('testers', () => {
  it('reads the endorsements back as a list', () => {
    expect(findTester(db, 'T-118')?.endorsements).toEqual(['RP', 'RPDA', 'DC', 'DCDA']);
  });

  it('leaves an unsuspended tester without the fields', () => {
    const found = findTester(db, 'T-118');
    expect(found?.suspendedOn).toBeUndefined();
    expect(found?.suspendedReason).toBeUndefined();
  });

  it('lists them by name', () => {
    insertTester(db, { ...tester, testerId: 'T-2', name: 'a. bello', certificateNumber: 'BF-2' });
    expect(listTesters(db).map((entry) => entry.name)).toEqual(['a. bello', 'p. adeyemi']);
  });

  it('refuses the same certificate number at the same agency', () => {
    expect(insertTester(db, { ...tester, testerId: 'T-3' }).ok).toBe(false);
  });

  it('takes the same certificate number at another agency', () => {
    expect(insertTester(db, { ...tester, testerId: 'T-4', agency: 'county' }).ok).toBe(true);
  });

  it('renews a certificate with a new span and new endorsements', () => {
    const renewed = renewCertificate(db, 'T-118', '2026-05-01', '2029-04-30', ['RP', 'PVB']);
    expect(renewed.ok).toBe(true);
    const found = findTester(db, 'T-118');
    expect(found?.expiresOn).toBe('2029-04-30');
    expect(found?.endorsements).toEqual(['RP', 'PVB']);
  });

  it('refuses a renewal that runs backwards or covers nothing', () => {
    expect(renewCertificate(db, 'T-118', '2026-05-01', '2026-01-01', ['RP']).ok).toBe(false);
    expect(renewCertificate(db, 'T-118', '2026-05-01', '2029-04-30', []).ok).toBe(false);
    expect(renewCertificate(db, 'T-404', '2026-05-01', '2029-04-30', ['RP']).ok).toBe(false);
  });

  it('suspends with a reason and refuses one without', () => {
    expect(suspendTester(db, 'T-118', '2024-06-01', 'falsified three reports').ok).toBe(true);
    const found = findTester(db, 'T-118');
    expect(found?.suspendedOn).toBe('2024-06-01');
    expect(found?.suspendedReason).toContain('falsified');
    expect(suspendTester(db, 'T-118', '2024-06-01', '   ').ok).toBe(false);
    expect(suspendTester(db, 'T-404', '2024-06-01', 'x').ok).toBe(false);
  });
});

describe('gauges', () => {
  beforeEach(() => {
    insertGauge(db, gauge);
  });

  it('reads one back against its tester', () => {
    expect(findGauge(db, 'G-77')?.testerId).toBe('T-118');
    expect(gaugesOf(db, 'T-118')).toHaveLength(1);
    expect(gaugesOf(db, 'T-404')).toEqual([]);
  });

  it('refuses one belonging to nobody', () => {
    expect(insertGauge(db, { ...gauge, gaugeId: 'G-2', testerId: 'T-404', serialNumber: '2' }).ok).toBe(
      false,
    );
  });

  it('refuses the same maker and serial twice', () => {
    expect(insertGauge(db, { ...gauge, gaugeId: 'G-3' }).ok).toBe(false);
  });

  it('records a recalibration with its band', () => {
    expect(recalibrate(db, 'G-77', '2025-02-10', 0.1).ok).toBe(true);
    const found = findGauge(db, 'G-77');
    expect(found?.calibratedOn).toBe('2025-02-10');
    expect(found?.accuracyPsid).toBe(0.1);
  });

  it('refuses a recalibration dated before the last one', () => {
    expect(recalibrate(db, 'G-77', '2023-01-01', 0.2).ok).toBe(false);
    expect(recalibrate(db, 'G-77', '2025-02-10', 0).ok).toBe(false);
    expect(recalibrate(db, 'G-404', '2025-02-10', 0.2).ok).toBe(false);
  });

  it('retires one and will not recalibrate it afterwards', () => {
    expect(retireGauge(db, 'G-77', '2025-06-01').ok).toBe(true);
    expect(findGauge(db, 'G-77')?.retiredOn).toBe('2025-06-01');
    expect(retireGauge(db, 'G-77', '2025-07-01').ok).toBe(false);
    expect(recalibrate(db, 'G-77', '2025-08-01', 0.2).ok).toBe(false);
  });
});

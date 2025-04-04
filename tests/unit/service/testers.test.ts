import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { passRate, testerRecord, testerRoster } from '../../../src/service/testers';
import {
  insertGauge,
  insertTester,
  suspendTester,
} from '../../../src/storage/repositories/testers';
import {
  fileTest,
  fit,
  open,
  openOffice,
  walk,
  FAILING_RP,
  type Office,
} from '../../support/office';

let office: Office;

function record(testerId = 'T-118'): ReturnType<typeof testerRecord> {
  return testerRecord(office.register, testerId, '2024-12-01');
}

beforeEach(() => {
  office = openOffice();
});

afterEach(() => {
  office.close();
});

describe('one tester', () => {
  it('reads nothing filed as nothing rather than as a bad rate', () => {
    const empty = record();
    expect(empty.ok).toBe(true);
    if (!empty.ok) {
      return;
    }
    expect(empty.value.filed).toBe(0);
    expect(empty.value.meanFilingDays).toBe(0);
    expect(passRate(empty.value)).toBeUndefined();
  });

  it('counts what they filed and what came of it', () => {
    const connectionId = open(office, { accountNumber: 'A-1' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2024-02-01' });
    fileTest(office, { assemblyId, testedOn: '2024-02-05', filedOn: '2024-02-08' });
    fileTest(office, {
      assemblyId,
      testedOn: '2024-06-05',
      filedOn: '2024-06-06',
      asFound: FAILING_RP,
    });

    const filed = record();
    expect(filed.ok).toBe(true);
    if (!filed.ok) {
      return;
    }
    expect(filed.value.filed).toBe(2);
    expect(filed.value.accepted).toBe(2);
    expect(filed.value.passed).toBe(1);
    expect(filed.value.failed).toBe(1);
    expect(passRate(filed.value)).toBe(0.5);
    expect(filed.value.meanFilingDays).toBe(2);
    expect(filed.value.worstFilingDays).toBe(3);
  });

  it('counts a repair the tester made on site', () => {
    const connectionId = open(office, { accountNumber: 'A-2' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2024-02-01' });
    fileTest(office, {
      assemblyId,
      testedOn: '2024-02-05',
      asFound: FAILING_RP,
      repairMade: true,
      repairNote: 'reground the first check',
      asLeft: { check1Differential: 8.4, reliefOpening: 3.1 },
    });
    const filed = record();
    expect(filed.ok && filed.value.repairs).toBe(1);
    expect(filed.ok && filed.value.passed).toBe(1);
  });

  it('names why the office refused anything it refused', () => {
    const connectionId = open(office, { accountNumber: 'A-3' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2024-02-01' });
    fileTest(office, { assemblyId, testedOn: '2024-02-05', filedOn: '2024-05-05' });
    const filed = record();
    expect(filed.ok && filed.value.refused).toBe(1);
    expect(filed.ok && filed.value.refusalCodes).toEqual(['filed_too_late']);
  });

  it('reads the certificate standing as at the day asked about', () => {
    suspendTester(office.register.db, 'T-118', '2024-06-01', 'falsified reports');
    expect(record().ok && record().ok).toBe(true);
    const suspended = testerRecord(office.register, 'T-118', '2024-12-01');
    expect(suspended.ok && suspended.value.standing).toBe('suspended');
    const before = testerRecord(office.register, 'T-118', '2024-01-01');
    expect(before.ok && before.value.standing).toBe('valid');
  });

  it('says so when there is no such tester', () => {
    expect(record('T-404').ok).toBe(false);
  });
});

describe('the roster', () => {
  it('puts the busiest tester at the top', () => {
    insertTester(office.register.db, {
      testerId: 'T-200',
      name: 'a. bello',
      agency: 'board',
      certificateNumber: 'BF-9',
      issuedOn: '2019-01-01',
      expiresOn: '2029-01-01',
      endorsements: ['RP'],
    });
    insertGauge(office.register.db, {
      gaugeId: 'G-200',
      testerId: 'T-200',
      maker: 'midwest',
      serialNumber: '900-A',
      calibratedOn: '2019-01-01',
      calibrationIntervalMonths: 240,
      accuracyPsid: 0.2,
    });
    const connectionId = open(office, { accountNumber: 'A-4' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2024-02-01' });
    fileTest(office, { assemblyId, testedOn: '2024-02-05', testerId: 'T-200', gaugeId: 'G-200' });

    const roster = testerRoster(office.register, '2024-12-01');
    expect(roster.map((entry) => entry.testerId)).toEqual(['T-200', 'T-118']);
    expect(roster[0]?.filed).toBe(1);
  });
});

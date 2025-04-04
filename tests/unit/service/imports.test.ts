import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../../src/service/register';
import { openConnection } from '../../../src/service/connections';
import { installAssembly } from '../../../src/service/assemblies';
import { describeImport, importReportsCsv } from '../../../src/service/imports';
import { insertModel } from '../../../src/storage/repositories/assemblies';
import {
  insertGauge,
  insertTester,
  suspendTester,
} from '../../../src/storage/repositories/testers';
import { lastPassingTest, reportsForAssembly } from '../../../src/storage/repositories/reports';

let register: Register;

const HEADER =
  'assembly,tester,gauge,tested,filed,repair,found.check1Differential,found.reliefOpening,left.check1Differential,left.reliefOpening';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

beforeEach(() => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-10-21T09:00:00Z',
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
  insertModel(register.db, {
    modelId: 'WK-375',
    maker: 'watkin',
    model: '375',
    assemblyClass: 'RP',
    sizes: [2],
    listedOn: '2016-04-01',
    note: '',
  });
  insertTester(register.db, {
    testerId: 'T-118',
    name: 'p. adeyemi',
    agency: 'board',
    certificateNumber: 'BF-4471',
    issuedOn: '2019-05-01',
    expiresOn: '2029-04-30',
    endorsements: ['RP'],
  });
  insertGauge(register.db, {
    gaugeId: 'G-77',
    testerId: 'T-118',
    maker: 'midwest',
    serialNumber: '845-C',
    calibratedOn: '2019-05-01',
    calibrationIntervalMonths: 240,
    accuracyPsid: 0.2,
  });
  for (const account of ['A-1', 'A-2']) {
    const opened2 = openConnection(register, {
      accountNumber: account,
      premiseName: 'a premise',
      premiseAddress: 'somewhere',
      premiseUseCode: 'INDUSTRIAL',
      serviceSizeInches: 2,
      fireService: false,
      purveyorMetered: true,
      connectedOn: '2018-01-01',
    });
    if (!opened2.ok) {
      throw new Error(opened2.error);
    }
    installAssembly(register, {
      connectionId: opened2.value.connectionId,
      scope: 'containment',
      assemblyClass: 'RP',
      modelId: 'WK-375',
      serialNumber: account,
      sizeInches: 2,
      installedOn: '2019-01-01',
      location: 'vault',
    });
  }
});

afterEach(() => {
  closeRegister(register);
});

describe('a batch that goes in', () => {
  it('files every row and counts them', () => {
    const summary = importReportsCsv(
      register,
      csv(
        'BA-00001,T-118,G-77,2024-03-01,2024-03-05,,8.2,3.1,,',
        'BA-00002,T-118,G-77,2024-03-02,2024-03-05,,7.9,2.8,,',
      ),
    );
    expect(summary.ok).toBe(true);
    if (!summary.ok) {
      return;
    }
    expect(summary.value.filed).toHaveLength(2);
    expect(summary.value.accepted).toBe(2);
    expect(summary.value.passed).toBe(2);
    expect(lastPassingTest(register.db, 'BA-00001')?.report.testedOn).toBe('2024-03-01');
    expect(describeImport(summary.value)).toContain('2 filed, 2 accepted');
  });

  it('files against the test date when the file leaves the filing date blank', () => {
    const summary = importReportsCsv(register, csv('BA-00001,T-118,G-77,2024-03-01,,,8.2,3.1,,'));
    expect(summary.ok && summary.value.accepted).toBe(1);
    expect(reportsForAssembly(register.db, 'BA-00001')[0]?.report.filedOn).toBe('2024-03-01');
  });

  it('reads a repair with its as left readings', () => {
    const summary = importReportsCsv(
      register,
      csv('BA-00001,T-118,G-77,2024-03-01,2024-03-05,new first check,0.4,3.1,8.8,3.1'),
    );
    expect(summary.ok && summary.value.passed).toBe(1);
    const stored = reportsForAssembly(register.db, 'BA-00001')[0];
    expect(stored?.asFoundOutcome).toBe('fail');
    expect(stored?.outcome).toBe('pass');
  });

  it('keeps a refused row on the register and says so', () => {
    suspendTester(register.db, 'T-118', '2024-01-01', 'falsified reports');
    const summary = importReportsCsv(
      register,
      csv('BA-00001,T-118,G-77,2024-03-01,2024-03-05,,8.2,3.1,,'),
    );
    expect(summary.ok).toBe(true);
    if (!summary.ok) {
      return;
    }
    expect(summary.value.accepted).toBe(0);
    expect(summary.value.refused).toBe(1);
    expect(lastPassingTest(register.db, 'BA-00001')).toBeUndefined();
    expect(reportsForAssembly(register.db, 'BA-00001')).toHaveLength(1);
  });
});

describe('rows the office cannot read', () => {
  it('rejects one with no assembly on it and keeps the others', () => {
    const summary = importReportsCsv(
      register,
      csv(
        ',T-118,G-77,2024-03-01,2024-03-05,,8.2,3.1,,',
        'BA-00002,T-118,G-77,2024-03-02,2024-03-05,,7.9,2.8,,',
      ),
    );
    expect(summary.ok).toBe(true);
    if (!summary.ok) {
      return;
    }
    expect(summary.value.rejected).toHaveLength(1);
    expect(summary.value.rejected[0]?.line).toBe(2);
    expect(summary.value.filed).toHaveLength(1);
  });

  it('rejects a bad date and a reading that is not a number', () => {
    const bad = importReportsCsv(register, csv('BA-00001,T-118,G-77,march,2024-03-05,,8.2,3.1,,'));
    expect(bad.ok && bad.value.rejected[0]?.reason).toContain('not a test date');
    const worse = importReportsCsv(
      register,
      csv('BA-00001,T-118,G-77,2024-03-01,2024-03-05,,lovely,3.1,,'),
    );
    expect(worse.ok && worse.value.rejected[0]?.reason).toContain('neither a reading');
  });

  it('rejects a row with no readings at all', () => {
    const summary = importReportsCsv(
      register,
      csv('BA-00001,T-118,G-77,2024-03-01,2024-03-05,,,,,'),
    );
    expect(summary.ok && summary.value.rejected[0]?.reason).toContain('no as found readings');
  });

  it('rejects as left readings with no repair behind them', () => {
    const summary = importReportsCsv(
      register,
      csv('BA-00001,T-118,G-77,2024-03-01,2024-03-05,,0.4,3.1,8.8,3.1'),
    );
    expect(summary.ok && summary.value.rejected[0]?.reason).toContain('no repair note');
  });

  it('rejects a row against an assembly nobody has', () => {
    const summary = importReportsCsv(
      register,
      csv('BA-00404,T-118,G-77,2024-03-01,2024-03-05,,8.2,3.1,,'),
    );
    expect(summary.ok && summary.value.rejected[0]?.reason).toContain('BA-00404');
  });

  it('refuses the whole file when a column does not belong', () => {
    const summary = importReportsCsv(
      register,
      'assembly,tester,gauge,tested,weather\nBA-1,T,G,2024-01-01,fine',
    );
    expect(summary.ok).toBe(true);
    if (!summary.ok) {
      return;
    }
    expect(summary.value.rejected[0]?.reason).toContain('the column weather');
  });

  it('refuses a file with no assembly column at all', () => {
    const summary = importReportsCsv(register, 'tester,gauge,tested\nT,G,2024-01-01');
    expect(summary.ok).toBe(false);
    if (!summary.ok) {
      expect(summary.error).toContain('no assembly');
    }
  });

  it('refuses a file that is not a table', () => {
    expect(importReportsCsv(register, '').ok).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../../src/service/register';
import { openConnection } from '../../../src/service/connections';
import { installAssembly, takeAssemblyOut } from '../../../src/service/assemblies';
import { fileReport, type FilingInput } from '../../../src/service/filing';
import { insertModel } from '../../../src/storage/repositories/assemblies';
import { insertGauge, insertTester, suspendTester } from '../../../src/storage/repositories/testers';
import { insertNotice, openNotices } from '../../../src/storage/repositories/notices';
import { lastPassingTest, reportsForAssembly } from '../../../src/storage/repositories/reports';
import { eventsFor } from '../../../src/storage/repositories/events';

let register: Register;

function filing(overrides: Partial<FilingInput> = {}): FilingInput {
  return {
    assemblyId: 'BA-00001',
    testerId: 'T-118',
    gaugeId: 'G-77',
    testedOn: '2024-05-14',
    filedOn: '2024-05-16',
    asFound: { check1Differential: 8.2, reliefOpening: 3.1 },
    repairMade: false,
    ...overrides,
  };
}

beforeEach(() => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-07-12T09:00:00Z',
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
  openConnection(register, {
    accountNumber: 'A-1001',
    premiseName: 'kerrigan plating',
    premiseAddress: '14 forge road',
    premiseUseCode: 'PLATING',
    serviceSizeInches: 2,
    fireService: false,
    purveyorMetered: true,
    connectedOn: '2018-01-01',
  });
  insertModel(register.db, {
    modelId: 'WK-375',
    maker: 'watkin',
    model: '375 series',
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
    issuedOn: '2023-05-01',
    expiresOn: '2026-04-30',
    endorsements: ['RP', 'DC'],
  });
  insertGauge(register.db, {
    gaugeId: 'G-77',
    testerId: 'T-118',
    maker: 'midwest',
    serialNumber: '845-C',
    calibratedOn: '2024-02-15',
    calibrationIntervalMonths: 12,
    accuracyPsid: 0.2,
  });
  installAssembly(register, {
    connectionId: 'SC-00001',
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
  closeRegister(register);
});

describe('a clean filing', () => {
  it('is accepted and passes', () => {
    const filed = fileReport(register, filing());
    expect(filed.ok).toBe(true);
    if (!filed.ok) {
      return;
    }
    expect(filed.value.ruling.admissible).toBe(true);
    expect(filed.value.evaluation.outcome).toBe('pass');
    expect(filed.value.stored.report.reportId).toBe('TR-000001');
  });

  it('reads the class off the assembly rather than the form', () => {
    const filed = fileReport(register, filing());
    expect(filed.ok && filed.value.stored.report.assemblyClassTested).toBe('RP');
  });

  it('becomes the date the cycle runs from', () => {
    fileReport(register, filing());
    expect(lastPassingTest(register.db, 'BA-00001')?.report.testedOn).toBe('2024-05-14');
  });

  it('leaves a line on the trail', () => {
    fileReport(register, filing());
    const events = eventsFor(register.db, 'report', 'TR-000001');
    expect(events[0]?.kind).toBe('report_filed');
    expect(events[0]?.detail).toContain('pass on the as_found readings');
  });
});

describe('a report the office cannot take', () => {
  it('is stored, refused, and does not move the anniversary', () => {
    suspendTester(register.db, 'T-118', '2024-01-01', 'falsified reports');
    const filed = fileReport(register, filing());
    expect(filed.ok).toBe(true);
    if (!filed.ok) {
      return;
    }
    expect(filed.value.ruling.admissible).toBe(false);
    expect(filed.value.stored.inadmissibleCodes).toEqual(['tester_suspended']);
    expect(filed.value.evaluation.outcome).toBe('pass');
    expect(lastPassingTest(register.db, 'BA-00001')).toBeUndefined();
    expect(reportsForAssembly(register.db, 'BA-00001')).toHaveLength(1);
  });

  it('says refused on the trail', () => {
    suspendTester(register.db, 'T-118', '2024-01-01', 'x');
    fileReport(register, filing());
    const events = eventsFor(register.db, 'report', 'TR-000001');
    expect(events[0]?.kind).toBe('report_refused');
    expect(events[0]?.detail).toContain('tester_suspended');
  });

  it('is turned away at the counter when the gauge is not registered', () => {
    const filed = fileReport(register, filing({ gaugeId: 'G-404' }));
    expect(filed.ok).toBe(false);
    if (!filed.ok) {
      expect(filed.error).toContain('register it first');
    }
    expect(reportsForAssembly(register.db, 'BA-00001')).toHaveLength(0);
  });

  it('is turned away when the tester is not on file either', () => {
    const filed = fileReport(register, filing({ testerId: 'T-404' }));
    expect(filed.ok).toBe(false);
    if (!filed.ok) {
      expect(filed.error).toContain('register them first');
    }
  });

  it('is refused when the gauge was out of calibration on the day', () => {
    const filed = fileReport(register, filing({ testedOn: '2023-06-01', filedOn: '2023-06-02' }));
    expect(filed.ok && filed.value.stored.inadmissibleCodes).toEqual(['gauge_out_of_calibration']);
  });

  it('is refused when it came in after the window', () => {
    const filed = fileReport(register, filing({ filedOn: '2024-07-01' }));
    expect(filed.ok && filed.value.stored.inadmissibleCodes).toEqual(['filed_too_late']);
  });

  it('does not clear the notices', () => {
    insertNotice(register.db, {
      noticeId: 'N-000001',
      connectionId: 'SC-00001',
      stage: 'first',
      dueDate: '2024-04-01',
      issuedOn: '2024-04-02',
      ladder: 'standard',
      daysPastDue: 1,
      body: 'past due',
    });
    suspendTester(register.db, 'T-118', '2024-01-01', 'x');
    const filed = fileReport(register, filing());
    expect(filed.ok && filed.value.noticesCleared).toBe(0);
    expect(openNotices(register.db)).toHaveLength(1);
  });
});

describe('what the readings come to', () => {
  it('fails a first check under five', () => {
    const filed = fileReport(
      register,
      filing({ asFound: { check1Differential: 4.2, reliefOpening: 2.4 } }),
    );
    expect(filed.ok && filed.value.evaluation.outcome).toBe('fail');
    expect(lastPassingTest(register.db, 'BA-00001')).toBeUndefined();
  });

  it('fails the buffer rule even where both readings passed alone', () => {
    const filed = fileReport(
      register,
      filing({ asFound: { check1Differential: 5.2, reliefOpening: 3.4 } }),
    );
    expect(filed.ok && filed.value.evaluation.outcome).toBe('fail');
  });

  it('is incomplete when a reading is missing', () => {
    const filed = fileReport(register, filing({ asFound: { check1Differential: 8.2 } }));
    expect(filed.ok && filed.value.evaluation.outcome).toBe('incomplete');
  });

  it('passes on the as left readings after a repair', () => {
    const filed = fileReport(
      register,
      filing({
        asFound: { check1Differential: 0.4, reliefOpening: 3.1 },
        repairMade: true,
        repairNote: 'new first check rubber',
        asLeft: { check1Differential: 8.8, reliefOpening: 3.1 },
      }),
    );
    expect(filed.ok).toBe(true);
    if (!filed.ok) {
      return;
    }
    expect(filed.value.evaluation.outcome).toBe('pass');
    expect(filed.value.stored.asFoundOutcome).toBe('fail');
    expect(lastPassingTest(register.db, 'BA-00001')?.report.reportId).toBe('TR-000001');
  });

  it('refuses a repair with no as left readings behind it', () => {
    const filed = fileReport(register, filing({ repairMade: true, repairNote: 'reground' }));
    expect(filed.ok).toBe(false);
    if (!filed.ok) {
      expect(filed.error).toContain('as left');
    }
    expect(reportsForAssembly(register.db, 'BA-00001')).toHaveLength(0);
  });
});

describe('clearing the letters', () => {
  beforeEach(() => {
    insertNotice(register.db, {
      noticeId: 'N-000001',
      connectionId: 'SC-00001',
      stage: 'first',
      dueDate: '2024-04-01',
      issuedOn: '2024-04-02',
      ladder: 'standard',
      daysPastDue: 1,
      body: 'past due',
    });
    insertNotice(register.db, {
      noticeId: 'N-000002',
      connectionId: 'SC-00001',
      stage: 'second',
      dueDate: '2024-04-01',
      issuedOn: '2024-05-02',
      ladder: 'standard',
      daysPastDue: 31,
      body: 'still past due',
    });
  });

  it('clears the whole ladder on a passing accepted test', () => {
    const filed = fileReport(register, filing());
    expect(filed.ok && filed.value.noticesCleared).toBe(2);
    expect(openNotices(register.db)).toEqual([]);
  });

  it('leaves them open on a failing one', () => {
    const filed = fileReport(
      register,
      filing({ asFound: { check1Differential: 1.2, reliefOpening: 2.4 } }),
    );
    expect(filed.ok && filed.value.noticesCleared).toBe(0);
    expect(openNotices(register.db)).toHaveLength(2);
  });
});

describe('filings the register will not take at all', () => {
  it('refuses one against an assembly that is not on file', () => {
    expect(fileReport(register, filing({ assemblyId: 'BA-00404' })).ok).toBe(false);
  });

  it('refuses one dated before the assembly went in', () => {
    expect(fileReport(register, filing({ testedOn: '2018-06-01' })).ok).toBe(false);
  });

  it('refuses one dated after the assembly came out', () => {
    takeAssemblyOut(register, 'BA-00001', '2024-01-01', 'cracked');
    expect(fileReport(register, filing()).ok).toBe(false);
  });

  it('refuses one filed before it was tested', () => {
    expect(fileReport(register, filing({ filedOn: '2024-05-01' })).ok).toBe(false);
  });
});

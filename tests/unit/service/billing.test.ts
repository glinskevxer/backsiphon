import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../../src/service/register';
import { openConnection } from '../../../src/service/connections';
import { recordSurvey } from '../../../src/service/surveys';
import { installAssembly } from '../../../src/service/assemblies';
import { fileReport } from '../../../src/service/filing';
import { applyForVariance, decideGrant } from '../../../src/service/variances';
import { billingRun, invoiceFor, reinspectionCount } from '../../../src/service/billing';
import { insertModel } from '../../../src/storage/repositories/assemblies';
import { insertGauge, insertTester } from '../../../src/storage/repositories/testers';
import { appendEvent } from '../../../src/storage/repositories/events';

let register: Register;

function setUp(account: string, findings: string[]): string {
  const opened = openConnection(register, {
    accountNumber: account,
    premiseName: 'a premise',
    premiseAddress: 'somewhere',
    premiseUseCode: 'INDUSTRIAL',
    serviceSizeInches: 2,
    fireService: false,
    purveyorMetered: true,
    connectedOn: '2018-01-01',
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  recordSurvey(register, {
    connectionId: opened.value.connectionId,
    surveyedOn: '2022-01-10',
    surveyor: 'r. okafor',
    findingCodes: findings,
    accessGranted: true,
  });
  return opened.value.connectionId;
}

beforeEach(() => {
  const opened = openRegister({ file: ':memory:', actor: 'clerk.hines', now: () => '2024-09-05T09:00:00Z' });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
  for (const [id, assemblyClass] of [
    ['WK-375', 'RP'],
    ['WK-350', 'DC'],
  ] as const) {
    insertModel(register.db, {
      modelId: id,
      maker: 'watkin',
      model: id,
      assemblyClass,
      sizes: [2],
      listedOn: '2016-04-01',
      note: '',
    });
  }
  insertTester(register.db, {
    testerId: 'T-118',
    name: 'p. adeyemi',
    agency: 'board',
    certificateNumber: 'BF-4471',
    issuedOn: '2019-05-01',
    expiresOn: '2029-04-30',
    endorsements: ['RP', 'DC'],
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
});

afterEach(() => {
  closeRegister(register);
});

describe('one invoice', () => {
  it('bills the class the office requires, not the one fitted', () => {
    const id = setUp('A-1', ['AUX_WELL']);
    installAssembly(register, {
      connectionId: id,
      scope: 'containment',
      assemblyClass: 'RP',
      modelId: 'WK-375',
      serialNumber: '1',
      sizeInches: 2,
      installedOn: '2022-02-01',
      location: 'vault',
    });
    fileReport(register, {
      assemblyId: 'BA-00001',
      testerId: 'T-118',
      gaugeId: 'G-77',
      testedOn: '2024-03-01',
      filedOn: '2024-03-01',
      asFound: { check1Differential: 8.2, reliefOpening: 3.1 },
      repairMade: false,
    });
    const invoice = invoiceFor(register, id, '2024-09-05');
    expect(invoice.ok).toBe(true);
    if (!invoice.ok) {
      return;
    }
    expect(invoice.value.requiredClass).toBe('RP');
    expect(invoice.value.invoice.totalCents).toBe(9750);
  });

  it('bills the varied band once a variance is in effect', () => {
    const id = setUp('A-2', ['AUX_WELL']);
    applyForVariance(register, { connectionId: id, appliedOn: '2024-01-05', acceptedClass: 'DC' });
    decideGrant(register, 'V-0001', {
      decidedOn: '2024-01-20',
      effectiveFrom: '2024-02-01',
      conditions: ['the well stays capped'],
    });
    const invoice = invoiceFor(register, id, '2024-09-05');
    expect(invoice.ok && invoice.value.requiredClass).toBe('DC');
    expect(invoice.ok && invoice.value.invoice.lines[0]?.cents).toBe(7800);
  });

  it('adds the penalties the notice ladder has reached', () => {
    const id = setUp('A-3', ['AUX_WELL']);
    installAssembly(register, {
      connectionId: id,
      scope: 'containment',
      assemblyClass: 'RP',
      modelId: 'WK-375',
      serialNumber: '2',
      sizeInches: 2,
      installedOn: '2022-02-01',
      location: 'vault',
    });
    fileReport(register, {
      assemblyId: 'BA-00001',
      testerId: 'T-118',
      gaugeId: 'G-77',
      testedOn: '2023-03-01',
      filedOn: '2023-03-01',
      asFound: { check1Differential: 8.2, reliefOpening: 3.1 },
      repairMade: false,
    });
    const invoice = invoiceFor(register, id, '2024-04-30');
    expect(invoice.ok).toBe(true);
    if (!invoice.ok) {
      return;
    }
    expect(invoice.value.stage).toBe('shutoff');
    expect(invoice.value.invoice.lines.map((line) => line.code)).toContain('SHUTOFF');
    expect(invoice.value.invoice.lines.map((line) => line.code)).toContain('HEALTH');
  });

  it('counts the reinspection visits off the trail', () => {
    const id = setUp('A-4', []);
    appendEvent(register.db, {
      happenedAt: '2024-05-01T09:00:00Z',
      actor: 'inspector.owusu',
      kind: 'reinspection_visit',
      subjectKind: 'connection',
      subjectId: id,
    });
    appendEvent(register.db, {
      happenedAt: '2023-05-01T09:00:00Z',
      actor: 'inspector.owusu',
      kind: 'reinspection_visit',
      subjectKind: 'connection',
      subjectId: id,
    });
    expect(reinspectionCount(register, id, '2024-01-01')).toBe(1);
    const invoice = invoiceFor(register, id, '2024-09-05');
    expect(invoice.ok && invoice.value.reinspections).toBe(1);
  });

  it('says so when there is nothing to bill against', () => {
    expect(invoiceFor(register, 'SC-00404', '2024-09-05').ok).toBe(false);
  });
});

describe('a billing run', () => {
  it('totals the register and names what it could not read', () => {
    setUp('A-1', ['AUX_WELL']);
    openConnection(register, {
      accountNumber: 'A-2',
      premiseName: 'unwalked',
      premiseAddress: 'somewhere',
      premiseUseCode: 'OFFICE',
      serviceSizeInches: 1,
      fireService: false,
      purveyorMetered: true,
      connectedOn: '2020-01-01',
    });
    const run = billingRun(register, '2024-09-05');
    expect(run.invoices).toHaveLength(1);
    expect(run.skipped[0]?.reason).toContain('never been surveyed');
    expect(run.totalCents).toBe(run.invoices[0]?.invoice.totalCents);
  });
});

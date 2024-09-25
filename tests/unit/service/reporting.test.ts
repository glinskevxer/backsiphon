import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../../src/service/register';
import { openConnection } from '../../../src/service/connections';
import { recordSurvey } from '../../../src/service/surveys';
import { installAssembly } from '../../../src/service/assemblies';
import { fileReport } from '../../../src/service/filing';
import { programSummary, workList } from '../../../src/service/reporting';
import { insertModel } from '../../../src/storage/repositories/assemblies';
import { insertGauge, insertTester } from '../../../src/storage/repositories/testers';

let register: Register;

function connection(account: string, route = 'north'): string {
  const opened = openConnection(register, {
    accountNumber: account,
    premiseName: `premise ${account}`,
    premiseAddress: `${account} forge road`,
    premiseUseCode: 'INDUSTRIAL',
    serviceSizeInches: 2,
    fireService: false,
    purveyorMetered: true,
    connectedOn: '2018-01-01',
    route,
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  return opened.value.connectionId;
}

function survey(connectionId: string, findings: string[]): void {
  const recorded = recordSurvey(register, {
    connectionId,
    surveyedOn: '2022-01-10',
    surveyor: 'r. okafor',
    findingCodes: findings,
    accessGranted: true,
  });
  if (!recorded.ok) {
    throw new Error(recorded.error);
  }
}

function fit(connectionId: string, serial: string): string {
  const fitted = installAssembly(register, {
    connectionId,
    scope: 'containment',
    assemblyClass: 'RP',
    modelId: 'WK-375',
    serialNumber: serial,
    sizeInches: 2,
    installedOn: '2022-02-01',
    location: 'meter vault',
  });
  if (!fitted.ok) {
    throw new Error(fitted.error);
  }
  return fitted.value.assemblyId;
}

function test(assemblyId: string, testedOn: string): void {
  const filed = fileReport(register, {
    assemblyId,
    testerId: 'T-118',
    gaugeId: 'G-77',
    testedOn,
    filedOn: testedOn,
    asFound: { check1Differential: 8.2, reliefOpening: 3.1 },
    repairMade: false,
  });
  if (!filed.ok) {
    throw new Error(filed.error);
  }
}

beforeEach(() => {
  const opened = openRegister({ file: ':memory:', actor: 'clerk.hines', now: () => '2024-10-01T09:00:00Z' });
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
});

afterEach(() => {
  closeRegister(register);
});

describe('the program summary', () => {
  it('counts an empty register without dividing by nothing', () => {
    const summary = programSummary(register, '2024-10-01');
    expect(summary.connections).toBe(0);
    expect(summary.complianceRate).toBe(1);
  });

  it('counts the connections, the assemblies and the standing of each', () => {
    const first = connection('A-1');
    survey(first, ['AUX_WELL']);
    test(fit(first, '1'), '2024-06-01');
    const second = connection('A-2');
    survey(second, []);
    connection('A-3');

    const summary = programSummary(register, '2024-10-01');
    expect(summary.connections).toBe(3);
    expect(summary.assemblies).toBe(1);
    expect(summary.testableAssemblies).toBe(1);
    expect(summary.byStanding.compliant).toBe(1);
    expect(summary.byStanding.deficient).toBe(1);
    expect(summary.byStanding.unreadable).toBe(1);
    expect(summary.neverSurveyed).toBe(1);
  });

  it('counts the connections by the degree at the meter', () => {
    const first = connection('A-1');
    survey(first, ['AUX_WELL']);
    const second = connection('A-2');
    survey(second, []);
    const summary = programSummary(register, '2024-10-01');
    expect(summary.byDegree.health).toBe(1);
    expect(summary.byDegree.nonhealth).toBe(1);
    expect(summary.byDegree.none).toBe(0);
  });

  it('reads the compliance rate off the assemblies inside their cycle', () => {
    const first = connection('A-1');
    survey(first, ['AUX_WELL']);
    test(fit(first, '1'), '2024-06-01');
    const second = connection('A-2');
    survey(second, ['AUX_WELL']);
    test(fit(second, '2'), '2022-06-01');
    const summary = programSummary(register, '2024-10-01');
    expect(summary.complianceRate).toBe(0.5);
  });

  it('names the connections that may be shut off', () => {
    const first = connection('A-1');
    survey(first, ['AUX_WELL']);
    test(fit(first, '1'), '2022-06-01');
    const summary = programSummary(register, '2024-10-01');
    expect(summary.shutoffEligible).toEqual([first]);
    expect(summary.byStanding.shutoff_eligible).toBe(1);
  });
});

describe('the work list', () => {
  it('lists what is already due, in route order', () => {
    const north = connection('A-1', 'north');
    survey(north, ['AUX_WELL']);
    test(fit(north, '1'), '2023-06-01');
    const south = connection('A-2', 'south');
    survey(south, ['AUX_WELL']);
    test(fit(south, '2'), '2023-01-01');

    const items = workList(register, { asOf: '2024-10-01' });
    expect(items.map((item) => item.route)).toEqual(['north', 'south']);
    expect(items[0]?.due).toBe('2024-06-01');
    expect(items[0]?.location).toBe('meter vault');
  });

  it('looks ahead when it is asked to', () => {
    const id = connection('A-1');
    survey(id, ['AUX_WELL']);
    test(fit(id, '1'), '2024-06-01');
    expect(workList(register, { asOf: '2024-10-01' })).toHaveLength(0);
    expect(workList(register, { asOf: '2024-10-01', withinDays: 300 })).toHaveLength(1);
  });

  it('puts a deficient point on the list whether or not a test is due', () => {
    const id = connection('A-1');
    survey(id, ['AUX_WELL']);
    const items = workList(register, { asOf: '2024-10-01' });
    expect(items).toHaveLength(1);
    expect(items[0]?.assemblyId).toBeUndefined();
    expect(items[0]?.urgency).toBe('immediate');
  });

  it('puts a connection nobody has walked on the list as a survey', () => {
    connection('A-1');
    const items = workList(register, { asOf: '2024-10-01' });
    expect(items[0]?.urgency).toBe('survey');
  });

  it('takes one route at a time', () => {
    const north = connection('A-1', 'north');
    survey(north, ['AUX_WELL']);
    const south = connection('A-2', 'south');
    survey(south, ['AUX_WELL']);
    expect(workList(register, { asOf: '2024-10-01', route: 'south' })).toHaveLength(1);
  });
});

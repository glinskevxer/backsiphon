import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../../src/service/register';
import { openConnection } from '../../../src/service/connections';
import { recordSurvey } from '../../../src/service/surveys';
import { installAssembly } from '../../../src/service/assemblies';
import { fileReport } from '../../../src/service/filing';
import { describeRun, runNotices } from '../../../src/service/notices';
import { insertModel } from '../../../src/storage/repositories/assemblies';
import { insertGauge, insertTester } from '../../../src/storage/repositories/testers';
import { noticesForConnection, openNotices } from '../../../src/storage/repositories/notices';
import { recentEvents } from '../../../src/storage/repositories/events';

let register: Register;

function setUp(account: string, findings: string[], route = 'north'): string {
  const opened = openConnection(register, {
    accountNumber: account,
    premiseName: 'a premise',
    premiseAddress: 'somewhere',
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
  const id = opened.value.connectionId;
  recordSurvey(register, {
    connectionId: id,
    surveyedOn: '2022-01-10',
    surveyor: 'r. okafor',
    findingCodes: findings,
    accessGranted: true,
  });
  const fitted = installAssembly(register, {
    connectionId: id,
    scope: 'containment',
    assemblyClass: 'RP',
    modelId: 'WK-375',
    serialNumber: `${account}-1`,
    sizeInches: 2,
    installedOn: '2022-02-01',
    location: 'vault',
  });
  if (!fitted.ok) {
    throw new Error(fitted.error);
  }
  const filed = fileReport(register, {
    assemblyId: fitted.value.assemblyId,
    testerId: 'T-118',
    gaugeId: 'G-77',
    testedOn: '2023-03-01',
    filedOn: '2023-03-01',
    asFound: { check1Differential: 8.2, reliefOpening: 3.1 },
    repairMade: false,
  });
  if (!filed.ok) {
    throw new Error(filed.error);
  }
  return id;
}

beforeEach(() => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-07-16T09:00:00Z',
    policy: { purveyorName: 'north valley water' },
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
});

afterEach(() => {
  closeRegister(register);
});

describe('a quiet run', () => {
  it('writes nothing where nothing is due', () => {
    setUp('A-1', ['AUX_WELL']);
    const run = runNotices(register, { asOf: '2024-01-01' });
    expect(run.ok).toBe(true);
    if (!run.ok) {
      return;
    }
    expect(run.value.issued).toEqual([]);
    expect(run.value.considered).toBe(1);
  });

  it('skips a connection nobody has surveyed and says why', () => {
    openConnection(register, {
      accountNumber: 'A-9',
      premiseName: 'unwalked',
      premiseAddress: 'somewhere',
      premiseUseCode: 'OFFICE',
      serviceSizeInches: 1,
      fireService: false,
      purveyorMetered: true,
      connectedOn: '2020-01-01',
    });
    const run = runNotices(register, { asOf: '2024-07-16' });
    expect(run.ok && run.value.skipped[0]?.reason).toContain('never been surveyed');
  });
});

describe('a run with letters in it', () => {
  it('writes the rung the connection has reached', () => {
    const id = setUp('A-1', ['AUX_WELL']);
    const run = runNotices(register, { asOf: '2024-03-05' });
    expect(run.ok).toBe(true);
    if (!run.ok) {
      return;
    }
    expect(run.value.issued).toHaveLength(1);
    expect(run.value.issued[0]?.stage).toBe('first');
    expect(run.value.issued[0]?.noticeId).toBe('N-000001');
    expect(noticesForConnection(register.db, id)).toHaveLength(1);
  });

  it('writes the health ladder name onto the letter', () => {
    setUp('A-1', ['AUX_WELL']);
    const run = runNotices(register, { asOf: '2024-03-20' });
    expect(run.ok && run.value.issued[0]?.ladder).toBe('health hazard');
    expect(run.ok && run.value.issued[0]?.stage).toBe('second');
  });

  it('puts the shutoff words on the last rung and not before', () => {
    setUp('A-1', ['AUX_WELL']);
    const early = runNotices(register, { asOf: '2024-03-05' });
    expect(early.ok && early.value.issued[0]?.body).toContain('please arrange a test');
    const late = runNotices(register, { asOf: '2024-04-05' });
    expect(late.ok && late.value.issued[0]?.body).toContain('may now be shut off');
  });

  it('names the purveyor from the policy', () => {
    setUp('A-1', ['AUX_WELL']);
    const run = runNotices(register, { asOf: '2024-03-05' });
    expect(run.ok && run.value.issued[0]?.body).toContain('north valley water');
  });

  it('does not send the same rung twice', () => {
    setUp('A-1', ['AUX_WELL']);
    runNotices(register, { asOf: '2024-03-05' });
    const again = runNotices(register, { asOf: '2024-03-06' });
    expect(again.ok && again.value.issued).toEqual([]);
    expect(again.ok && again.value.skipped[0]?.reason).toContain('already gone out');
  });

  it('sends the next rung when the ladder moves', () => {
    setUp('A-1', ['AUX_WELL']);
    runNotices(register, { asOf: '2024-03-05' });
    const later = runNotices(register, { asOf: '2024-03-20' });
    expect(later.ok && later.value.issued[0]?.stage).toBe('second');
    expect(openNotices(register.db)).toHaveLength(2);
  });

  it('numbers the letters in one run without clashing', () => {
    setUp('A-1', ['AUX_WELL']);
    setUp('A-2', ['AUX_WELL']);
    const run = runNotices(register, { asOf: '2024-03-05' });
    expect(run.ok && run.value.issued.map((notice) => notice.noticeId)).toEqual([
      'N-000001',
      'N-000002',
    ]);
  });

  it('leaves a line on the trail for each letter', () => {
    setUp('A-1', ['AUX_WELL']);
    runNotices(register, { asOf: '2024-03-05' });
    const events = recentEvents(register.db, { kind: 'notice_issued' });
    expect(events).toHaveLength(1);
    expect(events[0]?.detail).toContain('first notice to A-1');
  });
});

describe('the shape of a run', () => {
  it('writes nothing at all on a dry run', () => {
    setUp('A-1', ['AUX_WELL']);
    const run = runNotices(register, { asOf: '2024-03-05', dryRun: true });
    expect(run.ok && run.value.issued).toHaveLength(1);
    expect(openNotices(register.db)).toEqual([]);
  });

  it('takes one route at a time', () => {
    setUp('A-1', ['AUX_WELL'], 'north');
    setUp('A-2', ['AUX_WELL'], 'south');
    const run = runNotices(register, { asOf: '2024-03-05', route: 'south' });
    expect(run.ok && run.value.considered).toBe(1);
    expect(run.ok && run.value.issued).toHaveLength(1);
  });

  it('describes itself in one line', () => {
    setUp('A-1', ['AUX_WELL']);
    setUp('A-2', ['AUX_WELL']);
    const run = runNotices(register, { asOf: '2024-03-05' });
    expect(run.ok && describeRun(run.value)).toBe('2 connections, 2 letters (2 first), 0 skipped');
  });
});

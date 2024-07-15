import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../../src/service/register';
import { openConnection, type NewConnection } from '../../../src/service/connections';
import { recordSurvey } from '../../../src/service/surveys';
import { installAssembly } from '../../../src/service/assemblies';
import { fileReport } from '../../../src/service/filing';
import { complianceFor, noticeRank, worstStanding } from '../../../src/service/compliance';
import { insertModel } from '../../../src/storage/repositories/assemblies';
import { insertGauge, insertTester } from '../../../src/storage/repositories/testers';
import { insertVariance } from '../../../src/storage/repositories/variances';

let register: Register;

function newConnection(overrides: Partial<NewConnection> = {}): string {
  const opened = openConnection(register, {
    accountNumber: `A-${Math.random().toString().slice(2, 8)}`,
    premiseName: 'a premise',
    premiseAddress: 'somewhere',
    premiseUseCode: 'INDUSTRIAL',
    serviceSizeInches: 2,
    fireService: false,
    purveyorMetered: true,
    connectedOn: '2018-01-01',
    ...overrides,
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  return opened.value.connectionId;
}

function setUp(findings: string[], useCode = 'INDUSTRIAL'): string {
  const id = newConnection({ premiseUseCode: useCode });
  const surveyed = recordSurvey(register, {
    connectionId: id,
    surveyedOn: '2022-01-10',
    surveyor: 'r. okafor',
    findingCodes: findings,
    accessGranted: true,
  });
  if (!surveyed.ok) {
    throw new Error(surveyed.error);
  }
  return id;
}

function fitRp(connectionId: string, serial: string, installedOn = '2022-02-01'): string {
  const fitted = installAssembly(register, {
    connectionId,
    scope: 'containment',
    assemblyClass: 'RP',
    modelId: 'WK-375',
    serialNumber: serial,
    sizeInches: 2,
    installedOn,
    location: 'vault',
  });
  if (!fitted.ok) {
    throw new Error(fitted.error);
  }
  return fitted.value.assemblyId;
}

function test(assemblyId: string, testedOn: string, pass = true): void {
  const filed = fileReport(register, {
    assemblyId,
    testerId: 'T-118',
    gaugeId: 'G-77',
    testedOn,
    filedOn: testedOn,
    asFound: pass
      ? { check1Differential: 8.2, reliefOpening: 3.1 }
      : { check1Differential: 1.1, reliefOpening: 3.1 },
    repairMade: false,
  });
  if (!filed.ok) {
    throw new Error(filed.error);
  }
}

beforeEach(() => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-07-15T09:00:00Z',
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

describe('a connection that is in order', () => {
  it('is compliant with the right class tested inside the year', () => {
    const id = setUp(['AUX_WELL']);
    const assembly = fitRp(id, '1');
    test(assembly, '2024-03-01');
    const status = complianceFor(register, id, '2024-07-15');
    expect(status.ok).toBe(true);
    if (!status.ok) {
      return;
    }
    expect(status.value.standing).toBe('compliant');
    expect(status.value.containment.due?.due).toBe('2025-03-01');
    expect(status.value.shutoffEligible).toBe(false);
  });

  it('runs the anniversary from the passing test, not the last visit', () => {
    const id = setUp(['AUX_WELL']);
    const assembly = fitRp(id, '2');
    test(assembly, '2023-03-01');
    test(assembly, '2024-01-15', false);
    const status = complianceFor(register, id, '2024-01-20');
    expect(status.ok && status.value.containment.due?.basis).toBe('repair');
  });
});

describe('a connection with nothing fitted', () => {
  it('is deficient at once where the hazard is a health one', () => {
    const id = setUp(['AUX_WELL']);
    const status = complianceFor(register, id, '2024-07-15');
    expect(status.ok).toBe(true);
    if (!status.ok) {
      return;
    }
    expect(status.value.standing).toBe('deficient');
    expect(status.value.urgency).toBe('immediate');
    expect(status.value.reasons[0]).toContain('containment');
  });

  it('is deficient without urgency where the hazard is pollutional', () => {
    const id = setUp([]);
    const status = complianceFor(register, id, '2024-07-15');
    expect(status.ok && status.value.standing).toBe('deficient');
    expect(status.ok && status.value.urgency).toBe('cycle');
  });

  it('has no due date at a point with no assembly', () => {
    const id = setUp(['AUX_WELL']);
    const status = complianceFor(register, id, '2024-07-15');
    expect(status.ok && status.value.containment.due).toBeUndefined();
  });
});

describe('a connection that is late', () => {
  it('is overdue once the anniversary has passed', () => {
    const id = setUp(['AUX_WELL']);
    const assembly = fitRp(id, '3');
    test(assembly, '2023-03-01');
    const status = complianceFor(register, id, '2024-03-02');
    expect(status.ok && status.value.standing).toBe('overdue');
    expect(status.ok && status.value.containment.delinquency?.stage).toBe('first');
  });

  it('climbs the health ladder to shutoff in thirty days', () => {
    const id = setUp(['AUX_WELL']);
    const assembly = fitRp(id, '4');
    test(assembly, '2023-03-01');
    const status = complianceFor(register, id, '2024-03-31');
    expect(status.ok && status.value.standing).toBe('shutoff_eligible');
    expect(status.ok && status.value.shutoffEligible).toBe(true);
  });

  it('takes longer to get there on a pollutional hazard', () => {
    const id = setUp(['FIRE_PLAIN']);
    const assembly = fitRp(id, '5');
    test(assembly, '2023-03-01');
    const early = complianceFor(register, id, '2024-03-31');
    expect(early.ok && early.value.standing).toBe('overdue');
    const later = complianceFor(register, id, '2024-04-30');
    expect(later.ok && later.value.standing).toBe('shutoff_eligible');
  });

  it('holds the ladder while an application is in front of the office', () => {
    const id = setUp(['FIRE_PLAIN']);
    const assembly = fitRp(id, '6');
    test(assembly, '2023-03-01');
    insertVariance(register.db, {
      varianceId: 'V-0001',
      connectionId: id,
      appliedOn: '2024-03-10',
      acceptedClass: 'DC',
      grantedAgainstDegree: 'nonhealth',
      conditions: [],
    });
    const status = complianceFor(register, id, '2024-04-30');
    expect(status.ok && status.value.containment.delinquency?.held).toBe(true);
    expect(status.ok && status.value.shutoffEligible).toBe(false);
  });

  it('does not hold it for a health hazard', () => {
    const id = setUp(['AUX_WELL']);
    const assembly = fitRp(id, '7');
    test(assembly, '2023-03-01');
    insertVariance(register.db, {
      varianceId: 'V-0002',
      connectionId: id,
      appliedOn: '2024-03-10',
      acceptedClass: 'DC',
      grantedAgainstDegree: 'health',
      conditions: [],
    });
    const status = complianceFor(register, id, '2024-03-31');
    expect(status.ok && status.value.shutoffEligible).toBe(true);
  });
});

describe('a failed test', () => {
  it('puts the assembly on the repair clock', () => {
    const id = setUp(['AUX_WELL']);
    const assembly = fitRp(id, '8');
    test(assembly, '2023-03-01');
    test(assembly, '2023-08-16', false);
    const status = complianceFor(register, id, '2023-08-20');
    expect(status.ok).toBe(true);
    if (!status.ok) {
      return;
    }
    expect(status.value.containment.due?.basis).toBe('repair');
    expect(status.value.containment.due?.due).toBe('2023-08-23');
    expect(status.value.standing).toBe('compliant');
  });

  it('goes overdue as soon as the repair window runs out', () => {
    const id = setUp(['AUX_WELL']);
    const assembly = fitRp(id, '9');
    test(assembly, '2023-08-16', false);
    const status = complianceFor(register, id, '2023-08-24');
    expect(status.ok && status.value.standing).toBe('overdue');
  });

  it('comes off the repair clock once a passing test lands', () => {
    const id = setUp(['AUX_WELL']);
    const assembly = fitRp(id, '10');
    test(assembly, '2023-08-16', false);
    test(assembly, '2023-08-21');
    const status = complianceFor(register, id, '2023-09-01');
    expect(status.ok && status.value.containment.due?.basis).toBe('anniversary');
    expect(status.ok && status.value.containment.due?.due).toBe('2024-08-21');
  });
});

describe('sorting a work list', () => {
  it('takes the worst standing of a set', () => {
    const first = setUp(['AUX_WELL']);
    const second = setUp([]);
    const firstAssembly = fitRp(first, '11');
    test(firstAssembly, '2024-03-01');
    const statuses = [complianceFor(register, first, '2024-07-15'), complianceFor(register, second, '2024-07-15')]
      .filter((entry): entry is Extract<typeof entry, { ok: true }> => entry.ok)
      .map((entry) => entry.value);
    expect(statuses).toHaveLength(2);
    expect(worstStanding(statuses)).toBe('deficient');
    expect(worstStanding([])).toBe('compliant');
  });

  it('ranks a connection by the highest rung it has reached', () => {
    const id = setUp(['AUX_WELL']);
    const assembly = fitRp(id, '12');
    test(assembly, '2023-03-01');
    const status = complianceFor(register, id, '2024-03-31');
    expect(status.ok && noticeRank(status.value)).toBe(4);
  });
});

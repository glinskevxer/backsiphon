/**
 * A program office set up the way the integration tests want one: an open
 * register, an approval list with something of each class on it, one certified
 * tester and one calibrated gauge.
 */

import { closeRegister, openRegister, type Register } from '../../src/service/register';
import { insertModel } from '../../src/storage/repositories/assemblies';
import { insertGauge, insertTester } from '../../src/storage/repositories/testers';
import { openConnection, type NewConnection } from '../../src/service/connections';
import { recordSurvey } from '../../src/service/surveys';
import { installAssembly, type InstallInput } from '../../src/service/assemblies';
import { fileReport, type FilingInput } from '../../src/service/filing';
import type { AssemblyClass } from '../../src/domain/assembly';

export const MODELS: ReadonlyArray<{ id: string; assemblyClass: AssemblyClass }> = [
  { id: 'WK-375', assemblyClass: 'RP' },
  { id: 'WK-350', assemblyClass: 'DC' },
  { id: 'HN-900DA', assemblyClass: 'DCDA' },
  { id: 'HN-900RA', assemblyClass: 'RPDA' },
  { id: 'CB-40P', assemblyClass: 'PVB' },
  { id: 'CB-40S', assemblyClass: 'SVB' },
];

export interface Office {
  readonly register: Register;
  close(): void;
}

/**
 * A counter rather than a random number. The random serial numbers this used
 * to hand out collided about one run in thirty once a test built three hundred
 * assemblies, and a suite that fails one run in thirty is worse than no suite.
 */
let sequence = 0;

function nextSuffix(): string {
  sequence += 1;
  return String(sequence).padStart(6, '0');
}

export function openOffice(now = '2024-01-02T09:00:00Z'): Office {
  sequence = 0;
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => now,
    policy: { purveyorName: 'north valley water' },
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  const register = opened.value;

  for (const model of MODELS) {
    insertModel(register.db, {
      modelId: model.id,
      maker: 'a maker',
      model: model.id,
      assemblyClass: model.assemblyClass,
      sizes: [0.75, 1, 2, 4, 6],
      listedOn: '2010-01-01',
      note: '',
    });
  }
  insertTester(register.db, {
    testerId: 'T-118',
    name: 'p. adeyemi',
    agency: 'state waterworks board',
    certificateNumber: 'BF-4471',
    issuedOn: '2015-05-01',
    expiresOn: '2030-04-30',
    endorsements: ['RP', 'RPDA', 'DC', 'DCDA', 'PVB', 'SVB'],
  });
  insertGauge(register.db, {
    gaugeId: 'G-77',
    testerId: 'T-118',
    maker: 'midwest',
    serialNumber: '845-C',
    calibratedOn: '2015-05-01',
    calibrationIntervalMonths: 240,
    accuracyPsid: 0.2,
  });

  return {
    register,
    close: (): void => {
      closeRegister(register);
    },
  };
}

export function open(office: Office, overrides: Partial<NewConnection> = {}): string {
  const opened = openConnection(office.register, {
    accountNumber: `A-${nextSuffix()}`,
    premiseName: 'a premise',
    premiseAddress: '14 forge road',
    premiseUseCode: 'INDUSTRIAL',
    serviceSizeInches: 2,
    fireService: false,
    purveyorMetered: true,
    connectedOn: '2015-01-01',
    ...overrides,
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  return opened.value.connectionId;
}

export function walk(
  office: Office,
  connectionId: string,
  on: string,
  findings: ReadonlyArray<string>,
  accessGranted = true,
): void {
  const recorded = recordSurvey(office.register, {
    connectionId,
    surveyedOn: on,
    surveyor: 'r. okafor',
    findingCodes: findings,
    accessGranted,
  });
  if (!recorded.ok) {
    throw new Error(recorded.error);
  }
}

export function fit(
  office: Office,
  input: Partial<InstallInput> & { connectionId: string },
): string {
  const fitted = installAssembly(office.register, {
    scope: 'containment',
    assemblyClass: 'RP',
    modelId: 'WK-375',
    serialNumber: `S-${nextSuffix()}`,
    sizeInches: 2,
    installedOn: '2015-02-01',
    location: 'meter vault',
    ...input,
  });
  if (!fitted.ok) {
    throw new Error(fitted.error);
  }
  return fitted.value.assemblyId;
}

export const PASSING_RP = { check1Differential: 8.2, reliefOpening: 3.1 };
export const FAILING_RP = { check1Differential: 1.4, reliefOpening: 3.1 };
export const PASSING_DC = { check1Differential: 2.4, check2Differential: 1.8 };

export function fileTest(
  office: Office,
  input: Partial<FilingInput> & { assemblyId: string; testedOn: string },
): ReturnType<typeof fileReport> {
  return fileReport(office.register, {
    testerId: 'T-118',
    gaugeId: 'G-77',
    filedOn: input.testedOn,
    asFound: PASSING_RP,
    repairMade: false,
    ...input,
  });
}

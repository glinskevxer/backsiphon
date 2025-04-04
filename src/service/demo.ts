/**
 * A small district, made up, for training a new clerk on.
 *
 * It is deliberately not random. The same command always builds the same
 * eleven connections in the same state, so a trainer can say "look at SC-00004
 * and tell me why it is deficient" and it will be true next week as well.
 */

import type { CivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import type { AssemblyClass } from '../domain/assembly';
import type { ProtectionScope } from '../domain/deficiency';
import { insertModel, listModels } from '../storage/repositories/assemblies';
import { insertGauge, insertTester, listTesters } from '../storage/repositories/testers';
import { listConnections } from '../storage/repositories/connections';
import { openConnection } from './connections';
import { recordSurvey } from './surveys';
import { installAssembly } from './assemblies';
import { fileReport } from './filing';
import { runNotices } from './notices';
import type { Register } from './register';

interface DemoConnection {
  readonly account: string;
  readonly name: string;
  readonly address: string;
  readonly use: string;
  readonly size: number;
  readonly route: string;
  readonly findings: ReadonlyArray<string>;
  readonly fire?: boolean;
  readonly unmetered?: boolean;
  readonly fitted?: { class: AssemblyClass; model: string; scope?: ProtectionScope };
  readonly lastTest?: { on: CivilDate; passing: boolean };
}

const MODELS = [
  { id: 'WK-375', maker: 'watkin', model: '375 series', assemblyClass: 'RP' as const },
  { id: 'WK-350', maker: 'watkin', model: '350 series', assemblyClass: 'DC' as const },
  { id: 'HN-900DA', maker: 'hanmore', model: '900 detector', assemblyClass: 'DCDA' as const },
  {
    id: 'HN-900RA',
    maker: 'hanmore',
    model: '900 relief detector',
    assemblyClass: 'RPDA' as const,
  },
  { id: 'CB-40P', maker: 'cobern', model: '40 breaker', assemblyClass: 'PVB' as const },
  { id: 'CB-40S', maker: 'cobern', model: '40 spill resistant', assemblyClass: 'SVB' as const },
];

const DISTRICT: readonly DemoConnection[] = [
  {
    account: 'A-1001',
    name: 'kerrigan plating',
    address: '14 forge road',
    use: 'PLATING',
    size: 2,
    route: 'north',
    findings: ['PLATING', 'AUX_WELL'],
    fitted: { class: 'RP', model: 'WK-375' },
    lastTest: { on: '2024-03-04', passing: true },
  },
  {
    account: 'A-1002',
    name: 'harbour cannery',
    address: '2 quay street',
    use: 'FOOD_PROC',
    size: 4,
    route: 'south',
    findings: ['CANNERY'],
    fitted: { class: 'RP', model: 'WK-375' },
    lastTest: { on: '2023-11-02', passing: true },
  },
  {
    account: 'A-1003',
    name: 'brightwater offices',
    address: '9 canal street',
    use: 'OFFICE',
    size: 1,
    route: 'north',
    findings: [],
  },
  {
    account: 'A-1004',
    name: 'saint anne hospital',
    address: '1 hill road',
    use: 'HOSPITAL',
    size: 6,
    route: 'central',
    findings: ['LAB_BENCH', 'CHEM_BOILER'],
    fitted: { class: 'DC', model: 'WK-350' },
  },
  {
    account: 'A-1005',
    name: 'valley storage',
    address: '40 dock road',
    use: 'WAREHOUSE',
    size: 6,
    route: 'south',
    findings: ['FIRE_PLAIN'],
    fire: true,
    unmetered: true,
    fitted: { class: 'DCDA', model: 'HN-900DA' },
    lastTest: { on: '2024-05-20', passing: true },
  },
  {
    account: 'A-1006',
    name: 'greenway nursery',
    address: '77 mill lane',
    use: 'AGRI',
    size: 2,
    route: 'east',
    findings: ['IRRIG_CHEM'],
    fitted: { class: 'RP', model: 'WK-375' },
    lastTest: { on: '2024-01-15', passing: false },
  },
  {
    account: 'A-1007',
    name: 'the old mortuary',
    address: '5 chapel street',
    use: 'MORTUARY',
    size: 1,
    route: 'central',
    findings: ['MORTUARY'],
  },
  {
    account: 'A-1008',
    name: 'riverside marina',
    address: 'pier 3',
    use: 'MARINA',
    size: 2,
    route: 'east',
    findings: ['PIER_TIDAL'],
    fitted: { class: 'RP', model: 'WK-375' },
    lastTest: { on: '2022-08-01', passing: true },
  },
  {
    account: 'A-1009',
    name: 'apex car wash',
    address: '12 forge road',
    use: 'CAR_WASH',
    size: 2,
    route: 'north',
    findings: ['CAR_WASH'],
    fitted: { class: 'DC', model: 'WK-350' },
    lastTest: { on: '2024-04-04', passing: true },
  },
  {
    account: 'A-1010',
    name: 'north valley reclamation',
    address: 'works road',
    use: 'WWTP',
    size: 4,
    route: 'central',
    findings: ['SEWAGE_PUMP'],
  },
  {
    account: 'A-1011',
    name: 'lark photographic',
    address: '3 arcade way',
    use: 'RETAIL',
    size: 1,
    route: 'north',
    findings: ['PHOTO_LAB'],
    fitted: { class: 'SVB', model: 'CB-40S', scope: 'isolation' },
  },
];

export interface DemoOutcome {
  readonly connections: number;
  readonly assemblies: number;
  readonly reports: number;
  readonly notices: number;
}

/** Fill an empty register. It refuses to touch one that has anything in it. */
export function loadDemoDistrict(register: Register, asOf: CivilDate): Result<DemoOutcome, string> {
  if (listConnections(register.db).length > 0) {
    return err('this register already has connections on it, the demo only fills an empty one');
  }

  if (listModels(register.db).length === 0) {
    for (const model of MODELS) {
      insertModel(register.db, {
        modelId: model.id,
        maker: model.maker,
        model: model.model,
        assemblyClass: model.assemblyClass,
        sizes: [0.75, 1, 1.5, 2, 4, 6, 8],
        listedOn: '2012-01-01',
        note: 'listed for the demo district',
      });
    }
  }
  if (listTesters(register.db).length === 0) {
    insertTester(register.db, {
      testerId: 'T-118',
      name: 'p. adeyemi',
      agency: 'state waterworks board',
      certificateNumber: 'BF-4471',
      issuedOn: '2019-05-01',
      expiresOn: '2029-04-30',
      endorsements: ['RP', 'RPDA', 'DC', 'DCDA', 'PVB', 'SVB'],
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
  }

  let assemblies = 0;
  let reports = 0;

  for (const entry of DISTRICT) {
    const opened = openConnection(register, {
      accountNumber: entry.account,
      premiseName: entry.name,
      premiseAddress: entry.address,
      premiseUseCode: entry.use,
      serviceSizeInches: entry.size,
      fireService: entry.fire === true,
      purveyorMetered: entry.unmetered !== true,
      connectedOn: '2016-04-01',
      route: entry.route,
    });
    if (!opened.ok) {
      return err(`${entry.account}: ${opened.error}`);
    }
    const connectionId = opened.value.connectionId;

    const surveyed = recordSurvey(register, {
      connectionId,
      surveyedOn: '2023-09-12',
      surveyor: 'r. okafor',
      findingCodes: entry.findings,
      accessGranted: entry.use !== 'WWTP',
    });
    if (!surveyed.ok) {
      return err(`${entry.account}: ${surveyed.error}`);
    }

    if (entry.fitted === undefined) {
      continue;
    }
    const fitted = installAssembly(register, {
      connectionId,
      scope: entry.fitted.scope ?? 'containment',
      assemblyClass: entry.fitted.class,
      modelId: entry.fitted.model,
      serialNumber: `${entry.account}-1`,
      sizeInches: entry.size,
      installedOn: '2019-06-03',
      location: 'meter vault',
    });
    if (!fitted.ok) {
      return err(`${entry.account}: ${fitted.error}`);
    }
    assemblies += 1;

    if (entry.lastTest === undefined) {
      continue;
    }
    const filed = fileReport(register, {
      assemblyId: fitted.value.assemblyId,
      testerId: 'T-118',
      gaugeId: 'G-77',
      testedOn: entry.lastTest.on,
      filedOn: entry.lastTest.on,
      asFound: readingsFor(entry.fitted.class, entry.lastTest.passing),
      repairMade: false,
    });
    if (!filed.ok) {
      return err(`${entry.account}: ${filed.error}`);
    }
    reports += 1;
  }

  const letters = runNotices(register, { asOf });
  return ok({
    connections: DISTRICT.length,
    assemblies,
    reports,
    notices: letters.ok ? letters.value.issued.length : 0,
  });
}

function readingsFor(
  assemblyClass: AssemblyClass,
  passing: boolean,
): Record<string, number | boolean> {
  if (assemblyClass === 'RP' || assemblyClass === 'RPDA') {
    const base = passing
      ? { check1Differential: 8.4, reliefOpening: 3.2 }
      : { check1Differential: 3.1, reliefOpening: 3.2 };
    return assemblyClass === 'RPDA' ? { ...base, bypassTight: true } : base;
  }
  if (assemblyClass === 'DC' || assemblyClass === 'DCDA') {
    const base = passing
      ? { check1Differential: 2.6, check2Differential: 1.9 }
      : { check1Differential: 0.4, check2Differential: 1.9 };
    return assemblyClass === 'DCDA' ? { ...base, bypassTight: true } : base;
  }
  const base = passing
    ? { airInletOpening: 2.4, check1Differential: 3.6 }
    : { airInletOpening: 0.4, check1Differential: 3.6 };
  return assemblyClass === 'SVB' ? { ...base, ventTight: passing } : base;
}

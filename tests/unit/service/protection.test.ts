import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../../src/service/register';
import { openConnection, type NewConnection } from '../../../src/service/connections';
import { recordSurvey } from '../../../src/service/surveys';
import { installAssembly } from '../../../src/service/assemblies';
import { isCompliant, protectionStatus } from '../../../src/service/protection';
import { insertModel } from '../../../src/storage/repositories/assemblies';
import { grantVariance, insertVariance } from '../../../src/storage/repositories/variances';

let register: Register;

const MODELS = [
  { modelId: 'WK-375', assemblyClass: 'RP' as const, sizes: [1, 2, 4] },
  { modelId: 'WK-350', assemblyClass: 'DC' as const, sizes: [1, 2, 4] },
  { modelId: 'HN-900DA', assemblyClass: 'DCDA' as const, sizes: [4, 6] },
  { modelId: 'CB-40S', assemblyClass: 'SVB' as const, sizes: [0.75, 1] },
  { modelId: 'CB-40P', assemblyClass: 'PVB' as const, sizes: [0.75, 1] },
];

function connection(overrides: Partial<NewConnection> = {}): string {
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

function survey(connectionId: string, findingCodes: string[], accessGranted = true): void {
  const recorded = recordSurvey(register, {
    connectionId,
    surveyedOn: '2023-05-02',
    surveyor: 'r. okafor',
    findingCodes,
    accessGranted,
  });
  if (!recorded.ok) {
    throw new Error(recorded.error);
  }
}

function status(connectionId: string, asOf = '2024-06-18'): ReturnType<typeof protectionStatus> {
  return protectionStatus(register, connectionId, asOf);
}

beforeEach(() => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-06-18T09:00:00Z',
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
  for (const model of MODELS) {
    insertModel(register.db, {
      modelId: model.modelId,
      maker: 'a maker',
      model: model.modelId,
      assemblyClass: model.assemblyClass,
      sizes: model.sizes,
      listedOn: '2010-01-01',
      note: '',
    });
  }
});

afterEach(() => {
  closeRegister(register);
});

describe('reading the whole position', () => {
  it('refuses a connection nobody has surveyed', () => {
    const result = status(connection());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('never been surveyed');
    }
  });

  it('refuses a connection nobody has', () => {
    expect(status('SC-00404').ok).toBe(false);
  });

  it('reads the survey as at the day asked about', () => {
    const id = connection();
    survey(id, ['AUX_WELL']);
    expect(status(id, '2023-01-01').ok).toBe(false);
    const later = status(id, '2023-05-02');
    expect(later.ok && later.value.survey.surveyedOn).toBe('2023-05-02');
  });
});

describe('the containment point', () => {
  it('asks for a double check on a pollutional premise', () => {
    const id = connection();
    survey(id, []);
    const result = status(id);
    expect(result.ok && result.value.containment.requiredClass).toBe('DC');
    expect(result.ok && result.value.containment.deficiency.kind).toBe('missing');
    expect(result.ok && result.value.urgency).toBe('cycle');
  });

  it('asks for a reduced pressure assembly once a well turns up', () => {
    const id = connection();
    survey(id, ['AUX_WELL']);
    const result = status(id);
    expect(result.ok && result.value.containment.requiredClass).toBe('RP');
    expect(result.ok && result.value.urgency).toBe('immediate');
  });

  it('is satisfied by the assembly in the ground', () => {
    const id = connection();
    survey(id, ['AUX_WELL']);
    installAssembly(register, {
      connectionId: id,
      scope: 'containment',
      assemblyClass: 'RP',
      modelId: 'WK-375',
      serialNumber: '1',
      sizeInches: 2,
      installedOn: '2023-06-01',
      location: 'vault',
    });
    const result = status(id);
    expect(result.ok && result.value.containment.deficiency.kind).toBe('none');
    expect(result.ok && isCompliant(result.value)).toBe(true);
  });

  it('names what a wrong class is short of', () => {
    const id = connection();
    survey(id, ['AUX_WELL']);
    installAssembly(register, {
      connectionId: id,
      scope: 'containment',
      assemblyClass: 'DC',
      modelId: 'WK-350',
      serialNumber: '2',
      sizeInches: 2,
      installedOn: '2023-06-01',
      location: 'vault',
    });
    const result = status(id);
    expect(result.ok && result.value.containment.deficiency.kind).toBe('wrong_class');
    expect(result.ok && result.value.containment.deficiency.missing).toEqual(['stopsHealthHazard']);
  });

  it('asks for a detector assembly on an unmetered fire line', () => {
    const id = connection({ fireService: true, purveyorMetered: false, serviceSizeInches: 6 });
    survey(id, ['FIRE_PLAIN']);
    const result = status(id);
    expect(result.ok && result.value.containment.requiredClass).toBe('DCDA');
  });

  it('does not read an assembly that was taken out before the day', () => {
    const id = connection();
    survey(id, ['AUX_WELL']);
    installAssembly(register, {
      connectionId: id,
      scope: 'containment',
      assemblyClass: 'RP',
      modelId: 'WK-375',
      serialNumber: '3',
      sizeInches: 2,
      installedOn: '2023-06-01',
      location: 'vault',
    });
    expect(status(id, '2023-05-31').ok && status(id, '2023-05-31')).toBeDefined();
    const before = status(id, '2023-05-31');
    expect(before.ok && before.value.containment.deficiency.kind).toBe('missing');
  });
});

describe('the isolation point', () => {
  it('reads the riser geometry off the connection', () => {
    const id = connection({ outletElevationInches: 20, indoorRiser: false, downstreamShutoff: true });
    survey(id, ['LAB_BENCH']);
    const result = status(id);
    expect(result.ok && result.value.isolation.requiredClass).toBe('PVB');
  });

  it('asks for the spill resistant one on an indoor riser', () => {
    const id = connection({ outletElevationInches: 20, indoorRiser: true });
    survey(id, ['LAB_BENCH']);
    const result = status(id);
    expect(result.ok && result.value.isolation.requiredClass).toBe('SVB');
  });

  it('falls back to a reduced pressure assembly on a low riser', () => {
    const id = connection({ outletElevationInches: 4 });
    survey(id, ['LAB_BENCH']);
    const result = status(id);
    expect(result.ok && result.value.isolation.requiredClass).toBe('RP');
  });

  it('keeps the two points apart', () => {
    const id = connection({ outletElevationInches: 20 });
    survey(id, ['PIER_TIDAL', 'LAB_BENCH']);
    const result = status(id);
    expect(result.ok && result.value.containment.requiredClass).toBe('RP');
    expect(result.ok && result.value.isolation.requiredClass).toBe('PVB');
  });

  it('lets a backpressure finding at the meter rule a breaker out inside', () => {
    const id = connection({ outletElevationInches: 20 });
    survey(id, ['AUX_WELL', 'LAB_BENCH']);
    const result = status(id);
    expect(result.ok && result.value.assessment.backpressure).toBe(true);
    expect(result.ok && result.value.isolation.requiredClass).toBe('RP');
  });
});

describe('a variance in the middle of it', () => {
  function grant(connectionId: string, acceptedClass: 'DC' | 'PVB', degree: 'health' | 'nonhealth'): void {
    insertVariance(register.db, {
      varianceId: 'V-0001',
      connectionId,
      appliedOn: '2023-07-01',
      acceptedClass,
      grantedAgainstDegree: degree,
      conditions: ['no chemical feed without notice'],
    });
    const granted = grantVariance(register.db, 'V-0001', {
      decidedOn: '2023-07-20',
      effectiveFrom: '2023-08-01',
      expiresOn: '2025-07-31',
      conditions: ['no chemical feed without notice'],
    });
    if (!granted.ok) {
      throw new Error(granted.error);
    }
  }

  it('rewrites the class the point is measured against', () => {
    const id = connection();
    survey(id, ['AUX_WELL']);
    grant(id, 'DC', 'health');
    installAssembly(register, {
      connectionId: id,
      scope: 'containment',
      assemblyClass: 'DC',
      modelId: 'WK-350',
      serialNumber: '4',
      sizeInches: 2,
      installedOn: '2023-09-01',
      location: 'vault',
    });
    const result = status(id);
    expect(result.ok && result.value.containment.requiredClass).toBe('RP');
    expect(result.ok && result.value.containment.effectiveClass).toBe('DC');
    expect(result.ok && result.value.containment.deficiency.kind).toBe('none');
    expect(result.ok && result.value.containment.varianceId).toBe('V-0001');
  });

  it('does not reach a point before it takes effect', () => {
    const id = connection();
    survey(id, ['AUX_WELL']);
    grant(id, 'DC', 'health');
    const before = status(id, '2023-07-15');
    expect(before.ok && before.value.containment.effectiveClass).toBe('RP');
  });

  it('falls away once a survey finds the premise worse than it was', () => {
    const id = connection();
    survey(id, ['IRRIG_PLAIN']);
    grant(id, 'DC', 'nonhealth');
    const worse = recordSurvey(register, {
      connectionId: id,
      surveyedOn: '2024-01-10',
      surveyor: 'r. okafor',
      findingCodes: ['AUX_WELL'],
      accessGranted: true,
    });
    expect(worse.ok).toBe(true);
    const result = status(id);
    expect(result.ok && result.value.containment.effectiveClass).toBe('RP');
    expect(result.ok && result.value.containment.varianceStatus).toBe('void_degree_raised');
  });
});

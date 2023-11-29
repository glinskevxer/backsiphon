import { describe, expect, it } from 'vitest';

import {
  baseClassForDegree,
  containmentRequirement,
  detectorVariant,
  requiredClassOf,
  type ServiceFacts,
} from '../../../src/domain/requirement';
import { assess, type HazardAssessment, type SurveyRecord } from '../../../src/domain/survey';

function assessment(overrides: Partial<SurveyRecord> = {}): HazardAssessment {
  const result = assess({
    connectionId: 'SC-2200',
    premiseUseCode: 'INDUSTRIAL',
    surveyedOn: '2024-04-10',
    surveyor: 'j. mbeki',
    findingCodes: [],
    accessGranted: true,
    ...overrides,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

const domestic: ServiceFacts = { fireService: false, purveyorMetered: true, serviceSizeInches: 2 };
const unmeteredFire: ServiceFacts = {
  fireService: true,
  purveyorMetered: false,
  serviceSizeInches: 6,
};
const meteredFire: ServiceFacts = { fireService: true, purveyorMetered: true, serviceSizeInches: 6 };

describe('the pieces the rule is built from', () => {
  it('maps a degree onto a mechanical class', () => {
    expect(baseClassForDegree('health')).toBe('RP');
    expect(baseClassForDegree('nonhealth')).toBe('DC');
    expect(baseClassForDegree('none')).toBeUndefined();
  });

  it('knows the detector variants and leaves the others alone', () => {
    expect(detectorVariant('RP')).toBe('RPDA');
    expect(detectorVariant('DC')).toBe('DCDA');
    expect(detectorVariant('AG')).toBe('AG');
    expect(detectorVariant('PVB')).toBe('PVB');
  });
});

describe('containment', () => {
  it('requires nothing where the connection reaches no degree at all', () => {
    const required = containmentRequirement(assessment({ premiseUseCode: 'OFFICE' }), domestic);
    expect(required.kind).toBe('none');
    expect(requiredClassOf(required)).toBeUndefined();
    expect(required.reasons[0]).toContain('pollutional');
  });

  it('requires a double check for a pollutional hazard', () => {
    const required = containmentRequirement(assessment(), domestic);
    expect(requiredClassOf(required)).toBe('DC');
  });

  it('requires a reduced pressure assembly for a health hazard', () => {
    const required = containmentRequirement(assessment({ findingCodes: ['AUX_WELL'] }), domestic);
    expect(requiredClassOf(required)).toBe('RP');
    expect(required.reasons[0]).toContain('AUX_WELL');
  });

  it('requires an air gap where a finding will not take an assembly', () => {
    const required = containmentRequirement(assessment({ findingCodes: ['RECLAIMED'] }), domestic);
    expect(requiredClassOf(required)).toBe('AG');
    expect(required.reasons).toHaveLength(1);
  });

  it('names the use category when that is what set the degree', () => {
    const required = containmentRequirement(assessment({ premiseUseCode: 'LAB' }), domestic);
    expect(requiredClassOf(required)).toBe('RP');
    expect(required.reasons[0]).toContain('use:LAB');
  });
});

describe('the detector axis', () => {
  it('turns the class into its detector variant on an unmetered fire line', () => {
    const pollutional = containmentRequirement(
      assessment({ findingCodes: ['FIRE_PLAIN'] }),
      unmeteredFire,
    );
    expect(requiredClassOf(pollutional)).toBe('DCDA');

    const health = containmentRequirement(
      assessment({ findingCodes: ['FIRE_ANTIFREEZE'] }),
      unmeteredFire,
    );
    expect(requiredClassOf(health)).toBe('RPDA');
  });

  it('leaves the class alone once the purveyor meters the line', () => {
    const required = containmentRequirement(assessment({ findingCodes: ['FIRE_PLAIN'] }), meteredFire);
    expect(requiredClassOf(required)).toBe('DC');
    expect(required.reasons).toHaveLength(1);
  });

  it('leaves a domestic service alone whatever the metering says', () => {
    const required = containmentRequirement(assessment({ findingCodes: ['FIRE_PLAIN'] }), {
      fireService: false,
      purveyorMetered: false,
      serviceSizeInches: 2,
    });
    expect(requiredClassOf(required)).toBe('DC');
  });

  it('does not let the fire line rule reach past an air gap', () => {
    const required = containmentRequirement(
      assessment({ findingCodes: ['RECLAIMED', 'FIRE_ANTIFREEZE'] }),
      unmeteredFire,
    );
    expect(requiredClassOf(required)).toBe('AG');
  });

  it('requires a detector assembly on a refused survey behind an unmetered line', () => {
    const required = containmentRequirement(assessment({ accessGranted: false }), unmeteredFire);
    expect(requiredClassOf(required)).toBe('RPDA');
    expect(required.reasons[0]).toContain('access:refused');
  });
});

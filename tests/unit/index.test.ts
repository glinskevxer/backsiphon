import { describe, expect, it } from 'vitest';

import * as register from '../../src/index';

describe('the public surface', () => {
  it('exports the pieces the command line needs', () => {
    for (const name of [
      'assess',
      'containmentRequirement',
      'isolationRequirement',
      'compareToRequirement',
      'satisfies',
      'findingByCode',
      'premiseUseByCode',
    ]) {
      expect(typeof (register as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('exports the two catalogues as arrays', () => {
    expect(Array.isArray(register.HAZARD_FINDINGS)).toBe(true);
    expect(Array.isArray(register.PREMISE_USES)).toBe(true);
    expect(Array.isArray(register.ASSEMBLY_CLASSES)).toBe(true);
  });

  it('carries a survey through to a requirement without touching a private module', () => {
    const assessed = register.assess({
      connectionId: 'SC-3100',
      premiseUseCode: 'CAR_WASH',
      surveyedOn: '2024-01-08',
      surveyor: 'a. lindqvist',
      findingCodes: ['CAR_WASH'],
      accessGranted: true,
    });
    expect(assessed.ok).toBe(true);
    if (!assessed.ok) {
      return;
    }
    const required = register.containmentRequirement(assessed.value, {
      fireService: false,
      purveyorMetered: true,
      serviceSizeInches: 2,
    });
    expect(register.requiredClassOf(required)).toBe('RP');
  });

  it('does not export anything that is only used inside the domain', () => {
    expect((register as Record<string, unknown>)['driversOf']).toBeUndefined();
    expect((register as Record<string, unknown>)['urgencyFor']).toBeUndefined();
  });
});

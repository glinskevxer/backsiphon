import { describe, expect, it } from 'vitest';

import {
  acceptableSubstitutes,
  allowedInScope,
  assemblyClassByCode,
  ASSEMBLY_CLASSES,
  isTestable,
  missingCapabilities,
  satisfies,
  specOf,
} from '../../../src/domain/assembly';

describe('the class table', () => {
  it('has no duplicate codes and a note on every row', () => {
    const codes = ASSEMBLY_CLASSES.map((spec) => spec.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const spec of ASSEMBLY_CLASSES) {
      expect(spec.note.length).toBeGreaterThan(10);
      expect(spec.allowedScopes.length).toBeGreaterThan(0);
    }
  });

  it('looks a class up and refuses one that is not ours', () => {
    expect(assemblyClassByCode('RP').ok).toBe(true);
    expect(assemblyClassByCode('rp').ok).toBe(false);
    expect(assemblyClassByCode('RPZ').ok).toBe(false);
  });

  it('throws only for a code that is not in the union at all', () => {
    expect(specOf('DCDA').label).toContain('detector');
  });

  it('keeps the two untestable classes untestable', () => {
    expect(isTestable('AG')).toBe(false);
    expect(isTestable('AVB')).toBe(false);
    expect(isTestable('RP')).toBe(true);
    expect(isTestable('PVB')).toBe(true);
  });

  it('keeps vacuum breakers out of the containment scope', () => {
    expect(allowedInScope('PVB', 'containment')).toBe(false);
    expect(allowedInScope('PVB', 'isolation')).toBe(true);
    expect(allowedInScope('RPDA', 'isolation')).toBe(false);
    expect(allowedInScope('RP', 'containment')).toBe(true);
  });
});

describe('substitution', () => {
  it('lets a class stand in for itself', () => {
    for (const spec of ASSEMBLY_CLASSES) {
      expect(satisfies(spec.code, spec.code)).toBe(true);
    }
  });

  it('accepts an air gap for anything', () => {
    for (const spec of ASSEMBLY_CLASSES) {
      expect(satisfies('AG', spec.code)).toBe(true);
    }
  });

  it('accepts nothing but an air gap where one is required', () => {
    expect(acceptableSubstitutes('AG')).toEqual(['AG']);
  });

  it('will not take a double check against a health hazard', () => {
    expect(satisfies('DC', 'RP')).toBe(false);
    expect(missingCapabilities('DC', 'RP')).toEqual(['stopsHealthHazard']);
  });

  it('will not take a vacuum breaker where backpressure is possible', () => {
    expect(satisfies('PVB', 'RP')).toBe(false);
    expect(missingCapabilities('PVB', 'RP')).toEqual(['stopsBackpressure']);
    expect(satisfies('PVB', 'DC')).toBe(false);
  });

  it('will not take a double check where a vacuum breaker was required', () => {
    expect(satisfies('DC', 'PVB')).toBe(false);
    expect(missingCapabilities('DC', 'PVB')).toEqual(['stopsHealthHazard']);
  });

  it('takes an RP where a double check was required', () => {
    expect(satisfies('RP', 'DC')).toBe(true);
    expect(missingCapabilities('RP', 'DC')).toEqual([]);
  });

  it('will not take an RP where the requirement was written for an indoor riser', () => {
    expect(satisfies('RP', 'SVB')).toBe(false);
    expect(missingCapabilities('RP', 'SVB')).toEqual(['spillResistant']);
    expect(acceptableSubstitutes('SVB')).toEqual(['AG', 'SVB']);
  });

  it('takes a detector assembly where a plain one was required', () => {
    expect(satisfies('DCDA', 'DC')).toBe(true);
    expect(satisfies('RPDA', 'RP')).toBe(true);
  });

  it('will not take a plain assembly where a detector was required', () => {
    expect(satisfies('DC', 'DCDA')).toBe(false);
    expect(missingCapabilities('DC', 'DCDA')).toEqual(['detector']);
    expect(satisfies('RP', 'RPDA')).toBe(false);
  });

  it('will not take a spilling vacuum breaker where a spill resistant one was required', () => {
    expect(satisfies('PVB', 'SVB')).toBe(false);
    expect(missingCapabilities('PVB', 'SVB')).toEqual(['spillResistant']);
    expect(satisfies('SVB', 'PVB')).toBe(true);
  });

  it('will not take an atmospheric breaker under standing pressure', () => {
    expect(satisfies('AVB', 'PVB')).toBe(false);
    expect(missingCapabilities('AVB', 'PVB')).toEqual(['continuousPressure']);
  });

  it('lists the substitutes for the common requirements', () => {
    expect(acceptableSubstitutes('DC')).toEqual(['AG', 'RP', 'RPDA', 'DC', 'DCDA']);
    expect(acceptableSubstitutes('RP')).toEqual(['AG', 'RP', 'RPDA']);
    expect(acceptableSubstitutes('PVB')).toEqual(['AG', 'RP', 'RPDA', 'PVB', 'SVB']);
    expect(acceptableSubstitutes('DCDA')).toEqual(['AG', 'RPDA', 'DCDA']);
  });

  it('reports nothing missing when the substitution is good', () => {
    expect(missingCapabilities('RPDA', 'DCDA')).toEqual([]);
    expect(missingCapabilities('AG', 'AG')).toEqual([]);
  });
});

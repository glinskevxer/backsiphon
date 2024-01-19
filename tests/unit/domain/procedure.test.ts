import { describe, expect, it } from 'vitest';

import {
  hasProcedure,
  minimumFor,
  MIN_AIR_GAP_INCHES,
  procedureFor,
  requiredReadingKeys,
  stepByKey,
  type TestProcedure,
} from '../../../src/domain/procedure';

function procedure(assemblyClass: Parameters<typeof procedureFor>[0]): TestProcedure {
  const result = procedureFor(assemblyClass);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

describe('which procedure applies', () => {
  it('has one for every testable class', () => {
    for (const assemblyClass of ['DC', 'DCDA', 'RP', 'RPDA', 'PVB', 'SVB'] as const) {
      expect(hasProcedure(assemblyClass)).toBe(true);
    }
  });

  it('has one for an air gap, which is measured rather than gauged', () => {
    expect(requiredReadingKeys('AG')).toEqual(['separationInches']);
  });

  it('has none at all for an atmospheric vacuum breaker', () => {
    expect(hasProcedure('AVB')).toBe(false);
    expect(procedureFor('AVB').ok).toBe(false);
    expect(requiredReadingKeys('AVB')).toEqual([]);
  });
});

describe('the steps each procedure asks for', () => {
  it('reads both checks on a double check', () => {
    expect(requiredReadingKeys('DC')).toEqual(['check1Differential', 'check2Differential']);
  });

  it('adds the bypass on a detector assembly', () => {
    expect(requiredReadingKeys('DCDA')).toEqual([
      'check1Differential',
      'check2Differential',
      'bypassTight',
    ]);
    expect(requiredReadingKeys('RPDA')).toContain('bypassTight');
  });

  it('reads the relief opening rather than a second check on a reduced pressure assembly', () => {
    expect(requiredReadingKeys('RP')).toEqual(['check1Differential', 'reliefOpening']);
  });

  it('adds the vent to a spill resistant breaker', () => {
    expect(requiredReadingKeys('SVB')).toEqual([
      'airInletOpening',
      'check1Differential',
      'ventTight',
    ]);
    expect(requiredReadingKeys('PVB')).not.toContain('ventTight');
  });
});

describe('the thresholds', () => {
  it('holds a double check to one psid on each check', () => {
    for (const step of procedure('DC').steps) {
      expect(minimumFor(step, 2)).toBe(1);
    }
  });

  it('holds the first check of a reduced pressure assembly to five', () => {
    const step = stepByKey('RP', 'check1Differential');
    expect(step.ok).toBe(true);
    if (step.ok) {
      expect(minimumFor(step.value, 2)).toBe(5);
    }
  });

  it('holds the relief valve to two', () => {
    const step = stepByKey('RP', 'reliefOpening');
    expect(step.ok && minimumFor(step.value, 2)).toBe(2);
  });

  it('carries the buffer rule only on the reduced pressure procedures', () => {
    expect(procedure('RP').bufferRule?.marginPsid).toBe(3);
    expect(procedure('RPDA').bufferRule?.higher).toBe('check1Differential');
    expect(procedure('DC').bufferRule).toBeUndefined();
    expect(procedure('PVB').bufferRule).toBeUndefined();
  });

  it('gives a tightness step no numeric minimum', () => {
    const step = stepByKey('SVB', 'ventTight');
    expect(step.ok).toBe(true);
    if (step.ok) {
      expect(minimumFor(step.value, 1)).toBeUndefined();
    }
  });

  it('works an air gap out from the pipe size', () => {
    const step = stepByKey('AG', 'separationInches');
    expect(step.ok).toBe(true);
    if (!step.ok) {
      return;
    }
    expect(minimumFor(step.value, 3)).toBe(6);
    expect(minimumFor(step.value, 0.5)).toBe(MIN_AIR_GAP_INCHES);
    expect(minimumFor(step.value, 1)).toBe(2);
  });

  it('will not find a step that belongs to another class', () => {
    expect(stepByKey('DC', 'reliefOpening').ok).toBe(false);
    expect(stepByKey('RP', 'check2Differential').ok).toBe(false);
    const missing = stepByKey('PVB', 'bypassTight');
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error).toContain('bypassTight');
    }
  });
});

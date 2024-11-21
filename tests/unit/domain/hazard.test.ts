import { describe, expect, it } from 'vitest';

import {
  backsiphonageOnlyHealthFindings,
  degreeRank,
  findingByCode,
  findingsForScope,
  findingsOfDegree,
  hasBackpressure,
  HAZARD_FINDINGS,
  worseDegree,
  worstDegree,
  type HazardFinding,
} from '../../../src/domain/hazard';

function finding(code: string): HazardFinding {
  const result = findingByCode(code);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

describe('the catalogue', () => {
  it('has no duplicate codes', () => {
    const codes = HAZARD_FINDINGS.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('gives every finding a scope, a mode and a note', () => {
    for (const entry of HAZARD_FINDINGS) {
      expect(entry.scopes.length).toBeGreaterThan(0);
      expect(entry.modes.length).toBeGreaterThan(0);
      expect(entry.note.length).toBeGreaterThan(10);
      expect(entry.degree).not.toBe('none');
    }
  });

  it('only demands an air gap for a health hazard', () => {
    for (const entry of HAZARD_FINDINGS.filter((candidate) => candidate.airGapOnly)) {
      expect(entry.degree).toBe('health');
    }
  });

  it('uses upper case codes with no spaces', () => {
    for (const entry of HAZARD_FINDINGS) {
      expect(entry.code).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
  });

  it('looks a finding up and says so when there is none', () => {
    expect(finding('AUX_WELL').degree).toBe('health');
    const missing = findingByCode('NOT_A_CODE');
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error).toContain('NOT_A_CODE');
    }
  });
});

describe('degrees', () => {
  it('ranks them', () => {
    expect(degreeRank('none')).toBeLessThan(degreeRank('nonhealth'));
    expect(degreeRank('nonhealth')).toBeLessThan(degreeRank('health'));
  });

  it('takes the worse of a pair', () => {
    expect(worseDegree('none', 'nonhealth')).toBe('nonhealth');
    expect(worseDegree('health', 'nonhealth')).toBe('health');
    expect(worseDegree('nonhealth', 'nonhealth')).toBe('nonhealth');
  });

  it('takes the worst of a list and defaults to none', () => {
    expect(worstDegree([])).toBe('none');
    expect(worstDegree(['nonhealth', 'none'])).toBe('nonhealth');
    expect(worstDegree(['nonhealth', 'health', 'none'])).toBe('health');
  });
});

describe('slicing the catalogue', () => {
  it('filters by scope', () => {
    const containment = findingsForScope('containment');
    expect(containment.map((entry) => entry.code)).toContain('AUX_WELL');
    expect(containment.map((entry) => entry.code)).not.toContain('CARBONATOR');
  });

  it('filters by degree', () => {
    const nonhealth = findingsOfDegree('nonhealth');
    expect(nonhealth.map((entry) => entry.code)).toContain('IRRIG_PLAIN');
    expect(nonhealth.every((entry) => entry.degree === 'nonhealth')).toBe(true);
  });

  it('reads backpressure off a set of findings', () => {
    expect(hasBackpressure([finding('IRRIG_PLAIN')])).toBe(false);
    expect(hasBackpressure([finding('IRRIG_PLAIN'), finding('ELEVATED_TANK')])).toBe(true);
    expect(hasBackpressure([])).toBe(false);
  });

  it('keeps irrigation split by whether an injector is on it', () => {
    expect(finding('IRRIG_CHEM').degree).toBe('health');
    expect(finding('IRRIG_PLAIN').degree).toBe('nonhealth');
    expect(finding('IRRIG_CHEM').modes).toContain('backpressure');
    expect(finding('IRRIG_PLAIN').modes).not.toContain('backpressure');
  });
});

describe('the findings added after the second year of the program', () => {
  it('reads a cooling tower as a health hazard under backpressure', () => {
    const tower = finding('COOLING_TOWER');
    expect(tower.degree).toBe('health');
    expect(tower.modes).toContain('backpressure');
    expect(tower.scopes).toContain('containment');
  });

  it('keeps the fire pump test header at a pollutional hazard', () => {
    const header = finding('FIRE_PUMP_HEADER');
    expect(header.degree).toBe('nonhealth');
    expect(header.modes).toEqual(['backsiphonage']);
  });

  it('will not take an assembly on a bowser fill point', () => {
    expect(finding('MOBILE_TANK').airGapOnly).toBe(true);
  });

  it('keeps dialysis inside the premise, where the cart is', () => {
    expect(finding('DIALYSIS').scopes).toEqual(['isolation']);
  });

  it('lists the health hazards a vacuum breaker could still answer', () => {
    const codes = backsiphonageOnlyHealthFindings().map((entry) => entry.code);
    expect(codes).toContain('DIALYSIS');
    expect(codes).toContain('PHOTO_LAB');
    expect(codes).not.toContain('COOLING_TOWER');
    expect(codes).not.toContain('IRRIG_PLAIN');
  });

  it('leaves the catalogue with no duplicate codes after all of them', () => {
    const codes = HAZARD_FINDINGS.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(HAZARD_FINDINGS.length).toBeGreaterThanOrEqual(32);
  });
});

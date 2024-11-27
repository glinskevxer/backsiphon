import { describe, expect, it } from 'vitest';

import {
  closelyWatchedUses,
  PREMISE_USES,
  premiseUseByCode,
  surveyRefusedUses,
  usesWithCategoricalDegree,
} from '../../../src/domain/premise';

describe('premise uses', () => {
  it('has no duplicate codes', () => {
    const codes = PREMISE_USES.map((use) => use.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('gives every use a survey interval of at least a year', () => {
    for (const use of PREMISE_USES) {
      expect(use.surveyIntervalMonths).toBeGreaterThanOrEqual(12);
      expect(use.surveyIntervalMonths % 12).toBe(0);
    }
  });

  it('surveys a categorical health hazard every year', () => {
    for (const use of usesWithCategoricalDegree('health')) {
      expect(use.surveyIntervalMonths).toBeLessThanOrEqual(24);
    }
  });

  it('looks a use up', () => {
    const found = premiseUseByCode('MORTUARY');
    expect(found.ok).toBe(true);
    if (found.ok) {
      expect(found.value.categoricalDegree).toBe('health');
    }
  });

  it('says so when a code is not one of ours', () => {
    const missing = premiseUseByCode('CASTLE');
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error).toContain('CASTLE');
    }
  });

  it('holds an ordinary home at no degree of its own', () => {
    const home = premiseUseByCode('RES_SINGLE');
    expect(home.ok).toBe(true);
    if (home.ok) {
      expect(home.value.categoricalDegree).toBe('none');
      expect(home.value.surveyRefused).toBe(false);
    }
  });

  it('only refuses a survey where the degree is already health', () => {
    const refused = surveyRefusedUses();
    expect(refused.map((use) => use.code)).toEqual(['WWTP', 'MARINA', 'FUEL_DEPOT']);
    for (const use of refused) {
      expect(use.categoricalDegree).toBe('health');
    }
  });

  it('walks every categorical health hazard at least once every two years', () => {
    for (const use of usesWithCategoricalDegree('health')) {
      expect(use.surveyIntervalMonths).toBeLessThanOrEqual(24);
    }
    // and the ones on the tighter list are all health hazards themselves
    for (const use of closelyWatchedUses()) {
      expect(use.surveyIntervalMonths).toBeLessThanOrEqual(18);
    }
  });

  it('keeps the trades that only become a hazard once the survey finds something', () => {
    for (const code of ['ICE_RINK', 'HOTEL', 'DATA_CENTRE']) {
      const use = premiseUseByCode(code);
      expect(use.ok).toBe(true);
      if (use.ok) {
        expect(use.value.categoricalDegree).toBe('nonhealth');
      }
    }
  });

  it('reads the trades that carry a degree of their own', () => {
    for (const code of ['BREWERY', 'DAIRY', 'DRY_CLEANER', 'PRISON', 'FUEL_DEPOT']) {
      const use = premiseUseByCode(code);
      expect(use.ok).toBe(true);
      if (use.ok) {
        expect(use.value.categoricalDegree).toBe('health');
      }
    }
  });
});

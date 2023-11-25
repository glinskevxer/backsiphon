import { describe, expect, it } from 'vitest';

import { assess, type HazardAssessment, type SurveyRecord } from '../../../src/domain/survey';

function survey(overrides: Partial<SurveyRecord> = {}): SurveyRecord {
  return {
    connectionId: 'SC-1001',
    premiseUseCode: 'OFFICE',
    surveyedOn: '2024-03-04',
    surveyor: 'r. okafor',
    findingCodes: [],
    accessGranted: true,
    ...overrides,
  };
}

function assessed(overrides: Partial<SurveyRecord> = {}): HazardAssessment {
  const result = assess(survey(overrides));
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

describe('reading a survey', () => {
  it('takes an office with nothing on it at no degree', () => {
    const assessment = assessed();
    expect(assessment.degree).toBe('none');
    expect(assessment.containmentDegree).toBe('none');
    expect(assessment.isolationDegree).toBe('none');
    expect(assessment.drivers).toEqual([]);
    expect(assessment.basis).toBe('survey');
  });

  it('carries the use category through when the survey found nothing', () => {
    const assessment = assessed({ premiseUseCode: 'MORTUARY' });
    expect(assessment.containmentDegree).toBe('health');
    expect(assessment.basis).toBe('category');
    expect(assessment.drivers).toEqual(['use:MORTUARY']);
  });

  it('lets a finding raise an ordinary use', () => {
    const assessment = assessed({ findingCodes: ['AUX_WELL'] });
    expect(assessment.containmentDegree).toBe('health');
    expect(assessment.basis).toBe('survey');
    expect(assessment.drivers).toEqual(['AUX_WELL']);
  });

  it('never lets a finding lower a categorical use', () => {
    const assessment = assessed({ premiseUseCode: 'HOSPITAL', findingCodes: ['DOCK_HYDRANT'] });
    expect(assessment.containmentDegree).toBe('health');
    expect(assessment.isolationDegree).toBe('nonhealth');
    expect(assessment.degree).toBe('health');
  });

  it('keeps the two scopes apart', () => {
    const assessment = assessed({ findingCodes: ['CARBONATOR'] });
    expect(assessment.containmentDegree).toBe('none');
    expect(assessment.isolationDegree).toBe('health');
    expect(assessment.degree).toBe('health');
  });

  it('names every finding that set the degree', () => {
    const assessment = assessed({
      premiseUseCode: 'LAB',
      findingCodes: ['AUX_WELL', 'PLATING', 'BOOSTER_PUMP'],
    });
    expect(assessment.drivers).toEqual(['use:LAB', 'AUX_WELL', 'PLATING']);
  });
});

describe('access', () => {
  it('treats a refused survey as a health hazard at the main', () => {
    const assessment = assessed({ accessGranted: false });
    expect(assessment.containmentDegree).toBe('health');
    expect(assessment.basis).toBe('refused');
    expect(assessment.drivers).toEqual(['access:refused']);
  });

  it('does not invent an isolation degree for a refused survey', () => {
    expect(assessed({ accessGranted: false }).isolationDegree).toBe('none');
  });

  it('refuses a premise the purveyor does not enter at all', () => {
    const assessment = assessed({ premiseUseCode: 'WWTP' });
    expect(assessment.basis).toBe('refused');
    expect(assessment.containmentDegree).toBe('health');
    expect(assessment.drivers).toEqual(['use:WWTP']);
  });
});

describe('the flags the requirement will read', () => {
  it('reads an air gap only finding at the containment scope', () => {
    expect(assessed({ findingCodes: ['RECLAIMED'] }).airGapRequired).toBe(true);
    expect(assessed({ findingCodes: ['AUX_WELL'] }).airGapRequired).toBe(false);
  });

  it('does not raise the air gap flag for an isolation only finding', () => {
    expect(assessed({ findingCodes: ['PHOTO_LAB'] }).airGapRequired).toBe(false);
  });

  it('reads backpressure from any scope', () => {
    expect(assessed({ findingCodes: ['IRRIG_PLAIN'] }).backpressure).toBe(false);
    expect(assessed({ findingCodes: ['CARBONATOR'] }).backpressure).toBe(true);
    expect(assessed({ findingCodes: ['ELEVATED_TANK'] }).backpressure).toBe(true);
  });
});

describe('the next survey', () => {
  it('uses the interval of the use category', () => {
    expect(assessed({ premiseUseCode: 'RETAIL' }).nextSurveyDue).toBe('2027-03-04');
  });

  it('tightens to a year once the assessment reads health', () => {
    const assessment = assessed({ premiseUseCode: 'RETAIL', findingCodes: ['CARBONATOR'] });
    expect(assessment.degree).toBe('health');
    expect(assessment.nextSurveyDue).toBe('2025-03-04');
  });

  it('leaves a shorter category interval alone', () => {
    expect(assessed({ premiseUseCode: 'HOSPITAL' }).nextSurveyDue).toBe('2025-03-04');
  });

  it('does not tighten for a non health finding', () => {
    const assessment = assessed({ premiseUseCode: 'RETAIL', findingCodes: ['DOCK_HYDRANT'] });
    expect(assessment.nextSurveyDue).toBe('2027-03-04');
  });
});

describe('input the register will not take', () => {
  it('refuses an unknown use', () => {
    const result = assess(survey({ premiseUseCode: 'AIRSHIP' }));
    expect(result.ok).toBe(false);
  });

  it('refuses an unknown finding', () => {
    const result = assess(survey({ findingCodes: ['AUX_WELL', 'GHOSTS'] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('GHOSTS');
    }
  });

  it('refuses the same finding listed twice', () => {
    const result = assess(survey({ findingCodes: ['AUX_WELL', 'AUX_WELL'] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('twice');
    }
  });

  it('refuses a survey with no surveyor and one with a bad date', () => {
    expect(assess(survey({ surveyor: '  ' })).ok).toBe(false);
    expect(assess(survey({ surveyedOn: '4 march 2024' })).ok).toBe(false);
  });
});

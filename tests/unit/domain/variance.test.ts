import { describe, expect, it } from 'vitest';

import {
  applyVariance,
  conditionsOf,
  grantAllowed,
  isPending,
  varianceStatus,
  type Variance,
} from '../../../src/domain/variance';
import { requiredClassOf, type RequiredProtection } from '../../../src/domain/requirement';

function variance(overrides: Partial<Variance> = {}): Variance {
  return {
    varianceId: 'V-204',
    connectionId: 'SC-2200',
    appliedOn: '2024-03-01',
    decision: 'granted',
    decidedOn: '2024-03-20',
    acceptedClass: 'DC',
    grantedAgainstDegree: 'health',
    effectiveFrom: '2024-04-01',
    expiresOn: '2025-03-31',
    conditions: ['quarterly inspection of the boiler room', 'no chemical feed without notice'],
    ...overrides,
  };
}

const requireRp: RequiredProtection = {
  kind: 'required',
  assemblyClass: 'RP',
  reasons: ['the containment hazard reads health'],
};

const requireAirGap: RequiredProtection = {
  kind: 'required',
  assemblyClass: 'AG',
  reasons: ['reclaimed water on the premise'],
};

describe('status', () => {
  it('is pending while nobody has decided', () => {
    const applied = variance({ decision: undefined, decidedOn: undefined });
    expect(varianceStatus(applied, '2024-03-10', 'health')).toBe('pending');
    expect(isPending(applied, '2024-03-10')).toBe(true);
    expect(isPending(variance(), '2024-03-10')).toBe(false);
  });

  it('is denied once the office says no', () => {
    expect(varianceStatus(variance({ decision: 'denied' }), '2024-06-01', 'health')).toBe('denied');
  });

  it('is not yet effective before the effective date', () => {
    expect(varianceStatus(variance(), '2024-03-31', 'health')).toBe('not_yet_effective');
    expect(varianceStatus(variance(), '2024-04-01', 'health')).toBe('in_effect');
  });

  it('expires after the expiry date', () => {
    expect(varianceStatus(variance(), '2025-03-31', 'health')).toBe('in_effect');
    expect(varianceStatus(variance(), '2025-04-01', 'health')).toBe('expired');
  });

  it('is revoked from the day the office revoked it', () => {
    const revoked = variance({ revokedOn: '2024-09-01' });
    expect(varianceStatus(revoked, '2024-08-31', 'health')).toBe('in_effect');
    expect(varianceStatus(revoked, '2024-09-01', 'health')).toBe('revoked');
  });

  it('is void once a later survey finds the premise worse', () => {
    const granted = variance({ grantedAgainstDegree: 'nonhealth', acceptedClass: 'PVB' });
    expect(varianceStatus(granted, '2024-06-01', 'nonhealth')).toBe('in_effect');
    expect(varianceStatus(granted, '2024-06-01', 'health')).toBe('void_degree_raised');
  });

  it('is not void when a later survey finds the premise better', () => {
    expect(varianceStatus(variance(), '2024-06-01', 'nonhealth')).toBe('in_effect');
  });

  it('runs from the decision date when nobody wrote an effective date', () => {
    const noStart = variance({ effectiveFrom: undefined });
    expect(varianceStatus(noStart, '2024-03-19', 'health')).toBe('not_yet_effective');
    expect(varianceStatus(noStart, '2024-03-20', 'health')).toBe('in_effect');
  });

  it('runs open ended when nobody wrote an expiry', () => {
    expect(varianceStatus(variance({ expiresOn: undefined }), '2031-01-01', 'health')).toBe(
      'in_effect',
    );
  });
});

describe('what the office may grant', () => {
  it('takes a weaker class against a mechanical requirement', () => {
    expect(grantAllowed(requireRp, 'DC').ok).toBe(true);
  });

  it('will not vary an air gap', () => {
    const result = grantAllowed(requireAirGap, 'RP');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('cannot be varied');
    }
  });

  it('will not write one where nothing is required', () => {
    expect(grantAllowed({ kind: 'none', reasons: [] }, 'DC').ok).toBe(false);
  });

  it('will not write one for a class that already answers the requirement', () => {
    const result = grantAllowed(requireRp, 'RPDA');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('no variance is needed');
    }
  });
});

describe('applying one to a requirement', () => {
  it('rewrites the required class while it is in effect', () => {
    const varied = applyVariance(requireRp, variance(), '2024-06-01', 'health');
    expect(requiredClassOf(varied.protection)).toBe('DC');
    expect(varied.variedBy).toBe('V-204');
    expect(varied.status).toBe('in_effect');
  });

  it('keeps the original reasons and adds its own', () => {
    const varied = applyVariance(requireRp, variance(), '2024-06-01', 'health');
    expect(varied.protection.reasons[0]).toContain('health');
    expect(varied.protection.reasons[1]).toContain('V-204');
    expect(varied.protection.reasons[1]).toContain('2 conditions');
  });

  it('leaves the requirement alone before it takes effect and after it expires', () => {
    expect(requiredClassOf(applyVariance(requireRp, variance(), '2024-03-01', 'health').protection)).toBe('RP');
    expect(requiredClassOf(applyVariance(requireRp, variance(), '2025-06-01', 'health').protection)).toBe('RP');
  });

  it('leaves the requirement alone once a survey has raised the degree', () => {
    const granted = variance({ grantedAgainstDegree: 'nonhealth' });
    const varied = applyVariance(requireRp, granted, '2024-06-01', 'health');
    expect(requiredClassOf(varied.protection)).toBe('RP');
    expect(varied.status).toBe('void_degree_raised');
  });

  it('never rewrites an air gap requirement even with a variance on file', () => {
    const varied = applyVariance(requireAirGap, variance(), '2024-06-01', 'health');
    expect(requiredClassOf(varied.protection)).toBe('AG');
    expect(varied.variedBy).toBe('V-204');
  });

  it('does nothing where there is no variance and nothing where nothing is required', () => {
    expect(applyVariance(requireRp, undefined, '2024-06-01', 'health').protection).toBe(requireRp);
    const nothing: RequiredProtection = { kind: 'none', reasons: [] };
    expect(applyVariance(nothing, variance(), '2024-06-01', 'health').protection).toBe(nothing);
  });

  it('hands the conditions back for the letter', () => {
    expect(conditionsOf(variance())).toHaveLength(2);
  });
});

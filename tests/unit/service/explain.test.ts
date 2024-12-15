import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { complianceFor, type ComplianceStatus } from '../../../src/service/compliance';
import { explainStatus, explanationLines } from '../../../src/service/explain';
import { applyForVariance, decideGrant } from '../../../src/service/variances';
import { fileTest, fit, open, openOffice, walk, type Office } from '../../support/office';

let office: Office;

function status(connectionId: string, asOf: string): ComplianceStatus {
  const result = complianceFor(office.register, connectionId, asOf);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

function text(connectionId: string, asOf: string): string {
  return explanationLines(explainStatus(status(connectionId, asOf))).join('\n');
}

beforeEach(() => {
  office = openOffice();
});

afterEach(() => {
  office.close();
});

describe('explaining a connection', () => {
  it('walks the survey, both points and the standing', () => {
    const connectionId = open(office, { accountNumber: 'A-1' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    const explanation = explainStatus(status(connectionId, '2024-06-01'));
    expect(explanation.map((entry) => entry.heading)).toEqual([
      'the survey',
      'containment protection',
      'isolation protection',
      'where that leaves it',
    ]);
  });

  it('names the finding that set the degree and what it asks for', () => {
    const connectionId = open(office, { accountNumber: 'A-2' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    const written = text(connectionId, '2024-06-01');
    expect(written).toContain('findings: AUX_WELL');
    expect(written).toContain('the containment hazard reads health');
    expect(written).toContain('none is fitted');
    expect(written).toContain('standing: deficient');
  });

  it('says a vacuum breaker is out once something can push back', () => {
    const connectionId = open(office, { accountNumber: 'A-3' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    expect(text(connectionId, '2024-06-01')).toContain('rules out a vacuum breaker');
  });

  it('says the surveyor was kept out where that is what happened', () => {
    const connectionId = open(office, { accountNumber: 'A-4' });
    walk(office, connectionId, '2024-01-10', [], false);
    expect(text(connectionId, '2024-06-01')).toContain('kept out');
  });

  it('says which variance is doing the work', () => {
    const connectionId = open(office, { accountNumber: 'A-5' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    fit(office, {
      connectionId,
      assemblyClass: 'DC',
      modelId: 'WK-350',
      installedOn: '2024-02-01',
    });
    applyForVariance(office.register, {
      connectionId,
      appliedOn: '2024-02-05',
      acceptedClass: 'DC',
    });
    decideGrant(office.register, 'V-0001', {
      decidedOn: '2024-02-20',
      effectiveFrom: '2024-03-01',
      conditions: ['the well stays capped'],
    });
    const written = text(connectionId, '2024-06-01');
    expect(written).toContain('variance V-0001 reads in_effect');
    expect(written).toContain('a DC is accepted here instead');
  });

  it('says when the next letter falls due', () => {
    const connectionId = open(office, { accountNumber: 'A-6' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2024-02-01' });
    fileTest(office, { assemblyId, testedOn: '2024-02-05' });
    const written = text(connectionId, '2025-02-20');
    expect(written).toContain('the ladder has reached the second notice');
    expect(written).toContain('the final notice falls due 2025-03-02');
  });

  it('says plainly whether the service may be shut off', () => {
    const connectionId = open(office, { accountNumber: 'A-7' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2024-02-01' });
    fileTest(office, { assemblyId, testedOn: '2024-02-05' });
    expect(text(connectionId, '2024-06-01')).toContain('may not be shut off today');
    expect(text(connectionId, '2025-04-01')).toContain('the service may be shut off');
  });

  it('lays the lines out under headings with a rule under each', () => {
    const connectionId = open(office, { accountNumber: 'A-8' });
    walk(office, connectionId, '2024-01-10', []);
    const lines = explanationLines(explainStatus(status(connectionId, '2024-06-01')));
    expect(lines[0]).toBe('the survey');
    expect(lines[1]).toBe('----------');
    expect(lines[2]?.startsWith('  ')).toBe(true);
  });
});

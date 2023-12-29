import { describe, expect, it } from 'vitest';

import {
  compareToRequirement,
  isActive,
  type InstalledAssembly,
} from '../../../src/domain/deficiency';
import type { AssemblyClass } from '../../../src/domain/assembly';
import type { RequiredProtection } from '../../../src/domain/requirement';

function fitted(assemblyClass: AssemblyClass, overrides: Partial<InstalledAssembly> = {}): InstalledAssembly {
  return {
    assemblyId: 'BA-9001',
    connectionId: 'SC-2200',
    scope: 'containment',
    assemblyClass,
    modelId: 'WK-375-2',
    serialNumber: '4471182',
    sizeInches: 2,
    installedOn: '2023-06-01',
    location: 'meter vault, north side',
    ...overrides,
  };
}

function required(assemblyClass: AssemblyClass): RequiredProtection {
  return { kind: 'required', assemblyClass, reasons: ['because the survey said so'] };
}

const nothingRequired: RequiredProtection = { kind: 'none', reasons: ['clean premise'] };

describe('whether an assembly counts on a given day', () => {
  it('is not active before it was fitted', () => {
    expect(isActive(fitted('RP'), '2023-05-31')).toBe(false);
    expect(isActive(fitted('RP'), '2023-06-01')).toBe(true);
  });

  it('stops counting on the day it comes out', () => {
    const removed = fitted('RP', { removedOn: '2024-02-14' });
    expect(isActive(removed, '2024-02-13')).toBe(true);
    expect(isActive(removed, '2024-02-14')).toBe(false);
    expect(isActive(removed, '2024-03-01')).toBe(false);
  });
});

describe('comparing against the requirement', () => {
  it('is satisfied by the exact class', () => {
    const finding = compareToRequirement(required('RP'), fitted('RP'), 'containment');
    expect(finding.kind).toBe('none');
    expect(finding.urgency).toBe('none');
    expect(finding.missing).toEqual([]);
  });

  it('is satisfied by a class that holds everything the required one holds', () => {
    expect(compareToRequirement(required('DC'), fitted('RP'), 'containment').kind).toBe('none');
    expect(compareToRequirement(required('RP'), fitted('RPDA'), 'containment').kind).toBe('none');
  });

  it('reports a missing assembly against what was required', () => {
    const finding = compareToRequirement(required('RP'), undefined, 'containment');
    expect(finding.kind).toBe('missing');
    expect(finding.urgency).toBe('immediate');
    expect(finding.reasons[0]).toContain('none is fitted');
  });

  it('lets a missing double check wait for the cycle', () => {
    expect(compareToRequirement(required('DC'), undefined, 'containment').urgency).toBe('cycle');
    expect(compareToRequirement(required('DCDA'), undefined, 'containment').urgency).toBe('cycle');
  });

  it('names the capabilities a wrong class is short of', () => {
    const finding = compareToRequirement(required('RP'), fitted('DC'), 'containment');
    expect(finding.kind).toBe('wrong_class');
    expect(finding.missing).toEqual(['stopsHealthHazard']);
    expect(finding.urgency).toBe('immediate');
    expect(finding.reasons[0]).toContain('stopsHealthHazard');
  });

  it('lets a class that is only short of a detector wait', () => {
    const finding = compareToRequirement(required('DCDA'), fitted('DC'), 'containment');
    expect(finding.kind).toBe('wrong_class');
    expect(finding.missing).toEqual(['detector']);
    expect(finding.urgency).toBe('cycle');
  });

  it('will not accept a class that cannot sit at that point at all', () => {
    const finding = compareToRequirement(
      required('RP'),
      fitted('PVB', { scope: 'containment' }),
      'containment',
    );
    expect(finding.kind).toBe('wrong_scope');
    expect(finding.urgency).toBe('immediate');
    expect(finding.reasons[0]).toContain('not accepted');
  });

  it('checks the scope before the class', () => {
    const finding = compareToRequirement(
      required('PVB'),
      fitted('PVB', { scope: 'containment' }),
      'containment',
    );
    expect(finding.kind).toBe('wrong_scope');
  });

  it('reports nothing at all where nothing is required and nothing is fitted', () => {
    const finding = compareToRequirement(nothingRequired, undefined, 'containment');
    expect(finding.kind).toBe('none');
    expect(finding.urgency).toBe('none');
  });

  it('keeps an assembly nobody asked for on the test list', () => {
    const finding = compareToRequirement(nothingRequired, fitted('DC'), 'containment');
    expect(finding.kind).toBe('not_required');
    expect(finding.urgency).toBe('none');
    expect(finding.installedClass).toBe('DC');
    expect(finding.reasons[0]).toContain('test list');
  });

  it('treats an air gap requirement as immediate whatever is fitted', () => {
    expect(compareToRequirement(required('AG'), undefined, 'containment').urgency).toBe('immediate');
    const wrong = compareToRequirement(required('AG'), fitted('RP'), 'containment');
    expect(wrong.missing).toEqual(['physicalSeparation', 'spillResistant', 'detector']);
    expect(wrong.urgency).toBe('immediate');
  });
});

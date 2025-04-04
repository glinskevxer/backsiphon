import { describe, expect, it } from 'vitest';

import {
  booleanReading,
  effectiveReadings,
  missingReadings,
  numericReading,
  parseReport,
  strayReadings,
  structuralProblems,
  type TestReport,
} from '../../../src/domain/report';

function report(overrides: Partial<TestReport> = {}): TestReport {
  return {
    reportId: 'TR-5501',
    assemblyId: 'BA-9001',
    testerId: 'T-118',
    gaugeId: 'G-77',
    assemblyClassTested: 'DC',
    testedOn: '2024-05-14',
    filedOn: '2024-05-16',
    asFound: { check1Differential: 2.4, check2Differential: 1.8 },
    repairMade: false,
    ...overrides,
  };
}

describe('parsing an incoming report', () => {
  it('takes a well formed one', () => {
    const parsed = parseReport(report());
    expect(parsed.ok).toBe(true);
  });

  it('refuses one with a field missing', () => {
    const { testerId: _dropped, ...rest } = report();
    const parsed = parseReport(rest);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.join(' ')).toContain('testerId');
    }
  });

  it('refuses a class that is not one of ours', () => {
    const parsed = parseReport({ ...report(), assemblyClassTested: 'RPZ' });
    expect(parsed.ok).toBe(false);
  });

  it('refuses a reading that is neither a number nor a flag', () => {
    const parsed = parseReport({
      ...report(),
      asFound: { check1Differential: '2.4', check2Differential: 1.8 },
    });
    expect(parsed.ok).toBe(false);
  });

  it('refuses a reading that is not finite', () => {
    const parsed = parseReport({
      ...report(),
      asFound: { check1Differential: Number.POSITIVE_INFINITY },
    });
    expect(parsed.ok).toBe(false);
  });

  it('refuses something that is not an object at all', () => {
    expect(parseReport(null).ok).toBe(false);
    expect(parseReport('a report').ok).toBe(false);
    expect(parseReport(undefined).ok).toBe(false);
  });
});

describe('the shape of the form', () => {
  it('accepts a clean form', () => {
    expect(structuralProblems(report())).toEqual([]);
  });

  it('refuses a filing that predates the test', () => {
    const problems = structuralProblems(report({ testedOn: '2024-05-14', filedOn: '2024-05-01' }));
    expect(problems).toEqual(['filedOn: a report cannot be filed before the test it reports']);
  });

  it('refuses a class nobody has a procedure for', () => {
    const problems = structuralProblems(report({ assemblyClassTested: 'AVB' }));
    expect(problems.join(' ')).toContain('no field procedure');
  });

  it('wants as left readings once a repair is reported', () => {
    const problems = structuralProblems(
      report({ repairMade: true, repairNote: 'new first check' }),
    );
    expect(problems).toEqual(['asLeft: a repair was made and no as left readings were filed']);
  });

  it('wants a note saying what the repair was', () => {
    const problems = structuralProblems(
      report({ repairMade: true, asLeft: { check1Differential: 3 } }),
    );
    expect(problems.join(' ')).toContain('repairNote');
  });

  it('will not take as left readings with no repair behind them', () => {
    const problems = structuralProblems(report({ asLeft: { check1Differential: 3 } }));
    expect(problems.join(' ')).toContain('no repair was reported');
  });

  it('names both bad dates at once', () => {
    const problems = structuralProblems(report({ testedOn: 'may', filedOn: 'later' }));
    expect(problems).toHaveLength(2);
  });
});

describe('readings against the procedure', () => {
  it('names the readings the procedure wanted and did not get', () => {
    expect(missingReadings('DC', { check1Differential: 2 })).toEqual(['check2Differential']);
    expect(missingReadings('DC', report().asFound)).toEqual([]);
    expect(missingReadings('RP', report().asFound)).toEqual(['reliefOpening']);
  });

  it('names the readings that do not belong to this class', () => {
    expect(strayReadings('DC', { ...report().asFound, reliefOpening: 2.2 })).toEqual([
      'reliefOpening',
    ]);
    expect(strayReadings('DC', report().asFound)).toEqual([]);
  });

  it('judges the as left readings once a repair was made', () => {
    const repaired = report({
      repairMade: true,
      repairNote: 'reground the second check',
      asLeft: { check1Differential: 3.1, check2Differential: 2.2 },
    });
    expect(effectiveReadings(repaired)['check2Differential']).toBe(2.2);
    expect(effectiveReadings(report())['check2Differential']).toBe(1.8);
  });

  it('reads a number and a flag apart', () => {
    const readings = { check1Differential: 2.4, bypassTight: true };
    expect(numericReading(readings, 'check1Differential')).toBe(2.4);
    expect(numericReading(readings, 'bypassTight')).toBeUndefined();
    expect(booleanReading(readings, 'bypassTight')).toBe(true);
    expect(booleanReading(readings, 'check1Differential')).toBeUndefined();
    expect(numericReading(readings, 'nothing')).toBeUndefined();
  });
});

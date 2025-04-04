import { describe, expect, it } from 'vitest';

import { evaluate, worseOutcome, type EvaluationContext } from '../../../src/domain/evaluation';
import type { Readings, TestReport } from '../../../src/domain/report';

const context: EvaluationContext = { gaugeAccuracyPsid: 0.2, sizeInches: 2 };

function report(overrides: Partial<TestReport> = {}): TestReport {
  return {
    reportId: 'TR-6001',
    assemblyId: 'BA-9001',
    testerId: 'T-118',
    gaugeId: 'G-77',
    assemblyClassTested: 'DC',
    testedOn: '2024-06-03',
    filedOn: '2024-06-04',
    asFound: { check1Differential: 2.4, check2Differential: 1.8 },
    repairMade: false,
    ...overrides,
  };
}

function rp(asFound: Readings): TestReport {
  return report({ assemblyClassTested: 'RP', asFound });
}

describe('outcome ordering', () => {
  it('takes the worse of two', () => {
    expect(worseOutcome('pass', 'marginal')).toBe('marginal');
    expect(worseOutcome('fail', 'marginal')).toBe('fail');
    expect(worseOutcome('incomplete', 'fail')).toBe('incomplete');
    expect(worseOutcome('pass', 'pass')).toBe('pass');
  });
});

describe('a double check', () => {
  it('passes when both checks clear a psid', () => {
    const result = evaluate(report(), context);
    expect(result.outcome).toBe('pass');
    expect(result.phase).toBe('as_found');
    expect(result.judgements).toHaveLength(2);
  });

  it('fails when a check is well under', () => {
    const result = evaluate(
      report({ asFound: { check1Differential: 0.4, check2Differential: 1.8 } }),
      context,
    );
    expect(result.outcome).toBe('fail');
    expect(result.judgements[0]?.verdict).toBe('fail');
  });

  it('reads a shortfall inside the gauge band as marginal', () => {
    const result = evaluate(
      report({ asFound: { check1Differential: 0.9, check2Differential: 1.8 } }),
      context,
    );
    expect(result.outcome).toBe('marginal');
    expect(result.judgements[0]?.note).toContain('certified to');
  });

  it('fails once the shortfall is outside the band', () => {
    const result = evaluate(
      report({ asFound: { check1Differential: 0.79, check2Differential: 1.8 } }),
      context,
    );
    expect(result.outcome).toBe('fail');
  });

  it('reads exactly the minimum as a pass', () => {
    const result = evaluate(
      report({ asFound: { check1Differential: 1, check2Differential: 1 } }),
      context,
    );
    expect(result.outcome).toBe('pass');
  });

  it('is incomplete when a reading is not on the form', () => {
    const result = evaluate(report({ asFound: { check1Differential: 2.4 } }), context);
    expect(result.outcome).toBe('incomplete');
    expect(result.judgements[0]?.verdict).toBe('missing');
  });

  it('is incomplete when a reading came in as the wrong kind of value', () => {
    const result = evaluate(
      report({ asFound: { check1Differential: 2.4, check2Differential: true } }),
      context,
    );
    expect(result.outcome).toBe('incomplete');
  });

  it('notes readings that do not belong on the form', () => {
    const result = evaluate(
      report({ asFound: { check1Differential: 2.4, check2Differential: 1.8, reliefOpening: 3 } }),
      context,
    );
    expect(result.outcome).toBe('pass');
    expect(result.notes[0]).toContain('reliefOpening');
  });
});

describe('a reduced pressure assembly', () => {
  it('passes when both readings clear and the gap holds', () => {
    expect(evaluate(rp({ check1Differential: 8.2, reliefOpening: 3.1 }), context).outcome).toBe(
      'pass',
    );
  });

  it('fails the first check under five', () => {
    const result = evaluate(rp({ check1Differential: 4.2, reliefOpening: 2.1 }), context);
    expect(result.outcome).toBe('fail');
  });

  it('fails a relief valve that opens under two', () => {
    const result = evaluate(rp({ check1Differential: 8, reliefOpening: 1.5 }), context);
    expect(result.outcome).toBe('fail');
  });

  it('fails a gap under the buffer even when both readings pass alone', () => {
    const result = evaluate(rp({ check1Differential: 5.2, reliefOpening: 3.4 }), context);
    const buffer = result.judgements.find((entry) => entry.key.includes(':'));
    expect(buffer?.verdict).toBe('fail');
    expect(result.outcome).toBe('fail');
  });

  it('reads a gap inside the gauge band as marginal', () => {
    const result = evaluate(rp({ check1Differential: 5.3, reliefOpening: 2.4 }), context);
    const buffer = result.judgements.find((entry) => entry.key.includes(':'));
    expect(buffer?.verdict).toBe('marginal');
    expect(result.outcome).toBe('marginal');
  });

  it('skips the buffer rule when one of the two readings is missing', () => {
    const result = evaluate(rp({ check1Differential: 8 }), context);
    expect(result.judgements.some((entry) => entry.key.includes(':'))).toBe(false);
    expect(result.outcome).toBe('incomplete');
  });
});

describe('a repair', () => {
  const repaired = report({
    asFound: { check1Differential: 0.2, check2Differential: 1.8 },
    repairMade: true,
    repairNote: 'new first check rubber',
    asLeft: { check1Differential: 2.9, check2Differential: 2.1 },
  });

  it('is judged on the as left readings', () => {
    const result = evaluate(repaired, context);
    expect(result.outcome).toBe('pass');
    expect(result.phase).toBe('as_left');
  });

  it('still records what the tester found', () => {
    const result = evaluate(repaired, context);
    expect(result.asFoundOutcome).toBe('fail');
    expect(result.notes[0]).toContain('was fail when the tester arrived');
  });

  it('fails when the repair did not fix it', () => {
    const result = evaluate(
      { ...repaired, asLeft: { check1Differential: 0.4, check2Differential: 2.1 } },
      context,
    );
    expect(result.outcome).toBe('fail');
    expect(result.asFoundOutcome).toBe('fail');
  });
});

describe('a spill resistant breaker', () => {
  it('fails on a weeping vent whatever the numbers say', () => {
    const result = evaluate(
      report({
        assemblyClassTested: 'SVB',
        asFound: { airInletOpening: 2.2, check1Differential: 3.1, ventTight: false },
      }),
      context,
    );
    expect(result.outcome).toBe('fail');
  });

  it('passes with a tight vent', () => {
    const result = evaluate(
      report({
        assemblyClassTested: 'SVB',
        asFound: { airInletOpening: 2.2, check1Differential: 3.1, ventTight: true },
      }),
      context,
    );
    expect(result.outcome).toBe('pass');
  });
});

describe('an air gap', () => {
  it('is measured against twice the pipe size with no gauge band', () => {
    const separation = report({ assemblyClassTested: 'AG', asFound: { separationInches: 3.9 } });
    expect(evaluate(separation, { gaugeAccuracyPsid: 0.2, sizeInches: 2 }).outcome).toBe('fail');
    expect(evaluate(separation, { gaugeAccuracyPsid: 0.2, sizeInches: 1.5 }).outcome).toBe('pass');
  });
});

/**
 * The edges the office has actually argued about.
 *
 * Every one of these is a real telephone call: a reading exactly on the
 * threshold, a test on the last day of a cycle, an anniversary that falls on a
 * day the month does not have, and a letter due on the day the water is turned
 * back on. They are gathered here because they cut across modules and each one
 * is a sentence somebody had to say out loud to a customer.
 */

import { describe, expect, it } from 'vitest';

import { evaluate } from '../../../src/domain/evaluation';
import { minimumFor, stepByKey } from '../../../src/domain/procedure';
import { nextTestDue, retestDue, DEFAULT_CYCLE_POLICY } from '../../../src/domain/cycle';
import { delinquencyState } from '../../../src/domain/delinquency';
import { addMonths } from '../../../src/util/dates';
import { buildCalendar } from '../../../src/util/workdays';
import type { TestReport } from '../../../src/domain/report';

const context = { gaugeAccuracyPsid: 0.2, sizeInches: 2 };

function report(
  asFound: Record<string, number | boolean>,
  assemblyClass: TestReport['assemblyClassTested'] = 'RP',
): TestReport {
  return {
    reportId: 'TR-1',
    assemblyId: 'BA-1',
    testerId: 'T-1',
    gaugeId: 'G-1',
    assemblyClassTested: assemblyClass,
    testedOn: '2025-05-01',
    filedOn: '2025-05-02',
    asFound,
    repairMade: false,
  };
}

describe('a reading exactly on the line', () => {
  it('passes at the threshold and is marginal a hair under', () => {
    expect(evaluate(report({ check1Differential: 5, reliefOpening: 2 }), context).outcome).toBe(
      'pass',
    );
    expect(evaluate(report({ check1Differential: 4.9, reliefOpening: 2 }), context).outcome).toBe(
      'marginal',
    );
  });

  it('is marginal all the way to the edge of the gauge band and failing past it', () => {
    expect(evaluate(report({ check1Differential: 4.8, reliefOpening: 1.8 }), context).outcome).toBe(
      'marginal',
    );
    expect(
      evaluate(report({ check1Differential: 4.79, reliefOpening: 1.8 }), context).outcome,
    ).toBe('fail');
  });

  it('reads a wider gauge band as a wider marginal zone', () => {
    const wide = { gaugeAccuracyPsid: 0.5, sizeInches: 2 };
    expect(evaluate(report({ check1Differential: 4.6, reliefOpening: 2 }), wide).outcome).toBe(
      'marginal',
    );
    expect(evaluate(report({ check1Differential: 4.6, reliefOpening: 2 }), context).outcome).toBe(
      'fail',
    );
  });

  it('measures an air gap with no band at all, because nobody gauges a ruler', () => {
    const separation = report({ separationInches: 3.99 }, 'AG');
    expect(evaluate(separation, context).outcome).toBe('fail');
    expect(evaluate(report({ separationInches: 4 }, 'AG'), context).outcome).toBe('pass');
  });

  it('measures an air gap against twice the pipe, and never under an inch', () => {
    const step = stepByKey('AG', 'separationInches');
    expect(step.ok).toBe(true);
    if (!step.ok) {
      return;
    }
    expect(minimumFor(step.value, 0.25)).toBe(1);
    expect(minimumFor(step.value, 8)).toBe(16);
  });
});

describe('an anniversary the calendar cannot hold', () => {
  it('clamps a test on the thirty first onto the end of a short month', () => {
    const due = nextTestDue({
      installedOn: '2020-01-01',
      lastPassingTestOn: '2024-08-31',
      containmentDegree: 'health',
      premiseUseCode: 'WWTP',
      policy: DEFAULT_CYCLE_POLICY,
    });
    expect(due.due).toBe('2025-02-28');
  });

  it('clamps the twenty ninth of february onto the twenty eighth', () => {
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
  });

  it('does not lose a day going the other way', () => {
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
  });
});

describe('a repair window over a holiday', () => {
  const calendar = buildCalendar('program office', 2024, 2026);

  it('steps over the fourth of july and the weekend round it', () => {
    expect(retestDue('2024-07-01', calendar, DEFAULT_CYCLE_POLICY).due).toBe('2024-07-09');
  });

  it('steps over christmas and the new year together', () => {
    expect(retestDue('2024-12-20', calendar, DEFAULT_CYCLE_POLICY).due).toBe('2024-12-30');
  });

  it('starts from a saturday the same way it starts from a tuesday', () => {
    expect(retestDue('2024-08-17', calendar, DEFAULT_CYCLE_POLICY).due).toBe('2024-08-23');
    expect(retestDue('2024-08-20', calendar, DEFAULT_CYCLE_POLICY).due).toBe('2024-08-27');
  });
});

describe('a letter due on the day', () => {
  it('sends nothing on the due date itself', () => {
    const state = delinquencyState({
      due: '2025-05-01',
      asOf: '2025-05-01',
      degree: 'health',
      varianceApplicationPending: false,
    });
    expect(state.stage).toBe('none');
  });

  it('sends the first the day after, on either ladder', () => {
    for (const degree of ['health', 'nonhealth'] as const) {
      const state = delinquencyState({
        due: '2025-05-01',
        asOf: '2025-05-02',
        degree,
        varianceApplicationPending: false,
      });
      expect(state.stage).toBe('first');
    }
  });

  it('reaches each rung on the day it says and not the day before', () => {
    const on = (asOf: string): string =>
      delinquencyState({
        due: '2025-05-01',
        asOf,
        degree: 'nonhealth',
        varianceApplicationPending: false,
      }).stage;
    expect(on('2025-05-30')).toBe('first');
    expect(on('2025-05-31')).toBe('second');
    expect(on('2025-06-14')).toBe('second');
    expect(on('2025-06-15')).toBe('final');
    expect(on('2025-06-29')).toBe('final');
    expect(on('2025-06-30')).toBe('shutoff');
  });
});

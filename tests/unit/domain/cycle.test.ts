import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CYCLE_POLICY,
  daysOverdue,
  intervalMonthsFor,
  isOverdue,
  nextTestDue,
  retestDue,
  type CycleInput,
} from '../../../src/domain/cycle';
import { buildCalendar } from '../../../src/util/workdays';

const calendar = buildCalendar('program office', 2023, 2027);

function input(overrides: Partial<CycleInput> = {}): CycleInput {
  return {
    installedOn: '2023-04-11',
    lastPassingTestOn: '2024-05-02',
    containmentDegree: 'nonhealth',
    premiseUseCode: 'RETAIL',
    policy: DEFAULT_CYCLE_POLICY,
    ...overrides,
  };
}

describe('the interval', () => {
  it('is a year for most connections', () => {
    expect(intervalMonthsFor('nonhealth', 'RETAIL', DEFAULT_CYCLE_POLICY)).toBe(12);
    expect(intervalMonthsFor('health', 'RETAIL', DEFAULT_CYCLE_POLICY)).toBe(12);
  });

  it('halves for a health hazard on a premise the purveyor watches', () => {
    expect(intervalMonthsFor('health', 'HOSPITAL', DEFAULT_CYCLE_POLICY)).toBe(6);
    expect(intervalMonthsFor('health', 'WWTP', DEFAULT_CYCLE_POLICY)).toBe(6);
  });

  it('needs both the degree and the use, not one of them', () => {
    expect(intervalMonthsFor('nonhealth', 'HOSPITAL', DEFAULT_CYCLE_POLICY)).toBe(12);
    expect(intervalMonthsFor('health', 'OFFICE', DEFAULT_CYCLE_POLICY)).toBe(12);
  });

  it('takes a different close watch list from the policy', () => {
    const policy = { ...DEFAULT_CYCLE_POLICY, closeWatchUses: ['OFFICE'] };
    expect(intervalMonthsFor('health', 'OFFICE', policy)).toBe(6);
    expect(intervalMonthsFor('health', 'HOSPITAL', policy)).toBe(12);
  });
});

describe('the due date', () => {
  it('runs from the last passing test', () => {
    const due = nextTestDue(input());
    expect(due.due).toBe('2025-05-02');
    expect(due.basis).toBe('anniversary');
    expect(due.note).toContain('2024-05-02');
  });

  it('runs from the install date when there has never been a passing test', () => {
    const due = nextTestDue(input({ lastPassingTestOn: undefined }));
    expect(due.due).toBe('2023-04-21');
    expect(due.basis).toBe('first_test');
  });

  it('shortens once the connection is on the close watch list', () => {
    const due = nextTestDue(input({ containmentDegree: 'health', premiseUseCode: 'HOSPITAL' }));
    expect(due.due).toBe('2024-11-02');
    expect(due.intervalMonths).toBe(6);
  });

  it('clamps an anniversary onto the end of a short month', () => {
    const due = nextTestDue(
      input({
        lastPassingTestOn: '2024-08-31',
        containmentDegree: 'health',
        premiseUseCode: 'WWTP',
      }),
    );
    expect(due.due).toBe('2025-02-28');
  });

  it('reports the interval even for a first test', () => {
    const due = nextTestDue(
      input({
        lastPassingTestOn: undefined,
        containmentDegree: 'health',
        premiseUseCode: 'MARINA',
      }),
    );
    expect(due.intervalMonths).toBe(6);
    expect(due.basis).toBe('first_test');
  });
});

describe('a repair window', () => {
  it('is counted in working days from the failure', () => {
    const due = retestDue('2024-08-16', calendar, DEFAULT_CYCLE_POLICY);
    expect(due.due).toBe('2024-08-23');
    expect(due.basis).toBe('repair');
  });

  it('steps over a holiday', () => {
    const due = retestDue('2024-07-01', calendar, DEFAULT_CYCLE_POLICY);
    expect(due.due).toBe('2024-07-09');
  });

  it('takes a longer window from the policy', () => {
    const due = retestDue('2024-08-16', calendar, { ...DEFAULT_CYCLE_POLICY, repairWorkdays: 10 });
    expect(due.due).toBe('2024-08-30');
  });
});

describe('being late', () => {
  it('is not overdue on the day it is due', () => {
    const due = nextTestDue(input());
    expect(isOverdue(due, '2025-05-02')).toBe(false);
    expect(isOverdue(due, '2025-05-03')).toBe(true);
  });

  it('counts the days past', () => {
    const due = nextTestDue(input());
    expect(daysOverdue(due, '2025-05-02')).toBe(0);
    expect(daysOverdue(due, '2025-06-01')).toBe(30);
  });

  it('counts nothing for a connection that is not due', () => {
    const notDue = { due: '2025-05-02', basis: 'not_due' as const, intervalMonths: 12, note: '' };
    expect(isOverdue(notDue, '2030-01-01')).toBe(false);
    expect(daysOverdue(notDue, '2030-01-01')).toBe(0);
  });
});

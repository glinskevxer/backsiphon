import { describe, expect, it } from 'vitest';

import {
  delinquencyState,
  HEALTH_LADDER,
  ladderFor,
  noticeSchedule,
  stageRank,
  STANDARD_LADDER,
  type DelinquencyInput,
} from '../../../src/domain/delinquency';

function state(overrides: Partial<DelinquencyInput> = {}): ReturnType<typeof delinquencyState> {
  return delinquencyState({
    due: '2024-06-01',
    asOf: '2024-06-01',
    degree: 'nonhealth',
    varianceApplicationPending: false,
    ...overrides,
  });
}

describe('which ladder applies', () => {
  it('puts a health hazard on the short one', () => {
    expect(ladderFor('health')).toBe(HEALTH_LADDER);
    expect(ladderFor('nonhealth')).toBe(STANDARD_LADDER);
    expect(ladderFor('none')).toBe(STANDARD_LADDER);
  });

  it('keeps the rungs in order on both', () => {
    for (const ladder of [STANDARD_LADDER, HEALTH_LADDER]) {
      const days = ladder.rungs.map((rung) => rung.afterDays);
      expect([...days].sort((left, right) => left - right)).toEqual(days);
    }
  });
});

describe('before and on the due date', () => {
  it('is at no stage at all', () => {
    const result = state();
    expect(result.stage).toBe('none');
    expect(result.daysPastDue).toBe(0);
    expect(result.nextStage).toBe('first');
    expect(result.nextStageOn).toBe('2024-06-01');
  });

  it('is at no stage well before it', () => {
    expect(state({ asOf: '2024-01-01' }).stage).toBe('none');
  });
});

describe('climbing the standard ladder', () => {
  it('sends the first notice the day after the due date', () => {
    const result = state({ asOf: '2024-06-02' });
    expect(result.stage).toBe('first');
    expect(result.nextStage).toBe('second');
    expect(result.nextStageOn).toBe('2024-07-01');
  });

  it('reaches the second notice at thirty days', () => {
    expect(state({ asOf: '2024-06-30' }).stage).toBe('first');
    expect(state({ asOf: '2024-07-01' }).stage).toBe('second');
  });

  it('reaches the final notice at forty five days', () => {
    expect(state({ asOf: '2024-07-16' }).stage).toBe('final');
  });

  it('becomes eligible for shutoff at sixty days', () => {
    const result = state({ asOf: '2024-07-31' });
    expect(result.stage).toBe('shutoff');
    expect(result.shutoffEligible).toBe(true);
    expect(result.nextStage).toBeUndefined();
  });

  it('counts the days past due in the reason', () => {
    expect(state({ asOf: '2024-07-31' }).reasons[0]).toContain('60 days past');
  });
});

describe('climbing the health ladder', () => {
  it('reaches shutoff in half the time', () => {
    const result = state({ degree: 'health', asOf: '2024-07-01' });
    expect(result.stage).toBe('shutoff');
    expect(result.ladder.name).toBe('health hazard');
  });

  it('is still only at the second notice where the standard ladder has not moved', () => {
    expect(state({ degree: 'health', asOf: '2024-06-17' }).stage).toBe('second');
    expect(state({ asOf: '2024-06-17' }).stage).toBe('first');
  });
});

describe('a variance application', () => {
  it('holds the ladder on a pollutional hazard', () => {
    const result = state({ asOf: '2024-08-30', varianceApplicationPending: true });
    expect(result.held).toBe(true);
    expect(result.stage).toBe('first');
    expect(result.shutoffEligible).toBe(false);
    expect(result.reasons[0]).toContain('variance');
  });

  it('does not hold it on a health hazard', () => {
    const result = state({ degree: 'health', asOf: '2024-08-30', varianceApplicationPending: true });
    expect(result.held).toBe(false);
    expect(result.stage).toBe('shutoff');
    expect(result.reasons[0]).toContain('does not hold the ladder');
  });

  it('does not hold anything before the due date', () => {
    const result = state({ asOf: '2024-05-01', varianceApplicationPending: true });
    expect(result.held).toBe(false);
    expect(result.stage).toBe('none');
  });
});

describe('the schedule and the ordering', () => {
  it('lays the whole ladder out on dates', () => {
    expect(noticeSchedule('2024-06-01', STANDARD_LADDER)).toEqual([
      { stage: 'first', on: '2024-06-01' },
      { stage: 'second', on: '2024-07-01' },
      { stage: 'final', on: '2024-07-16' },
      { stage: 'shutoff', on: '2024-07-31' },
    ]);
  });

  it('ranks the stages so two connections can be sorted', () => {
    expect(stageRank('none')).toBe(0);
    expect(stageRank('shutoff')).toBe(4);
    expect(stageRank('final')).toBeGreaterThan(stageRank('second'));
  });

  it('takes a ladder the caller hands it', () => {
    const short = { name: 'emergency', rungs: [{ stage: 'shutoff' as const, afterDays: 1 }] };
    const result = state({ asOf: '2024-06-03', ladder: short });
    expect(result.stage).toBe('shutoff');
    expect(result.ladder.name).toBe('emergency');
  });
});

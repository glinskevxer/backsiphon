/**
 * The notice ladder.
 *
 * Once a test is past due the office starts writing letters, and the letters
 * come on a fixed ladder so that nobody has to argue about whether a customer
 * was given a fair run at it. A health hazard climbs the same ladder in half
 * the time, and a pending variance application holds the ladder still only
 * where the water on the other side is a pollutant.
 */

import { addDays, daysBetween, type CivilDate } from '../util/dates';
import type { HazardDegree } from './hazard';

export type NoticeStage = 'none' | 'first' | 'second' | 'final' | 'shutoff';

export interface LadderRung {
  readonly stage: Exclude<NoticeStage, 'none'>;
  /** Days after the due date this rung is reached. */
  readonly afterDays: number;
}

export interface NoticeLadder {
  readonly name: string;
  readonly rungs: ReadonlyArray<LadderRung>;
}

export const STANDARD_LADDER: NoticeLadder = {
  name: 'standard',
  rungs: [
    { stage: 'first', afterDays: 0 },
    { stage: 'second', afterDays: 30 },
    { stage: 'final', afterDays: 45 },
    { stage: 'shutoff', afterDays: 60 },
  ],
};

export const HEALTH_LADDER: NoticeLadder = {
  name: 'health hazard',
  rungs: [
    { stage: 'first', afterDays: 0 },
    { stage: 'second', afterDays: 15 },
    { stage: 'final', afterDays: 25 },
    { stage: 'shutoff', afterDays: 30 },
  ],
};

export function ladderFor(degree: HazardDegree): NoticeLadder {
  return degree === 'health' ? HEALTH_LADDER : STANDARD_LADDER;
}

export interface DelinquencyInput {
  readonly due: CivilDate;
  readonly asOf: CivilDate;
  readonly degree: HazardDegree;
  /** True while the customer has an application in front of the office. */
  readonly varianceApplicationPending: boolean;
  readonly ladder?: NoticeLadder;
}

export interface DelinquencyState {
  readonly stage: NoticeStage;
  readonly daysPastDue: number;
  readonly ladder: NoticeLadder;
  readonly nextStage?: NoticeStage;
  readonly nextStageOn?: CivilDate;
  readonly shutoffEligible: boolean;
  /** True where the ladder is being held still rather than climbed. */
  readonly held: boolean;
  readonly reasons: ReadonlyArray<string>;
}

export function delinquencyState(input: DelinquencyInput): DelinquencyState {
  const ladder = input.ladder ?? ladderFor(input.degree);
  const daysPastDue = Math.max(0, daysBetween(input.due, input.asOf));
  const reasons: string[] = [];

  if (input.asOf <= input.due) {
    return {
      stage: 'none',
      daysPastDue: 0,
      ladder,
      nextStage: 'first',
      nextStageOn: input.due,
      shutoffEligible: false,
      held: false,
      reasons: ['the test is not past due'],
    };
  }

  const held = input.varianceApplicationPending && input.degree !== 'health';
  if (held) {
    reasons.push('an application for a variance is in front of the office');
    return {
      stage: 'first',
      daysPastDue,
      ladder,
      shutoffEligible: false,
      held: true,
      reasons,
    };
  }

  if (input.varianceApplicationPending) {
    reasons.push('a variance application does not hold the ladder on a health hazard');
  }

  const reached = ladder.rungs.filter((rung) => daysPastDue >= rung.afterDays);
  const current = reached[reached.length - 1];
  const stage: NoticeStage = current?.stage ?? 'none';
  const next = ladder.rungs.find((rung) => daysPastDue < rung.afterDays);

  reasons.push(`${daysPastDue} days past the due date of ${input.due} on the ${ladder.name} ladder`);

  return {
    stage,
    daysPastDue,
    ladder,
    ...(next === undefined ? {} : { nextStage: next.stage, nextStageOn: addDays(input.due, next.afterDays) }),
    shutoffEligible: stage === 'shutoff',
    held: false,
    reasons,
  };
}

/** Every rung with the date it falls on, for a letter run or a diary. */
export function noticeSchedule(
  due: CivilDate,
  ladder: NoticeLadder,
): Array<{ stage: NoticeStage; on: CivilDate }> {
  return ladder.rungs.map((rung) => ({ stage: rung.stage, on: addDays(due, rung.afterDays) }));
}

/** The rung a stage sits on, for comparing two connections. */
export function stageRank(stage: NoticeStage): number {
  const order: NoticeStage[] = ['none', 'first', 'second', 'final', 'shutoff'];
  return order.indexOf(stage);
}

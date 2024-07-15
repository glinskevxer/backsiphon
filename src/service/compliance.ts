/**
 * Where a connection stands.
 *
 * Protection is one half of it and the calendar is the other. An assembly can
 * be exactly the right class and still be a year late, and an assembly tested
 * last week can be the wrong class entirely. This module puts the two together
 * and answers the question a clerk actually asks, which is whether to send a
 * letter today.
 */

import { type CivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import { isTestable } from '../domain/assembly';
import { nextTestDue, retestDue, type DueDate } from '../domain/cycle';
import { delinquencyState, stageRank, type DelinquencyState } from '../domain/delinquency';
import type { InstalledAssembly, ProtectionScope, Urgency } from '../domain/deficiency';
import { lastFailingTest, lastPassingTest, type StoredReport } from '../storage/repositories/reports';
import { pendingVariance } from '../storage/repositories/variances';
import { findConnection } from '../storage/repositories/connections';
import { protectionStatus, worseUrgency, type ProtectionPoint, type ProtectionStatus } from './protection';
import type { Register } from './register';

export type Standing =
  | 'compliant'
  | 'not_yet_due'
  | 'due'
  | 'overdue'
  | 'deficient'
  | 'shutoff_eligible';

export interface PointCompliance {
  readonly scope: ProtectionScope;
  readonly point: ProtectionPoint;
  readonly assembly?: InstalledAssembly;
  readonly due?: DueDate;
  readonly lastPassing?: StoredReport;
  readonly lastFailing?: StoredReport;
  readonly delinquency?: DelinquencyState;
}

export interface ComplianceStatus {
  readonly connectionId: string;
  readonly asOf: CivilDate;
  readonly protection: ProtectionStatus;
  readonly containment: PointCompliance;
  readonly isolation: PointCompliance;
  readonly standing: Standing;
  readonly urgency: Urgency;
  readonly shutoffEligible: boolean;
  readonly reasons: ReadonlyArray<string>;
}

export function complianceFor(
  register: Register,
  connectionId: string,
  asOf: CivilDate,
): Result<ComplianceStatus, string> {
  const connection = findConnection(register.db, connectionId);
  if (connection === undefined) {
    return err(`there is no connection with the id ${connectionId}`);
  }
  const protection = protectionStatus(register, connectionId, asOf);
  if (!protection.ok) {
    return err(protection.error);
  }

  const pending = pendingVariance(register.db, connectionId) !== undefined;
  const containment = pointCompliance(register, protection.value, 'containment', asOf, pending);
  const isolation = pointCompliance(register, protection.value, 'isolation', asOf, pending);

  const reasons: string[] = [];
  const standing = standingOf(protection.value, containment, isolation, asOf, reasons);
  const shutoffEligible =
    (containment.delinquency?.shutoffEligible ?? false) ||
    (isolation.delinquency?.shutoffEligible ?? false);

  return ok({
    connectionId,
    asOf,
    protection: protection.value,
    containment,
    isolation,
    standing,
    urgency: protection.value.urgency,
    shutoffEligible,
    reasons,
  });
}

function pointCompliance(
  register: Register,
  protection: ProtectionStatus,
  scope: ProtectionScope,
  asOf: CivilDate,
  variancePending: boolean,
): PointCompliance {
  const point = scope === 'containment' ? protection.containment : protection.isolation;
  const assembly = point.installed;
  if (assembly === undefined || !isTestable(assembly.assemblyClass)) {
    return { scope, point, ...(assembly === undefined ? {} : { assembly }) };
  }

  const passing = lastPassingTest(register.db, assembly.assemblyId, asOf);
  const failing = lastFailingTest(register.db, assembly.assemblyId, asOf);
  const due = dueDateFor(register, protection, assembly, passing, failing, asOf);
  const delinquency = delinquencyState({
    due: due.due,
    asOf,
    degree: protection.survey.containmentDegree,
    varianceApplicationPending: variancePending,
  });

  return {
    scope,
    point,
    assembly,
    due,
    ...(passing === undefined ? {} : { lastPassing: passing }),
    ...(failing === undefined ? {} : { lastFailing: failing }),
    delinquency,
  };
}

/**
 * A failed test replaces the anniversary with a repair window while it is
 * open. The window closes when a passing test lands after the failure, not
 * when the days run out, so an assembly nobody came back to stays on the
 * repair clock rather than falling back onto a comfortable annual one.
 */
function dueDateFor(
  register: Register,
  protection: ProtectionStatus,
  assembly: InstalledAssembly,
  passing: StoredReport | undefined,
  failing: StoredReport | undefined,
  asOf: CivilDate,
): DueDate {
  const repairOpen =
    failing !== undefined &&
    failing.report.testedOn <= asOf &&
    (passing === undefined || passing.report.testedOn < failing.report.testedOn);
  if (repairOpen && failing !== undefined) {
    return retestDue(failing.report.testedOn, register.calendar, register.policy.cycle);
  }
  return nextTestDue({
    installedOn: assembly.installedOn,
    ...(passing === undefined ? {} : { lastPassingTestOn: passing.report.testedOn }),
    containmentDegree: protection.survey.containmentDegree,
    premiseUseCode: protection.survey.premiseUseCode,
    policy: register.policy.cycle,
  });
}

function standingOf(
  protection: ProtectionStatus,
  containment: PointCompliance,
  isolation: PointCompliance,
  asOf: CivilDate,
  reasons: string[],
): Standing {
  const points = [containment, isolation];

  if (points.some((point) => point.delinquency?.shutoffEligible === true)) {
    reasons.push('the notice ladder has run out');
    return 'shutoff_eligible';
  }

  const deficient = points.filter(
    (point) => point.point.deficiency.kind !== 'none' && point.point.deficiency.kind !== 'not_required',
  );
  const overdue = points.filter(
    (point) => point.due !== undefined && asOf > point.due.due,
  );

  if (deficient.length > 0 && protection.urgency === 'immediate') {
    for (const point of deficient) {
      reasons.push(`${point.scope}: ${point.point.deficiency.reasons[0] ?? 'deficient'}`);
    }
    return 'deficient';
  }
  if (overdue.length > 0) {
    for (const point of overdue) {
      reasons.push(`${point.scope}: test was due ${point.due?.due ?? 'earlier'}`);
    }
    return 'overdue';
  }
  if (deficient.length > 0) {
    for (const point of deficient) {
      reasons.push(`${point.scope}: ${point.point.deficiency.reasons[0] ?? 'deficient'}`);
    }
    return 'deficient';
  }
  if (points.every((point) => point.due === undefined)) {
    reasons.push('nothing here is on a test cycle');
    return 'not_yet_due';
  }
  reasons.push('every point is the right class and tested inside its cycle');
  return 'compliant';
}

/** The worst standing of a set, for a route sheet or a summary line. */
export function worstStanding(statuses: ReadonlyArray<ComplianceStatus>): Standing {
  const order: Standing[] = [
    'compliant',
    'not_yet_due',
    'due',
    'deficient',
    'overdue',
    'shutoff_eligible',
  ];
  let worst: Standing = 'compliant';
  for (const status of statuses) {
    if (order.indexOf(status.standing) > order.indexOf(worst)) {
      worst = status.standing;
    }
  }
  return worst;
}

export function worstUrgencyOf(statuses: ReadonlyArray<ComplianceStatus>): Urgency {
  return statuses.reduce<Urgency>((worst, status) => worseUrgency(worst, status.urgency), 'none');
}

/** The highest notice rung reached at either point, for sorting a work list. */
export function noticeRank(status: ComplianceStatus): number {
  return Math.max(
    stageRank(status.containment.delinquency?.stage ?? 'none'),
    stageRank(status.isolation.delinquency?.stage ?? 'none'),
  );
}

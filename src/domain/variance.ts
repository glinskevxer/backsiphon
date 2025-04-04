/**
 * Variances.
 *
 * A variance is the office writing down that it will take something other than
 * what the rule asks for, on this connection, for a while, on conditions. It
 * rewrites the required class and it does nothing else. It does not move the
 * test date, it does not pause the notice ladder once the letters have
 * started, and it does not survive a survey that finds the premise is worse
 * than it was when the variance was granted.
 */

import { rangeContains, type CivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import { satisfies, type AssemblyClass } from './assembly';
import { degreeRank, type HazardDegree } from './hazard';
import type { RequiredProtection } from './requirement';

export type VarianceDecision = 'granted' | 'denied';

export type VarianceStatus =
  | 'pending'
  | 'denied'
  | 'in_effect'
  | 'not_yet_effective'
  | 'expired'
  | 'revoked'
  | 'void_degree_raised';

export interface Variance {
  readonly varianceId: string;
  readonly connectionId: string;
  readonly appliedOn: CivilDate;
  readonly decision?: VarianceDecision;
  readonly decidedOn?: CivilDate;
  /** The class the office will take instead of the one the rule asks for. */
  readonly acceptedClass: AssemblyClass;
  /** The containment degree on the day it was granted. */
  readonly grantedAgainstDegree: HazardDegree;
  readonly effectiveFrom?: CivilDate;
  readonly expiresOn?: CivilDate;
  readonly conditions: ReadonlyArray<string>;
  readonly revokedOn?: CivilDate;
  readonly note?: string;
}

export function varianceStatus(
  variance: Variance,
  asOf: CivilDate,
  currentDegree: HazardDegree,
): VarianceStatus {
  if (variance.decision === undefined) {
    return asOf >= variance.appliedOn ? 'pending' : 'pending';
  }
  if (variance.decision === 'denied') {
    return 'denied';
  }
  if (variance.revokedOn !== undefined && variance.revokedOn <= asOf) {
    return 'revoked';
  }
  if (degreeRank(currentDegree) > degreeRank(variance.grantedAgainstDegree)) {
    return 'void_degree_raised';
  }
  const from = variance.effectiveFrom ?? variance.decidedOn ?? variance.appliedOn;
  if (asOf < from) {
    return 'not_yet_effective';
  }
  return rangeContains(
    { from, ...(variance.expiresOn === undefined ? {} : { to: variance.expiresOn }) },
    asOf,
  )
    ? 'in_effect'
    : 'expired';
}

export function isPending(variance: Variance, asOf: CivilDate): boolean {
  return variance.decision === undefined && asOf >= variance.appliedOn;
}

/**
 * The office will not write a variance against an air gap. There is nothing to
 * trade: every mechanical class is a different kind of protection rather than
 * a slightly weaker one.
 */
export function grantAllowed(
  required: RequiredProtection,
  acceptedClass: AssemblyClass,
): Result<AssemblyClass, string> {
  if (required.kind === 'none') {
    return err('there is no requirement here to write a variance against');
  }
  if (required.assemblyClass === 'AG') {
    return err('an air gap requirement cannot be varied, nothing else breaks the connection');
  }
  if (satisfies(acceptedClass, required.assemblyClass)) {
    return err(
      `a ${acceptedClass} already answers the requirement for a ${required.assemblyClass}, ` +
        'so no variance is needed',
    );
  }
  return ok(acceptedClass);
}

export interface VariedRequirement {
  readonly protection: RequiredProtection;
  readonly variedBy?: string;
  readonly status?: VarianceStatus;
}

/**
 * Rewrite a requirement where a variance is in effect. Everything else about
 * the connection is measured against whatever comes back from here, which is
 * the whole point: the variance changes the target, not the rules that read it.
 */
export function applyVariance(
  required: RequiredProtection,
  variance: Variance | undefined,
  asOf: CivilDate,
  currentDegree: HazardDegree,
): VariedRequirement {
  if (variance === undefined || required.kind === 'none') {
    return { protection: required };
  }
  const status = varianceStatus(variance, asOf, currentDegree);
  if (status !== 'in_effect') {
    return { protection: required, variedBy: variance.varianceId, status };
  }
  if (required.assemblyClass === 'AG') {
    return { protection: required, variedBy: variance.varianceId, status };
  }
  return {
    protection: {
      kind: 'required',
      assemblyClass: variance.acceptedClass,
      reasons: [
        ...required.reasons,
        `variance ${variance.varianceId} lets the office take a ${variance.acceptedClass} here` +
          (variance.conditions.length === 0 ? '' : ` on ${variance.conditions.length} conditions`),
      ],
    },
    variedBy: variance.varianceId,
    status,
  };
}

export function conditionsOf(variance: Variance): string[] {
  return [...variance.conditions];
}

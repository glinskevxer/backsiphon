/**
 * Applying for a variance, and deciding one.
 *
 * The office will not write a variance in the abstract. It is written against
 * the requirement standing on the day, so this reads the protection status
 * first and refuses an application that asks for something the rules already
 * allow, or something no variance can give.
 */

import type { CivilDate } from '../util/dates';
import { VARIANCE_ID } from '../util/ids';
import { err, ok, type Result } from '../util/result';
import type { AssemblyClass } from '../domain/assembly';
import type { ProtectionScope } from '../domain/deficiency';
import { grantAllowed, type Variance } from '../domain/variance';
import { withTransaction } from '../storage/db';
import { appendEvent } from '../storage/repositories/events';
import {
  denyVariance,
  findVariance,
  grantVariance,
  insertVariance,
  pendingVariance,
  revokeVariance,
} from '../storage/repositories/variances';
import { protectionStatus } from './protection';
import { mintId, type Register } from './register';

export interface VarianceApplication {
  readonly connectionId: string;
  readonly appliedOn: CivilDate;
  readonly acceptedClass: AssemblyClass;
  readonly scope?: ProtectionScope;
  readonly note?: string;
}

export function applyForVariance(
  register: Register,
  application: VarianceApplication,
): Result<Variance, string> {
  const status = protectionStatus(register, application.connectionId, application.appliedOn);
  if (!status.ok) {
    return err(status.error);
  }
  const scope = application.scope ?? 'containment';
  const point = scope === 'containment' ? status.value.containment : status.value.isolation;
  const allowed = grantAllowed(point.required, application.acceptedClass);
  if (!allowed.ok) {
    return err(allowed.error);
  }
  if (pendingVariance(register.db, application.connectionId) !== undefined) {
    return err(`the connection ${application.connectionId} already has an application pending`);
  }

  const variance: Variance = {
    varianceId: mintId(register, VARIANCE_ID, 'variances', 'variance_id'),
    connectionId: application.connectionId,
    appliedOn: application.appliedOn,
    acceptedClass: application.acceptedClass,
    grantedAgainstDegree: status.value.survey.containmentDegree,
    conditions: [],
    ...(application.note === undefined ? {} : { note: application.note }),
  };

  return withTransaction(register.db, () => {
    const written = insertVariance(register.db, variance);
    if (!written.ok) {
      return written;
    }
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'variance_applied',
      subjectKind: 'variance',
      subjectId: variance.varianceId,
      detail:
        `${application.connectionId} asks to keep a ${variance.acceptedClass} ` +
        `where a ${point.requiredClass ?? 'nothing'} is required`,
    });
    return ok(variance);
  });
}

export interface GrantDecision {
  readonly decidedOn: CivilDate;
  readonly effectiveFrom: CivilDate;
  readonly expiresOn?: CivilDate;
  readonly conditions: ReadonlyArray<string>;
  readonly note?: string;
}

export function decideGrant(
  register: Register,
  varianceId: string,
  decision: GrantDecision,
): Result<Variance, string> {
  const existing = findVariance(register.db, varianceId);
  if (existing === undefined) {
    return err(`there is no variance with the id ${varianceId}`);
  }
  if (decision.conditions.length === 0) {
    return err('a variance is granted on conditions, write at least one down');
  }
  return withTransaction(register.db, () => {
    const granted = grantVariance(register.db, varianceId, {
      decidedOn: decision.decidedOn,
      effectiveFrom: decision.effectiveFrom,
      ...(decision.expiresOn === undefined ? {} : { expiresOn: decision.expiresOn }),
      conditions: decision.conditions,
      ...(decision.note === undefined ? {} : { note: decision.note }),
    });
    if (!granted.ok) {
      return granted;
    }
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'variance_granted',
      subjectKind: 'variance',
      subjectId: varianceId,
      detail:
        `a ${granted.value.acceptedClass} is accepted from ${decision.effectiveFrom} ` +
        `to ${decision.expiresOn ?? 'no end date'} on ${decision.conditions.length} conditions`,
    });
    return granted;
  });
}

export function decideRefusal(
  register: Register,
  varianceId: string,
  decidedOn: CivilDate,
  reason: string,
): Result<Variance, string> {
  return withTransaction(register.db, () => {
    const denied = denyVariance(register.db, varianceId, decidedOn, reason);
    if (!denied.ok) {
      return denied;
    }
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'variance_denied',
      subjectKind: 'variance',
      subjectId: varianceId,
      detail: reason,
    });
    return denied;
  });
}

export function revoke(
  register: Register,
  varianceId: string,
  on: CivilDate,
  reason: string,
): Result<Variance, string> {
  if (reason.trim() === '') {
    return err('revoking a variance has to say why');
  }
  return withTransaction(register.db, () => {
    const revoked = revokeVariance(register.db, varianceId, on, reason);
    if (!revoked.ok) {
      return revoked;
    }
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'variance_revoked',
      subjectKind: 'variance',
      subjectId: varianceId,
      detail: `${on}: ${reason}`,
    });
    return revoked;
  });
}

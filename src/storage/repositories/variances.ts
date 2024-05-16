/**
 * Variance applications and the decisions on them.
 *
 * An application is stored the moment it arrives, before anybody has decided
 * anything, because the fact that one is pending changes what the notice
 * ladder does. The decision is written onto the same row rather than into a
 * second table: there is only ever one decision, and a reversal is a
 * revocation with its own date.
 */

import type { CivilDate } from '../../util/dates';
import { err, ok, type Result } from '../../util/result';
import type { AssemblyClass } from '../../domain/assembly';
import type { HazardDegree } from '../../domain/hazard';
import type { Variance, VarianceDecision } from '../../domain/variance';
import { execute, selectAll, selectOne, type Database } from '../db';
import { describeConstraintError, toNullable } from '../rows';

interface VarianceRow {
  variance_id: string;
  connection_id: string;
  applied_on: string;
  decision: VarianceDecision | null;
  decided_on: string | null;
  accepted_class: AssemblyClass;
  granted_against_degree: HazardDegree;
  effective_from: string | null;
  expires_on: string | null;
  conditions: string;
  revoked_on: string | null;
  note: string | null;
}

const COLUMNS = `variance_id, connection_id, applied_on, decision, decided_on, accepted_class,
  granted_against_degree, effective_from, expires_on, conditions, revoked_on, note`;

/** Conditions are one to a line, because clerks paste sentences into them. */
const CONDITION_SEPARATOR = '|';

function toRecord(row: VarianceRow): Variance {
  return {
    varianceId: row.variance_id,
    connectionId: row.connection_id,
    appliedOn: row.applied_on,
    ...(row.decision === null ? {} : { decision: row.decision }),
    ...(row.decided_on === null ? {} : { decidedOn: row.decided_on }),
    acceptedClass: row.accepted_class,
    grantedAgainstDegree: row.granted_against_degree,
    ...(row.effective_from === null ? {} : { effectiveFrom: row.effective_from }),
    ...(row.expires_on === null ? {} : { expiresOn: row.expires_on }),
    conditions: splitConditions(row.conditions),
    ...(row.revoked_on === null ? {} : { revokedOn: row.revoked_on }),
    ...(row.note === null ? {} : { note: row.note }),
  };
}

function splitConditions(value: string): string[] {
  return value
    .split(CONDITION_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

export function insertVariance(db: Database, variance: Variance): Result<Variance, string> {
  if (variance.conditions.some((condition) => condition.includes(CONDITION_SEPARATOR))) {
    return err(`a condition cannot contain the ${CONDITION_SEPARATOR} character`);
  }
  try {
    execute(db, `insert into variances (${COLUMNS}) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      variance.varianceId,
      variance.connectionId,
      variance.appliedOn,
      toNullable(variance.decision),
      toNullable(variance.decidedOn),
      variance.acceptedClass,
      variance.grantedAgainstDegree,
      toNullable(variance.effectiveFrom),
      toNullable(variance.expiresOn),
      variance.conditions.join(CONDITION_SEPARATOR),
      toNullable(variance.revokedOn),
      toNullable(variance.note),
    ]);
    return ok(variance);
  } catch (error) {
    return err(describeConstraintError(error, `the variance ${variance.varianceId}`));
  }
}

export function findVariance(db: Database, varianceId: string): Variance | undefined {
  const row = selectOne<VarianceRow>(db, `select ${COLUMNS} from variances where variance_id = ?`, [
    varianceId,
  ]);
  return row === undefined ? undefined : toRecord(row);
}

export function variancesForConnection(db: Database, connectionId: string): Variance[] {
  return selectAll<VarianceRow>(
    db,
    `select ${COLUMNS} from variances where connection_id = ?
     order by applied_on desc, variance_id desc`,
    [connectionId],
  ).map(toRecord);
}

export function pendingVariance(db: Database, connectionId: string): Variance | undefined {
  const row = selectOne<VarianceRow>(
    db,
    `select ${COLUMNS} from variances where connection_id = ? and decision is null
     order by applied_on limit 1`,
    [connectionId],
  );
  return row === undefined ? undefined : toRecord(row);
}

export interface Grant {
  readonly decidedOn: CivilDate;
  readonly effectiveFrom: CivilDate;
  readonly expiresOn?: CivilDate;
  readonly conditions: ReadonlyArray<string>;
  readonly note?: string;
}

export function grantVariance(
  db: Database,
  varianceId: string,
  grant: Grant,
): Result<Variance, string> {
  const variance = findVariance(db, varianceId);
  if (variance === undefined) {
    return err(`there is no variance with the id ${varianceId}`);
  }
  if (variance.decision !== undefined) {
    return err(`the variance ${varianceId} was already ${variance.decision}`);
  }
  if (grant.decidedOn < variance.appliedOn) {
    return err(`a decision cannot predate the application of ${variance.appliedOn}`);
  }
  if (grant.expiresOn !== undefined && grant.expiresOn <= grant.effectiveFrom) {
    return err(`a variance cannot expire on ${grant.expiresOn}, it starts ${grant.effectiveFrom}`);
  }
  execute(
    db,
    `update variances set decision = 'granted', decided_on = ?, effective_from = ?,
       expires_on = ?, conditions = ?, note = ? where variance_id = ?`,
    [
      grant.decidedOn,
      grant.effectiveFrom,
      toNullable(grant.expiresOn),
      grant.conditions.join(CONDITION_SEPARATOR),
      toNullable(grant.note),
      varianceId,
    ],
  );
  const updated = findVariance(db, varianceId);
  return updated === undefined ? err(`the variance ${varianceId} vanished`) : ok(updated);
}

export function denyVariance(
  db: Database,
  varianceId: string,
  decidedOn: CivilDate,
  note: string,
): Result<Variance, string> {
  const variance = findVariance(db, varianceId);
  if (variance === undefined) {
    return err(`there is no variance with the id ${varianceId}`);
  }
  if (variance.decision !== undefined) {
    return err(`the variance ${varianceId} was already ${variance.decision}`);
  }
  if (note.trim() === '') {
    return err('a refusal has to say why');
  }
  execute(
    db,
    "update variances set decision = 'denied', decided_on = ?, note = ? where variance_id = ?",
    [decidedOn, note, varianceId],
  );
  return ok({ ...variance, decision: 'denied', decidedOn, note });
}

export function revokeVariance(
  db: Database,
  varianceId: string,
  on: CivilDate,
  note: string,
): Result<Variance, string> {
  const variance = findVariance(db, varianceId);
  if (variance === undefined) {
    return err(`there is no variance with the id ${varianceId}`);
  }
  if (variance.decision !== 'granted') {
    return err(`the variance ${varianceId} was never granted, so there is nothing to revoke`);
  }
  if (variance.revokedOn !== undefined) {
    return err(`the variance ${varianceId} was revoked on ${variance.revokedOn} already`);
  }
  execute(db, 'update variances set revoked_on = ?, note = ? where variance_id = ?', [
    on,
    note,
    varianceId,
  ]);
  return ok({ ...variance, revokedOn: on, note });
}

export function conditionCount(db: Database, varianceId: string): number {
  const row = selectOne<{ conditions: string }>(
    db,
    'select conditions from variances where variance_id = ?',
    [varianceId],
  );
  return row === undefined ? 0 : splitConditions(row.conditions).length;
}

export function listGranted(db: Database, asOf: CivilDate): Variance[] {
  return selectAll<VarianceRow>(
    db,
    `select ${COLUMNS} from variances
     where decision = 'granted'
       and (effective_from is null or effective_from <= ?)
       and (expires_on is null or expires_on >= ?)
       and (revoked_on is null or revoked_on > ?)
     order by connection_id`,
    [asOf, asOf, asOf],
  ).map(toRecord);
}

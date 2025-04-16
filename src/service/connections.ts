/**
 * Opening, changing and closing a service connection.
 *
 * The repository will take anything the schema allows. This layer is where the
 * program rules live: that the premise use has to be one the taxonomy knows,
 * that a fire service is not metered by the purveyor unless somebody says so,
 * and that every one of these leaves a line on the trail.
 */

import { isCivilDate, type CivilDate } from '../util/dates';
import { CONNECTION_ID } from '../util/ids';
import { err, ok, type Result } from '../util/result';
import { premiseUseByCode } from '../domain/premise';
import { appendEvent } from '../storage/repositories/events';
import {
  disconnect,
  findConnection,
  findConnectionByAccount,
  insertConnection,
  updateConnection,
  type ConnectionRecord,
} from '../storage/repositories/connections';
import { execute, withTransaction } from '../storage/db';
import { describeConstraintError } from '../storage/rows';
import { mintId, type Register } from './register';

/**
 * What the office assumes about a riser nobody has measured: high enough for a
 * vacuum breaker, outdoors, with a valve below it and under pressure all day.
 * The last two are the conservative answer, the first is not, so a survey that
 * finds a low riser has to say so.
 */
export const DEFAULT_OUTLET_ELEVATION_INCHES = 12;

export interface NewConnection {
  readonly accountNumber: string;
  readonly premiseName: string;
  readonly premiseAddress: string;
  readonly premiseUseCode: string;
  readonly serviceSizeInches: number;
  readonly fireService: boolean;
  readonly purveyorMetered: boolean;
  readonly connectedOn: CivilDate;
  readonly route?: string;
  readonly note?: string;
  readonly outletElevationInches?: number;
  readonly indoorRiser?: boolean;
  readonly downstreamShutoff?: boolean;
  readonly continuousPressureHours?: number;
}

export function openConnection(
  register: Register,
  input: NewConnection,
): Result<ConnectionRecord, string> {
  const use = premiseUseByCode(input.premiseUseCode);
  if (!use.ok) {
    return err(use.error);
  }
  if (!isCivilDate(input.connectedOn)) {
    return err(`"${input.connectedOn}" is not a date of the form YYYY-MM-DD`);
  }
  if (input.accountNumber.trim() === '') {
    return err('a connection has to carry an account number');
  }
  if (input.serviceSizeInches <= 0) {
    return err('a service size has to be a positive number of inches');
  }

  const record: ConnectionRecord = {
    connectionId: mintId(register, CONNECTION_ID, 'service_connections', 'connection_id'),
    accountNumber: input.accountNumber.trim(),
    premiseName: input.premiseName.trim(),
    premiseAddress: input.premiseAddress.trim(),
    premiseUseCode: input.premiseUseCode,
    serviceSizeInches: input.serviceSizeInches,
    fireService: input.fireService,
    purveyorMetered: input.purveyorMetered,
    connectedOn: input.connectedOn,
    route: input.route ?? 'unassigned',
    ...(input.note === undefined ? {} : { note: input.note }),
    outletElevationInches: input.outletElevationInches ?? DEFAULT_OUTLET_ELEVATION_INCHES,
    indoorRiser: input.indoorRiser ?? false,
    downstreamShutoff: input.downstreamShutoff ?? true,
    continuousPressureHours: input.continuousPressureHours ?? 24,
  };

  return withTransaction(register.db, () => {
    const written = insertConnection(register.db, record);
    if (!written.ok) {
      return written;
    }
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'connection_opened',
      subjectKind: 'connection',
      subjectId: record.connectionId,
      detail: `${record.premiseName} on ${record.premiseAddress}, ${use.value.label}`,
    });
    return ok(record);
  });
}

/**
 * A change of tenant. The use code is the thing that carries a categorical
 * hazard degree, so this is a bigger event than it looks: the assessment on
 * file is now against a premise that is not there any more, and the caller is
 * told to walk it again.
 */
export interface UseChange {
  readonly premiseUseCode: string;
  readonly premiseName?: string;
  readonly on: CivilDate;
  readonly note?: string;
}

export interface UseChangeOutcome {
  readonly connection: ConnectionRecord;
  readonly resurveyNeeded: boolean;
  readonly previousUseCode: string;
}

export function changePremiseUse(
  register: Register,
  connectionId: string,
  change: UseChange,
): Result<UseChangeOutcome, string> {
  const existing = findConnection(register.db, connectionId);
  if (existing === undefined) {
    return err(`there is no connection with the id ${connectionId}`);
  }
  const use = premiseUseByCode(change.premiseUseCode);
  if (!use.ok) {
    return err(use.error);
  }
  if (existing.premiseUseCode === change.premiseUseCode) {
    return err(`the connection ${connectionId} is already a ${change.premiseUseCode}`);
  }

  return withTransaction(register.db, () => {
    const updated = updateConnection(register.db, connectionId, {
      premiseUseCode: change.premiseUseCode,
      ...(change.premiseName === undefined ? {} : { premiseName: change.premiseName }),
      ...(change.note === undefined ? {} : { note: change.note }),
    });
    if (!updated.ok) {
      return updated;
    }
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'premise_use_changed',
      subjectKind: 'connection',
      subjectId: connectionId,
      detail: `${existing.premiseUseCode} became ${change.premiseUseCode} on ${change.on}`,
    });
    return ok({
      connection: updated.value,
      resurveyNeeded: true,
      previousUseCode: existing.premiseUseCode,
    });
  });
}

export interface Renumber {
  readonly accountNumber: string;
  readonly on: CivilDate;
  readonly reason: string;
}

/**
 * The billing system renumbers an account. Nothing about the water changes:
 * the same pipe, the same premise, the same assemblies and the same test
 * history. Only the number the office says on the telephone moves, so this is
 * a change to one column and a line on the trail, and it deliberately does not
 * touch anything else.
 */
export function renumberAccount(
  register: Register,
  connectionId: string,
  change: Renumber,
): Result<ConnectionRecord, string> {
  const existing = findConnection(register.db, connectionId);
  if (existing === undefined) {
    return err(`there is no connection with the id ${connectionId}`);
  }
  const wanted = change.accountNumber.trim();
  if (wanted === '') {
    return err('a connection has to carry an account number');
  }
  if (wanted === existing.accountNumber) {
    return err(`the connection ${connectionId} is already on account ${wanted}`);
  }
  if (change.reason.trim() === '') {
    return err('renumbering an account has to say why');
  }
  const clash = findConnectionByAccount(register.db, wanted);
  if (clash !== undefined) {
    return err(`the account ${wanted} is already against ${clash.connectionId}`);
  }

  return withTransaction(register.db, () => {
    try {
      execute(
        register.db,
        'update service_connections set account_number = ? where connection_id = ?',
        [wanted, connectionId],
      );
    } catch (error) {
      return err(describeConstraintError(error, `the account ${wanted}`));
    }
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'account_renumbered',
      subjectKind: 'connection',
      subjectId: connectionId,
      detail: `${existing.accountNumber} became ${wanted} on ${change.on}: ${change.reason}`,
    });
    return ok({ ...existing, accountNumber: wanted });
  });
}

export function closeConnection(
  register: Register,
  connectionId: string,
  on: CivilDate,
  reason: string,
): Result<ConnectionRecord, string> {
  if (reason.trim() === '') {
    return err('closing a connection has to say why');
  }
  return withTransaction(register.db, () => {
    const closed = disconnect(register.db, connectionId, on);
    if (!closed.ok) {
      return closed;
    }
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'connection_closed',
      subjectKind: 'connection',
      subjectId: connectionId,
      detail: `${on}: ${reason}`,
    });
    return closed;
  });
}

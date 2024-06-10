/**
 * Service connections.
 *
 * The connection is the thing the purveyor owns a relationship with. Premises
 * change hands, assemblies come and go, and the account number is what
 * everybody in the office actually says out loud, so it is unique and it is
 * indexed.
 */

import type { CivilDate } from '../../util/dates';
import { err, ok, type Result } from '../../util/result';
import { execute, selectAll, selectOne, type Database } from '../db';
import { describeConstraintError, fromFlag, fromNullable, toFlag, toNullable } from '../rows';

export interface ConnectionRecord {
  readonly connectionId: string;
  readonly accountNumber: string;
  readonly premiseName: string;
  readonly premiseAddress: string;
  readonly premiseUseCode: string;
  readonly serviceSizeInches: number;
  readonly fireService: boolean;
  readonly purveyorMetered: boolean;
  readonly connectedOn: CivilDate;
  readonly disconnectedOn?: CivilDate;
  readonly route: string;
  readonly note?: string;
  /** Height of the isolation point above the highest outlet below it. */
  readonly outletElevationInches: number;
  readonly indoorRiser: boolean;
  readonly downstreamShutoff: boolean;
  readonly continuousPressureHours: number;
}

interface ConnectionRow {
  connection_id: string;
  account_number: string;
  premise_name: string;
  premise_address: string;
  premise_use_code: string;
  service_size_inches: number;
  fire_service: number;
  purveyor_metered: number;
  connected_on: string;
  disconnected_on: string | null;
  route: string;
  note: string | null;
  outlet_elevation_inches: number;
  indoor_riser: number;
  downstream_shutoff: number;
  continuous_pressure_hours: number;
}

const COLUMNS = `connection_id, account_number, premise_name, premise_address, premise_use_code,
  service_size_inches, fire_service, purveyor_metered, connected_on, disconnected_on, route, note,
  outlet_elevation_inches, indoor_riser, downstream_shutoff, continuous_pressure_hours`;

function toRecord(row: ConnectionRow): ConnectionRecord {
  return {
    connectionId: row.connection_id,
    accountNumber: row.account_number,
    premiseName: row.premise_name,
    premiseAddress: row.premise_address,
    premiseUseCode: row.premise_use_code,
    serviceSizeInches: row.service_size_inches,
    fireService: fromFlag(row.fire_service),
    purveyorMetered: fromFlag(row.purveyor_metered),
    connectedOn: row.connected_on,
    ...(row.disconnected_on === null ? {} : { disconnectedOn: row.disconnected_on }),
    route: row.route,
    ...(row.note === null ? {} : { note: row.note }),
    outletElevationInches: row.outlet_elevation_inches,
    indoorRiser: fromFlag(row.indoor_riser),
    downstreamShutoff: fromFlag(row.downstream_shutoff),
    continuousPressureHours: row.continuous_pressure_hours,
  };
}

export function insertConnection(
  db: Database,
  record: ConnectionRecord,
): Result<ConnectionRecord, string> {
  try {
    execute(
      db,
      `insert into service_connections (${COLUMNS})
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.connectionId,
        record.accountNumber,
        record.premiseName,
        record.premiseAddress,
        record.premiseUseCode,
        record.serviceSizeInches,
        toFlag(record.fireService),
        toFlag(record.purveyorMetered),
        record.connectedOn,
        toNullable(record.disconnectedOn),
        record.route,
        toNullable(record.note),
        record.outletElevationInches,
        toFlag(record.indoorRiser),
        toFlag(record.downstreamShutoff),
        record.continuousPressureHours,
      ],
    );
    return ok(record);
  } catch (error) {
    return err(describeConstraintError(error, `the connection ${record.connectionId}`));
  }
}

export function findConnection(db: Database, connectionId: string): ConnectionRecord | undefined {
  const row = selectOne<ConnectionRow>(
    db,
    `select ${COLUMNS} from service_connections where connection_id = ?`,
    [connectionId],
  );
  return row === undefined ? undefined : toRecord(row);
}

export function findConnectionByAccount(
  db: Database,
  accountNumber: string,
): ConnectionRecord | undefined {
  const row = selectOne<ConnectionRow>(
    db,
    `select ${COLUMNS} from service_connections where account_number = ?`,
    [accountNumber],
  );
  return row === undefined ? undefined : toRecord(row);
}

export interface ConnectionFilter {
  readonly route?: string;
  readonly premiseUseCode?: string;
  /** Only connections in service on this day. */
  readonly activeOn?: CivilDate;
}

export function listConnections(db: Database, filter: ConnectionFilter = {}): ConnectionRecord[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.route !== undefined) {
    clauses.push('route = ?');
    params.push(filter.route);
  }
  if (filter.premiseUseCode !== undefined) {
    clauses.push('premise_use_code = ?');
    params.push(filter.premiseUseCode);
  }
  if (filter.activeOn !== undefined) {
    clauses.push('connected_on <= ? and (disconnected_on is null or disconnected_on > ?)');
    params.push(filter.activeOn, filter.activeOn);
  }
  const where = clauses.length === 0 ? '' : `where ${clauses.join(' and ')}`;
  return selectAll<ConnectionRow>(
    db,
    `select ${COLUMNS} from service_connections ${where} order by account_number`,
    params,
  ).map(toRecord);
}

export interface FixtureChange {
  readonly outletElevationInches?: number;
  readonly indoorRiser?: boolean;
  readonly downstreamShutoff?: boolean;
  readonly continuousPressureHours?: number;
}

/** Write the geometry the isolation requirement reads. */
export function updateFixtureFacts(
  db: Database,
  connectionId: string,
  change: FixtureChange,
): Result<ConnectionRecord, string> {
  const existing = findConnection(db, connectionId);
  if (existing === undefined) {
    return err(`there is no connection with the id ${connectionId}`);
  }
  const merged: ConnectionRecord = {
    ...existing,
    ...(change.outletElevationInches === undefined
      ? {}
      : { outletElevationInches: change.outletElevationInches }),
    ...(change.indoorRiser === undefined ? {} : { indoorRiser: change.indoorRiser }),
    ...(change.downstreamShutoff === undefined
      ? {}
      : { downstreamShutoff: change.downstreamShutoff }),
    ...(change.continuousPressureHours === undefined
      ? {}
      : { continuousPressureHours: change.continuousPressureHours }),
  };
  if (merged.outletElevationInches < 0) {
    return err('an elevation above the highest outlet cannot be negative');
  }
  if (merged.continuousPressureHours < 0 || merged.continuousPressureHours > 24) {
    return err('hours under pressure have to sit between 0 and 24');
  }
  execute(
    db,
    `update service_connections set outlet_elevation_inches = ?, indoor_riser = ?,
       downstream_shutoff = ?, continuous_pressure_hours = ? where connection_id = ?`,
    [
      merged.outletElevationInches,
      toFlag(merged.indoorRiser),
      toFlag(merged.downstreamShutoff),
      merged.continuousPressureHours,
      connectionId,
    ],
  );
  return ok(merged);
}

export interface ConnectionChange {
  readonly premiseName?: string;
  readonly premiseAddress?: string;
  readonly premiseUseCode?: string;
  readonly route?: string;
  readonly note?: string;
}

export function updateConnection(
  db: Database,
  connectionId: string,
  change: ConnectionChange,
): Result<ConnectionRecord, string> {
  const existing = findConnection(db, connectionId);
  if (existing === undefined) {
    return err(`there is no connection with the id ${connectionId}`);
  }
  const merged: ConnectionRecord = {
    ...existing,
    ...(change.premiseName === undefined ? {} : { premiseName: change.premiseName }),
    ...(change.premiseAddress === undefined ? {} : { premiseAddress: change.premiseAddress }),
    ...(change.premiseUseCode === undefined ? {} : { premiseUseCode: change.premiseUseCode }),
    ...(change.route === undefined ? {} : { route: change.route }),
    ...(change.note === undefined ? {} : { note: change.note }),
  };
  execute(
    db,
    `update service_connections
       set premise_name = ?, premise_address = ?, premise_use_code = ?, route = ?, note = ?
     where connection_id = ?`,
    [
      merged.premiseName,
      merged.premiseAddress,
      merged.premiseUseCode,
      merged.route,
      toNullable(merged.note),
      connectionId,
    ],
  );
  return ok(merged);
}

export function disconnect(
  db: Database,
  connectionId: string,
  on: CivilDate,
): Result<ConnectionRecord, string> {
  const existing = findConnection(db, connectionId);
  if (existing === undefined) {
    return err(`there is no connection with the id ${connectionId}`);
  }
  if (existing.disconnectedOn !== undefined) {
    return err(`the connection ${connectionId} came out on ${existing.disconnectedOn} already`);
  }
  if (on < existing.connectedOn) {
    return err(`a connection cannot come out on ${on}, before it went in on ${existing.connectedOn}`);
  }
  execute(db, 'update service_connections set disconnected_on = ? where connection_id = ?', [
    on,
    connectionId,
  ]);
  return ok({ ...existing, disconnectedOn: on });
}

export function isInService(record: ConnectionRecord, asOf: CivilDate): boolean {
  if (record.connectedOn > asOf) {
    return false;
  }
  const out = fromNullable(record.disconnectedOn);
  return out === undefined || out > asOf;
}

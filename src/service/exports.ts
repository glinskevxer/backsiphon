/**
 * Handing the register to somebody else.
 *
 * Four exports, because those are the four things people ask for: the
 * connections, what is fitted, what has been tested, and where everything
 * stands. The last one is worked out rather than read, so it is the slow one
 * and it is the one the office actually sends to the state.
 */

import type { CivilDate } from '../util/dates';
import { writeCsv } from '../util/csv';
import { err, ok, type Result } from '../util/result';
import { listConnections } from '../storage/repositories/connections';
import { listAssemblies } from '../storage/repositories/assemblies';
import { reportsForAssembly } from '../storage/repositories/reports';
import { complianceFor } from './compliance';
import type { Register } from './register';

export type ExportName = 'connections' | 'assemblies' | 'reports' | 'standing';

export const EXPORT_NAMES: ReadonlyArray<ExportName> = [
  'connections',
  'assemblies',
  'reports',
  'standing',
];

export interface ExportTable {
  readonly name: ExportName;
  readonly headers: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
}

export function buildExport(
  register: Register,
  name: string,
  asOf: CivilDate,
): Result<ExportTable, string> {
  switch (name) {
    case 'connections':
      return ok(connectionsTable(register, asOf));
    case 'assemblies':
      return ok(assembliesTable(register, asOf));
    case 'reports':
      return ok(reportsTable(register, asOf));
    case 'standing':
      return ok(standingTable(register, asOf));
    default:
      return err(`there is no export called ${name}, try ${EXPORT_NAMES.join(', ')}`);
  }
}

export function toCsv(table: ExportTable): string {
  return writeCsv(table.headers, table.rows);
}

export function toRecords(table: ExportTable): Array<Record<string, string>> {
  return table.rows.map((row) => {
    const record: Record<string, string> = {};
    for (const [index, header] of table.headers.entries()) {
      record[header] = row[index] ?? '';
    }
    return record;
  });
}

function connectionsTable(register: Register, asOf: CivilDate): ExportTable {
  const rows = listConnections(register.db, { activeOn: asOf }).map((connection) => [
    connection.connectionId,
    connection.accountNumber,
    connection.premiseName,
    connection.premiseAddress,
    connection.premiseUseCode,
    String(connection.serviceSizeInches),
    connection.fireService ? 'yes' : 'no',
    connection.purveyorMetered ? 'yes' : 'no',
    connection.connectedOn,
    connection.route,
  ]);
  return {
    name: 'connections',
    headers: [
      'connection',
      'account',
      'premise',
      'address',
      'use',
      'size',
      'fire service',
      'metered',
      'connected',
      'route',
    ],
    rows,
  };
}

function assembliesTable(register: Register, asOf: CivilDate): ExportTable {
  const rows = listAssemblies(register.db, { activeOn: asOf }).map((assembly) => [
    assembly.assemblyId,
    assembly.connectionId,
    assembly.scope,
    assembly.assemblyClass,
    assembly.modelId,
    assembly.serialNumber,
    String(assembly.sizeInches),
    assembly.installedOn,
    assembly.location,
  ]);
  return {
    name: 'assemblies',
    headers: [
      'assembly',
      'connection',
      'scope',
      'class',
      'model',
      'serial',
      'size',
      'fitted',
      'location',
    ],
    rows,
  };
}

function reportsTable(register: Register, asOf: CivilDate): ExportTable {
  const rows: string[][] = [];
  for (const assembly of listAssemblies(register.db, { activeOn: asOf })) {
    for (const stored of reportsForAssembly(register.db, assembly.assemblyId)) {
      rows.push([
        stored.report.reportId,
        stored.report.assemblyId,
        assembly.connectionId,
        stored.report.testerId,
        stored.report.gaugeId,
        stored.report.testedOn,
        stored.report.filedOn,
        stored.admissible ? 'yes' : 'no',
        stored.outcome,
        stored.asFoundOutcome,
        stored.inadmissibleCodes.join(' '),
      ]);
    }
  }
  return {
    name: 'reports',
    headers: [
      'report',
      'assembly',
      'connection',
      'tester',
      'gauge',
      'tested',
      'filed',
      'accepted',
      'outcome',
      'as found',
      'refused because',
    ],
    rows,
  };
}

function standingTable(register: Register, asOf: CivilDate): ExportTable {
  const rows: string[][] = [];
  for (const connection of listConnections(register.db, { activeOn: asOf })) {
    const status = complianceFor(register, connection.connectionId, asOf);
    if (!status.ok) {
      rows.push([
        connection.connectionId,
        connection.accountNumber,
        'unknown',
        '',
        '',
        '',
        '',
        status.error,
      ]);
      continue;
    }
    const point = status.value.containment;
    rows.push([
      connection.connectionId,
      connection.accountNumber,
      status.value.standing,
      status.value.urgency,
      point.point.effectiveClass ?? '',
      point.assembly?.assemblyClass ?? '',
      point.due?.due ?? '',
      point.delinquency?.stage ?? 'none',
    ]);
  }
  return {
    name: 'standing',
    headers: [
      'connection',
      'account',
      'standing',
      'urgency',
      'required',
      'fitted',
      'test due',
      'notice',
    ],
    rows,
  };
}

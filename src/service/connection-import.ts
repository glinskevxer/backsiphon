/**
 * Taking the district in from the billing system.
 *
 * The office does not type three thousand connections in. It gets an export
 * out of the billing system once, and then a monthly file of what has changed.
 * So this has to do two things: create what is new, and update what has moved,
 * without ever quietly changing something it was not asked to.
 */

import { parseCsv, toRecords } from '../util/csv';
import { isCivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import { premiseUseByCode } from '../domain/premise';
import { findConnectionByAccount, updateConnection } from '../storage/repositories/connections';
import { openConnection, type NewConnection } from './connections';
import type { Register } from './register';

const REQUIRED = ['account', 'premise', 'address', 'use', 'size', 'connected'];
const OPTIONAL = ['route', 'fire', 'metered', 'note'];

export interface ImportedConnection {
  readonly line: number;
  readonly accountNumber: string;
  readonly connectionId: string;
  readonly action: 'opened' | 'updated' | 'unchanged';
}

export interface ConnectionImportSummary {
  readonly rows: ReadonlyArray<ImportedConnection>;
  readonly rejected: ReadonlyArray<{ line: number; reason: string }>;
  readonly opened: number;
  readonly updated: number;
}

export interface ConnectionImportOptions {
  /** Without this, a row for an account already on file is left alone. */
  readonly update?: boolean;
}

export function importConnectionsCsv(
  register: Register,
  text: string,
  options: ConnectionImportOptions = {},
): Result<ConnectionImportSummary, string> {
  const table = parseCsv(text);
  if (!table.ok) {
    return err(table.error);
  }
  const headers = table.value.headers.map((header) => header.trim());
  const missing = REQUIRED.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    return err(`the file has no ${missing.join(' or ')} column on it`);
  }
  const stray = headers.filter((header) => ![...REQUIRED, ...OPTIONAL].includes(header));
  if (stray.length > 0) {
    return err(`the file carries a column this import does not know: ${stray.join(', ')}`);
  }

  const rows: ImportedConnection[] = [];
  const rejected: Array<{ line: number; reason: string }> = [];

  for (const [offset, record] of toRecords(table.value).entries()) {
    const line = offset + 2;
    const parsed = readRow(record);
    if (!parsed.ok) {
      rejected.push({ line, reason: parsed.error });
      continue;
    }

    const existing = findConnectionByAccount(register.db, parsed.value.accountNumber);
    if (existing === undefined) {
      const opened = openConnection(register, parsed.value);
      if (!opened.ok) {
        rejected.push({ line, reason: opened.error });
        continue;
      }
      rows.push({
        line,
        accountNumber: parsed.value.accountNumber,
        connectionId: opened.value.connectionId,
        action: 'opened',
      });
      continue;
    }

    if (options.update !== true) {
      rows.push({
        line,
        accountNumber: parsed.value.accountNumber,
        connectionId: existing.connectionId,
        action: 'unchanged',
      });
      continue;
    }

    const same =
      existing.premiseName === parsed.value.premiseName &&
      existing.premiseAddress === parsed.value.premiseAddress &&
      existing.route === (parsed.value.route ?? existing.route);
    if (same) {
      rows.push({
        line,
        accountNumber: parsed.value.accountNumber,
        connectionId: existing.connectionId,
        action: 'unchanged',
      });
      continue;
    }

    // the use code is deliberately not written here. a change of use is a
    // change of tenant, and that has to leave a trail and ask for a survey.
    const updated = updateConnection(register.db, existing.connectionId, {
      premiseName: parsed.value.premiseName,
      premiseAddress: parsed.value.premiseAddress,
      ...(parsed.value.route === undefined ? {} : { route: parsed.value.route }),
    });
    if (!updated.ok) {
      rejected.push({ line, reason: updated.error });
      continue;
    }
    rows.push({
      line,
      accountNumber: parsed.value.accountNumber,
      connectionId: existing.connectionId,
      action: 'updated',
    });
  }

  return ok({
    rows,
    rejected,
    opened: rows.filter((row) => row.action === 'opened').length,
    updated: rows.filter((row) => row.action === 'updated').length,
  });
}

function readRow(record: Record<string, string>): Result<NewConnection, string> {
  const account = (record['account'] ?? '').trim();
  const premise = (record['premise'] ?? '').trim();
  const address = (record['address'] ?? '').trim();
  const use = (record['use'] ?? '').trim().toUpperCase();
  const size = Number((record['size'] ?? '').trim());
  const connected = (record['connected'] ?? '').trim();
  const route = (record['route'] ?? '').trim();
  const note = (record['note'] ?? '').trim();

  if (account === '' || premise === '' || address === '') {
    return err('the row has no account, premise or address on it');
  }
  if (!premiseUseByCode(use).ok) {
    return err(`${use === '' ? 'the row' : use} is not a premise use this register knows`);
  }
  if (!Number.isFinite(size) || size <= 0) {
    return err(`"${record['size'] ?? ''}" is not a service size in inches`);
  }
  if (!isCivilDate(connected)) {
    return err(`"${connected}" is not a connection date of the form YYYY-MM-DD`);
  }

  return ok({
    accountNumber: account,
    premiseName: premise,
    premiseAddress: address,
    premiseUseCode: use,
    serviceSizeInches: size,
    fireService: isYes(record['fire']),
    purveyorMetered: record['metered'] === undefined ? true : isYes(record['metered']),
    connectedOn: connected,
    ...(route === '' ? {} : { route }),
    ...(note === '' ? {} : { note }),
  });
}

function isYes(value: string | undefined): boolean {
  return ['yes', 'y', 'true', '1'].includes((value ?? '').trim().toLowerCase());
}

export function describeConnectionImport(summary: ConnectionImportSummary): string {
  return (
    `${summary.rows.length} rows read, ${summary.opened} opened, ${summary.updated} updated, ` +
    `${summary.rows.length - summary.opened - summary.updated} left alone, ` +
    `${summary.rejected.length} rejected`
  );
}

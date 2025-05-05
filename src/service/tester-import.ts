/**
 * Taking the certified tester list off the certifying agency.
 *
 * The agency publishes a list every quarter. The office used to type it, which
 * meant a tester whose certificate had lapsed in March was still admissible in
 * June because nobody had got to the letter K. This reads the file, adds the
 * new ones, renews the ones already on file, and says which of the office's
 * testers have fallen off the list altogether.
 */

import { parseCsv, toRecords } from '../util/csv';
import { isCivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import { ASSEMBLY_CLASSES, type AssemblyClass } from '../domain/assembly';
import type { TesterCertification } from '../domain/tester';
import { certificationStatus } from '../domain/tester';
import { appendEvent } from '../storage/repositories/events';
import {
  findTester,
  insertTester,
  listTesters,
  renewCertificate,
} from '../storage/repositories/testers';
import { withTransaction } from '../storage/db';
import type { Register } from './register';

const COLUMNS = ['tester', 'name', 'agency', 'certificate', 'issued', 'expires', 'endorsements'];

export interface RosterRow {
  readonly line: number;
  readonly testerId: string;
  readonly action: 'added' | 'renewed' | 'unchanged';
}

export interface RosterImport {
  readonly rows: ReadonlyArray<RosterRow>;
  readonly rejected: ReadonlyArray<{ line: number; reason: string }>;
  readonly added: number;
  readonly renewed: number;
  /** Testers on the register that the agency's list does not carry. */
  readonly notOnTheList: ReadonlyArray<string>;
}

export function importTesterRoster(register: Register, text: string): Result<RosterImport, string> {
  const table = parseCsv(text);
  if (!table.ok) {
    return err(table.error);
  }
  const headers = table.value.headers.map((header) => header.trim());
  const missing = COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    return err(`the list has no ${missing.join(' or ')} column on it`);
  }

  const rows: RosterRow[] = [];
  const rejected: Array<{ line: number; reason: string }> = [];
  const seen = new Set<string>();

  for (const [offset, record] of toRecords(table.value).entries()) {
    const line = offset + 2;
    const parsed = readRow(record);
    if (!parsed.ok) {
      rejected.push({ line, reason: parsed.error });
      continue;
    }
    const certification = parsed.value;
    seen.add(certification.testerId);

    const existing = findTester(register.db, certification.testerId);
    if (existing === undefined) {
      const added = withTransaction(register.db, () => {
        const written = insertTester(register.db, certification);
        if (!written.ok) {
          return written;
        }
        appendEvent(register.db, {
          happenedAt: register.now(),
          actor: register.actor,
          kind: 'tester_added',
          subjectKind: 'tester',
          subjectId: certification.testerId,
          detail: `${certification.name}, certificate to ${certification.expiresOn}`,
        });
        return written;
      });
      if (!added.ok) {
        rejected.push({ line, reason: added.error });
        continue;
      }
      rows.push({ line, testerId: certification.testerId, action: 'added' });
      continue;
    }

    const same =
      existing.issuedOn === certification.issuedOn &&
      existing.expiresOn === certification.expiresOn &&
      existing.endorsements.join(',') === certification.endorsements.join(',');
    if (same) {
      rows.push({ line, testerId: certification.testerId, action: 'unchanged' });
      continue;
    }

    const renewed = withTransaction(register.db, () => {
      const written = renewCertificate(
        register.db,
        certification.testerId,
        certification.issuedOn,
        certification.expiresOn,
        certification.endorsements,
      );
      if (!written.ok) {
        return written;
      }
      appendEvent(register.db, {
        happenedAt: register.now(),
        actor: register.actor,
        kind: 'tester_renewed',
        subjectKind: 'tester',
        subjectId: certification.testerId,
        detail: `certificate now runs ${certification.issuedOn} to ${certification.expiresOn}`,
      });
      return written;
    });
    if (!renewed.ok) {
      rejected.push({ line, reason: renewed.error });
      continue;
    }
    rows.push({ line, testerId: certification.testerId, action: 'renewed' });
  }

  return ok({
    rows,
    rejected,
    added: rows.filter((row) => row.action === 'added').length,
    renewed: rows.filter((row) => row.action === 'renewed').length,
    notOnTheList: listTesters(register.db)
      .filter((tester) => !seen.has(tester.testerId))
      .map((tester) => tester.testerId),
  });
}

function readRow(record: Record<string, string>): Result<TesterCertification, string> {
  const testerId = (record['tester'] ?? '').trim();
  const name = (record['name'] ?? '').trim();
  const agency = (record['agency'] ?? '').trim();
  const certificateNumber = (record['certificate'] ?? '').trim();
  const issuedOn = (record['issued'] ?? '').trim();
  const expiresOn = (record['expires'] ?? '').trim();
  const endorsements = (record['endorsements'] ?? '')
    .split(/[ ,]+/)
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry !== '') as AssemblyClass[];

  if (testerId === '' || name === '' || agency === '' || certificateNumber === '') {
    return err('the row is missing the tester, the name, the agency or the certificate number');
  }
  if (!isCivilDate(issuedOn) || !isCivilDate(expiresOn)) {
    return err('the row carries a date that is not of the form YYYY-MM-DD');
  }
  if (expiresOn <= issuedOn) {
    return err(`a certificate cannot run from ${issuedOn} to ${expiresOn}`);
  }
  if (endorsements.length === 0) {
    return err('the row carries no endorsements, so the certificate covers nothing');
  }
  const known = new Set(ASSEMBLY_CLASSES.map((spec) => spec.code));
  const stray = endorsements.filter((endorsement) => !known.has(endorsement));
  if (stray.length > 0) {
    return err(`${stray.join(', ')} is not an assembly class this register knows`);
  }

  return ok({
    testerId,
    name,
    agency,
    certificateNumber,
    issuedOn,
    expiresOn,
    endorsements,
  });
}

/** The testers the office would refuse a report from today. */
export function lapsedTesters(register: Register, asOf: string): string[] {
  return listTesters(register.db)
    .filter((tester) => certificationStatus(tester, asOf) !== 'valid')
    .map((tester) => tester.testerId);
}

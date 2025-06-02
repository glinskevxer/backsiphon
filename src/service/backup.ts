/**
 * Copying the register somewhere safe.
 *
 * SQLite will write a consistent copy of an open database itself, which is the
 * only way to do this that survives a clerk filing a report in the middle of
 * it. Copying the file with the shell does not, and the office found that out
 * the hard way with the system this one replaced.
 */

import { existsSync, statSync } from 'node:fs';

import { err, ok, type Result } from '../util/result';
import { closeDatabase, openDatabase, selectOne, type Database } from '../storage/db';
import { appendEvent } from '../storage/repositories/events';
import { schemaVersion, schemaVersionIfPresent } from '../storage/migrations';
import type { Register } from './register';

export interface BackupOutcome {
  readonly file: string;
  readonly bytes: number;
  readonly schemaVersion: string;
  readonly pages: number;
}

export function backupTo(register: Register, file: string): Result<BackupOutcome, string> {
  if (file.trim() === '') {
    return err('a backup has to be written somewhere');
  }
  if (existsSync(file)) {
    return err(`${file} is already there, and a backup never writes over one`);
  }
  try {
    register.db.prepare(`vacuum into ?`).run(file);
  } catch (error) {
    return err(
      `the backup could not be written: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const pages =
    selectOne<{ page_count: number }>(register.db, 'pragma page_count')?.page_count ?? 0;
  const outcome: BackupOutcome = {
    file,
    bytes: statSync(file).size,
    schemaVersion: schemaVersion(register.db) ?? 'unknown',
    pages,
  };
  appendEvent(register.db, {
    happenedAt: register.now(),
    actor: register.actor,
    kind: 'register_backed_up',
    subjectKind: 'connection',
    subjectId: 'register',
    detail: `${outcome.bytes} bytes to ${file} at schema ${outcome.schemaVersion}`,
  });
  return ok(outcome);
}

export interface IntegrityOutcome {
  readonly ok: boolean;
  readonly messages: ReadonlyArray<string>;
  readonly foreignKeyProblems: number;
}

export interface BackupReading {
  readonly file: string;
  readonly schemaVersion: string;
  readonly connections: number;
  readonly assemblies: number;
  readonly reports: number;
  readonly notices: number;
  readonly events: number;
  readonly sound: boolean;
}

/**
 * Read a backup without touching the live register.
 *
 * The office has a drawer of these and no way of telling which one is which. It
 * opens the file read only, on purpose: a restore is a decision somebody makes
 * after looking, and looking should not be able to change anything.
 */
export function readBackup(file: string): Result<BackupReading, string> {
  if (!existsSync(file)) {
    return err(`there is no file at ${file}`);
  }
  let db: Database;
  try {
    db = openDatabase({ file, readOnly: true });
  } catch (error) {
    return err(
      `${file} could not be opened: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    const version = schemaVersionIfPresent(db);
    if (version === undefined) {
      return err(`${file} is not a register this program wrote`);
    }
    const integrity = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    return ok({
      file,
      schemaVersion: version,
      connections: count(db, 'service_connections'),
      assemblies: count(db, 'assemblies'),
      reports: count(db, 'test_reports'),
      notices: count(db, 'notices'),
      events: count(db, 'events'),
      sound: integrity.length === 1 && integrity[0]?.integrity_check === 'ok',
    });
  } finally {
    closeDatabase(db);
  }
}

function count(db: Database, table: string): number {
  return selectOne<{ total: number }>(db, `select count(*) as total from ${table}`)?.total ?? 0;
}

/** What SQLite itself says about the file, which is worth asking before a backup. */
export function checkIntegrity(register: Register): IntegrityOutcome {
  const rows = register.db.pragma('integrity_check') as Array<{ integrity_check: string }>;
  const messages = rows.map((row) => row.integrity_check);
  const foreign = register.db.pragma('foreign_key_check') as unknown[];
  return {
    ok: messages.length === 1 && messages[0] === 'ok' && foreign.length === 0,
    messages,
    foreignKeyProblems: foreign.length,
  };
}

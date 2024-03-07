/**
 * The store.
 *
 * One SQLite file per purveyor. The register is a program office tool with a
 * handful of clerks in it, so the interesting part is not concurrency, it is
 * that a half written change must never be left behind: a test report that
 * lands without its readings would move a due date on evidence that is not
 * there.
 */

import BetterSqlite3 from 'better-sqlite3';

export type Database = BetterSqlite3.Database;
export type Statement = BetterSqlite3.Statement;

export interface OpenOptions {
  /** A path, or `:memory:` for a store that lives as long as the process. */
  readonly file: string;
  readonly readOnly?: boolean;
  /** Milliseconds to wait for another writer before giving up. */
  readonly busyTimeoutMs?: number;
}

export const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

export function openDatabase(options: OpenOptions): Database {
  const db = new BetterSqlite3(options.file, {
    readonly: options.readOnly ?? false,
    fileMustExist: false,
  });
  db.pragma(`busy_timeout = ${options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS}`);
  db.pragma('foreign_keys = ON');
  if (!(options.readOnly ?? false)) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }
  return db;
}

export function closeDatabase(db: Database): void {
  if (db.open) {
    db.close();
  }
}

/**
 * Run a unit of work in a transaction. Nesting is done with savepoints, so an
 * inner failure rolls back only its own part and the caller decides whether
 * that is fatal.
 */
export function withTransaction<T>(db: Database, work: () => T): T {
  const savepoint = `sp_${nextSavepointId()}`;
  const inTransaction = db.inTransaction;
  if (inTransaction) {
    db.prepare(`SAVEPOINT ${savepoint}`).run();
  } else {
    db.prepare('BEGIN').run();
  }
  try {
    const result = work();
    if (inTransaction) {
      db.prepare(`RELEASE ${savepoint}`).run();
    } else {
      db.prepare('COMMIT').run();
    }
    return result;
  } catch (error) {
    if (inTransaction) {
      db.prepare(`ROLLBACK TO ${savepoint}`).run();
      db.prepare(`RELEASE ${savepoint}`).run();
    } else {
      db.prepare('ROLLBACK').run();
    }
    throw error;
  }
}

let savepointCounter = 0;

function nextSavepointId(): number {
  savepointCounter += 1;
  return savepointCounter;
}

/** Read one row, or nothing, with the row typed by the caller. */
export function selectOne<T>(db: Database, sql: string, params: unknown[] = []): T | undefined {
  const row = db.prepare(sql).get(...params);
  return row === undefined ? undefined : (row as T);
}

export function selectAll<T>(db: Database, sql: string, params: unknown[] = []): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function execute(db: Database, sql: string, params: unknown[] = []): number {
  return db.prepare(sql).run(...params).changes;
}

/** The tables the store holds, for a health check or a fixture teardown. */
export function tableNames(db: Database): string[] {
  return selectAll<{ name: string }>(
    db,
    "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
  ).map((row) => row.name);
}

export function foreignKeysOn(db: Database): boolean {
  const rows = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
  return rows[0]?.foreign_keys === 1;
}

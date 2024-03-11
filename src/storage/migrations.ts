/**
 * Schema migrations.
 *
 * Migrations are ordinary statements in an ordinary list, applied in order,
 * once each. The register keeps a checksum of every migration it has run so
 * that an edited migration is caught rather than quietly skipped, which is the
 * failure that leaves two offices running different schemas under the same
 * version number.
 */

import { createHash } from 'node:crypto';

import { err, ok, type Result } from '../util/result';
import { execute, selectAll, selectOne, withTransaction, type Database } from './db';

export interface Migration {
  /** Sorts the run order, so it goes at the front of the name: `001_initial`. */
  readonly id: string;
  readonly description: string;
  readonly statements: ReadonlyArray<string>;
}

export interface AppliedMigration {
  readonly id: string;
  readonly appliedAt: string;
  readonly checksum: string;
}

const LEDGER = 'schema_migrations';

export function checksumOf(migration: Migration): string {
  const hash = createHash('sha256');
  hash.update(migration.id);
  for (const statement of migration.statements) {
    hash.update(' ');
    hash.update(statement.trim());
  }
  return hash.digest('hex').slice(0, 32);
}

export function ensureLedger(db: Database): void {
  db.exec(`
    create table if not exists ${LEDGER} (
      id text primary key,
      applied_at text not null,
      checksum text not null
    )
  `);
}

export function appliedMigrations(db: Database): AppliedMigration[] {
  ensureLedger(db);
  return selectAll<{ id: string; applied_at: string; checksum: string }>(
    db,
    `select id, applied_at, checksum from ${LEDGER} order by id`,
  ).map((row) => ({ id: row.id, appliedAt: row.applied_at, checksum: row.checksum }));
}

export interface MigrationRun {
  readonly applied: ReadonlyArray<string>;
  readonly alreadyApplied: ReadonlyArray<string>;
}

/**
 * Bring the store up to the given list. The clock is passed in rather than
 * read, because the tests want to know exactly what went into the ledger.
 */
export function applyMigrations(
  db: Database,
  migrations: ReadonlyArray<Migration>,
  now: string,
): Result<MigrationRun, string> {
  ensureLedger(db);

  const ordered = [...migrations].sort((left, right) => left.id.localeCompare(right.id));
  const duplicate = firstDuplicateId(ordered);
  if (duplicate !== undefined) {
    return err(`the migration ${duplicate} is in the list twice`);
  }

  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const migration of ordered) {
    const record = selectOne<{ checksum: string }>(
      db,
      `select checksum from ${LEDGER} where id = ?`,
      [migration.id],
    );
    const checksum = checksumOf(migration);

    if (record !== undefined) {
      if (record.checksum !== checksum) {
        return err(
          `the migration ${migration.id} has changed since it was applied ` +
            `(${record.checksum} on file, ${checksum} now)`,
        );
      }
      alreadyApplied.push(migration.id);
      continue;
    }

    try {
      withTransaction(db, () => {
        for (const statement of migration.statements) {
          db.exec(statement);
        }
        execute(db, `insert into ${LEDGER} (id, applied_at, checksum) values (?, ?, ?)`, [
          migration.id,
          now,
          checksum,
        ]);
      });
    } catch (error) {
      return err(`the migration ${migration.id} failed: ${describe(error)}`);
    }
    applied.push(migration.id);
  }

  return ok({ applied, alreadyApplied });
}

export function schemaVersion(db: Database): string | undefined {
  ensureLedger(db);
  return selectOne<{ id: string }>(db, `select id from ${LEDGER} order by id desc limit 1`)?.id;
}

function firstDuplicateId(migrations: ReadonlyArray<Migration>): string | undefined {
  const seen = new Set<string>();
  for (const migration of migrations) {
    if (seen.has(migration.id)) {
      return migration.id;
    }
    seen.add(migration.id);
  }
  return undefined;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

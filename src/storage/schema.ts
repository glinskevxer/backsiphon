/**
 * Every migration the register knows about, in the order they run.
 *
 * Nothing is ever removed from this list. A store that was built two years ago
 * has to walk the same path a store built today walks.
 */

import { applyMigrations, type Migration, type MigrationRun } from './migrations';
import type { Database } from './db';
import type { Result } from '../util/result';
import { m001Connections } from './migrations/m001_connections';

export const MIGRATIONS: ReadonlyArray<Migration> = [m001Connections];

export function migrate(db: Database, now: string): Result<MigrationRun, string> {
  return applyMigrations(db, MIGRATIONS, now);
}

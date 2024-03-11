import { afterEach, describe, expect, it } from 'vitest';

import {
  applyMigrations,
  appliedMigrations,
  checksumOf,
  schemaVersion,
  type Migration,
} from '../../../src/storage/migrations';
import { closeDatabase, openDatabase, tableNames, type Database } from '../../../src/storage/db';

const NOW = '2024-03-12T09:00:00Z';

const first: Migration = {
  id: '001_meters',
  description: 'the meters table',
  statements: ['create table meters (id text primary key, size real not null)'],
};

const second: Migration = {
  id: '002_routes',
  description: 'reading routes',
  statements: [
    'create table routes (id text primary key, name text not null)',
    'alter table meters add column route_id text references routes (id)',
  ],
};

let db: Database | undefined;

function open(): Database {
  db = openDatabase({ file: ':memory:' });
  return db;
}

afterEach(() => {
  if (db !== undefined) {
    closeDatabase(db);
    db = undefined;
  }
});

describe('applying', () => {
  it('runs a list in order and records it', () => {
    const store = open();
    const run = applyMigrations(store, [second, first], NOW);
    expect(run.ok).toBe(true);
    if (!run.ok) {
      return;
    }
    expect(run.value.applied).toEqual(['001_meters', '002_routes']);
    expect(tableNames(store)).toEqual(['meters', 'routes', 'schema_migrations']);
  });

  it('leaves an already applied migration alone', () => {
    const store = open();
    applyMigrations(store, [first], NOW);
    const again = applyMigrations(store, [first, second], NOW);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value.alreadyApplied).toEqual(['001_meters']);
      expect(again.value.applied).toEqual(['002_routes']);
    }
  });

  it('writes the checksum and the time into the ledger', () => {
    const store = open();
    applyMigrations(store, [first], NOW);
    const rows = appliedMigrations(store);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.appliedAt).toBe(NOW);
    expect(rows[0]?.checksum).toBe(checksumOf(first));
  });

  it('reports the highest id as the schema version', () => {
    const store = open();
    expect(schemaVersion(store)).toBeUndefined();
    applyMigrations(store, [first, second], NOW);
    expect(schemaVersion(store)).toBe('002_routes');
  });
});

describe('refusing', () => {
  it('catches a migration that was edited after it ran', () => {
    const store = open();
    applyMigrations(store, [first], NOW);
    const edited: Migration = {
      ...first,
      statements: ['create table meters (id text primary key, size real not null, note text)'],
    };
    const result = applyMigrations(store, [edited], NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('has changed since it was applied');
    }
  });

  it('catches the same id listed twice', () => {
    const result = applyMigrations(open(), [first, { ...first, description: 'again' }], NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('twice');
    }
  });

  it('rolls a broken migration back and leaves nothing behind', () => {
    const store = open();
    const broken: Migration = {
      id: '003_broken',
      description: 'two statements, the second one wrong',
      statements: ['create table good (id text primary key)', 'create table bad (id text primary'],
    };
    const result = applyMigrations(store, [broken], NOW);
    expect(result.ok).toBe(false);
    expect(tableNames(store)).toEqual(['schema_migrations']);
    expect(appliedMigrations(store)).toEqual([]);
  });

  it('stops at the broken one and keeps what ran before it', () => {
    const store = open();
    const broken: Migration = {
      id: '002_broken',
      description: 'wrong',
      statements: ['create table bad (id text primary'],
    };
    applyMigrations(store, [first, broken], NOW);
    expect(tableNames(store)).toEqual(['meters', 'schema_migrations']);
    expect(schemaVersion(store)).toBe('001_meters');
  });
});

describe('checksums', () => {
  it('changes when a statement changes and not when the description does', () => {
    expect(checksumOf({ ...first, description: 'different words' })).toBe(checksumOf(first));
    expect(checksumOf({ ...first, statements: ['create table meters (id text)'] })).not.toBe(
      checksumOf(first),
    );
  });

  it('ignores surrounding whitespace in a statement', () => {
    const padded = `   ${String(first.statements[0])}   `;
    expect(checksumOf({ ...first, statements: [padded] })).toBe(checksumOf(first));
  });

  it('is a short hex string', () => {
    expect(checksumOf(first)).toMatch(/^[0-9a-f]{32}$/);
  });
});

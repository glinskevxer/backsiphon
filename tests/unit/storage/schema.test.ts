import { afterEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  execute,
  openDatabase,
  selectAll,
  tableNames,
  type Database,
} from '../../../src/storage/db';
import { MIGRATIONS, migrate } from '../../../src/storage/schema';

const NOW = '2024-03-18T08:00:00Z';

let db: Database | undefined;

function migrated(): Database {
  db = openDatabase({ file: ':memory:' });
  const run = migrate(db, NOW);
  if (!run.ok) {
    throw new Error(run.error);
  }
  return db;
}

function addConnection(store: Database, id = 'SC-1', account = 'A-1'): void {
  execute(
    store,
    `insert into service_connections (
       connection_id, account_number, premise_name, premise_address, premise_use_code,
       service_size_inches, fire_service, purveyor_metered, connected_on
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, account, 'kerrigan plating', '14 forge road', 'PLATING', 2, 0, 1, '2019-04-02'],
  );
}

function addSurvey(store: Database, surveyId = 'SV-1', connectionId = 'SC-1'): void {
  execute(
    store,
    `insert into surveys (
       survey_id, connection_id, surveyed_on, surveyor, access_granted, premise_use_code,
       containment_degree, isolation_degree, air_gap_required, backpressure, basis,
       next_survey_due, recorded_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      surveyId,
      connectionId,
      '2024-02-01',
      'r. okafor',
      1,
      'PLATING',
      'health',
      'health',
      0,
      1,
      'category',
      '2025-02-01',
      NOW,
    ],
  );
}

afterEach(() => {
  if (db !== undefined) {
    closeDatabase(db);
    db = undefined;
  }
});

describe('the migration list', () => {
  it('has ids that sort into the run order', () => {
    const ids = MIGRATIONS.map((migration) => migration.id);
    expect([...ids].sort()).toEqual(ids);
  });

  it('builds the connection and survey tables', () => {
    const tables = tableNames(migrated());
    for (const table of ['service_connections', 'surveys', 'survey_findings']) {
      expect(tables).toContain(table);
    }
  });

  it('is safe to run twice', () => {
    const store = migrated();
    const again = migrate(store, NOW);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value.applied).toEqual([]);
    }
  });
});

describe('what the schema refuses', () => {
  it('refuses two connections on the same account number', () => {
    const store = migrated();
    addConnection(store);
    expect(() => addConnection(store, 'SC-2', 'A-1')).toThrow();
  });

  it('refuses a service size of zero', () => {
    const store = migrated();
    expect(() =>
      execute(
        store,
        `insert into service_connections (
           connection_id, account_number, premise_name, premise_address, premise_use_code,
           service_size_inches, fire_service, purveyor_metered, connected_on
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['SC-3', 'A-3', 'x', 'y', 'OFFICE', 0, 0, 1, '2020-01-01'],
      ),
    ).toThrow();
  });

  it('refuses a disconnection before the connection', () => {
    const store = migrated();
    expect(() =>
      execute(
        store,
        `insert into service_connections (
           connection_id, account_number, premise_name, premise_address, premise_use_code,
           service_size_inches, fire_service, purveyor_metered, connected_on, disconnected_on
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['SC-4', 'A-4', 'x', 'y', 'OFFICE', 1, 0, 1, '2020-01-01', '2019-01-01'],
      ),
    ).toThrow();
  });

  it('refuses a degree that is not one of the three', () => {
    const store = migrated();
    addConnection(store);
    expect(() =>
      execute(
        store,
        `insert into surveys (
           survey_id, connection_id, surveyed_on, surveyor, access_granted, premise_use_code,
           containment_degree, isolation_degree, air_gap_required, backpressure, basis,
           next_survey_due, recorded_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'SV-9',
          'SC-1',
          '2024-02-01',
          'r',
          1,
          'OFFICE',
          'severe',
          'none',
          0,
          0,
          'survey',
          '2025-02-01',
          NOW,
        ],
      ),
    ).toThrow();
  });

  it('refuses a survey against a connection that is not there', () => {
    const store = migrated();
    expect(() => addSurvey(store, 'SV-2', 'SC-404')).toThrow();
  });
});

describe('what the schema cleans up', () => {
  it('takes the surveys and their findings with a deleted connection', () => {
    const store = migrated();
    addConnection(store);
    addSurvey(store);
    execute(store, 'insert into survey_findings values (?, ?)', ['SV-1', 'PLATING']);
    execute(store, 'delete from service_connections where connection_id = ?', ['SC-1']);
    expect(selectAll(store, 'select * from surveys')).toEqual([]);
    expect(selectAll(store, 'select * from survey_findings')).toEqual([]);
  });

  it('refuses the same finding twice on one survey', () => {
    const store = migrated();
    addConnection(store);
    addSurvey(store);
    execute(store, 'insert into survey_findings values (?, ?)', ['SV-1', 'PLATING']);
    expect(() =>
      execute(store, 'insert into survey_findings values (?, ?)', ['SV-1', 'PLATING']),
    ).toThrow();
  });
});

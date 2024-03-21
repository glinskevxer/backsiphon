import { afterEach, describe, expect, it } from 'vitest';

import { closeDatabase, execute, openDatabase, selectAll, selectOne, tableNames, type Database } from '../../../src/storage/db';
import { migrate } from '../../../src/storage/schema';

const NOW = '2024-04-02T08:00:00Z';

let db: Database | undefined;

function migrated(): Database {
  db = openDatabase({ file: ':memory:' });
  const run = migrate(db, NOW);
  if (!run.ok) {
    throw new Error(run.error);
  }
  execute(
    db,
    `insert into service_connections (
       connection_id, account_number, premise_name, premise_address, premise_use_code,
       service_size_inches, fire_service, purveyor_metered, connected_on
     ) values ('SC-1', 'A-1', 'kerrigan plating', '14 forge road', 'PLATING', 2, 0, 1, '2019-04-02')`,
  );
  execute(
    db,
    `insert into approved_models (model_id, maker, model, assembly_class, sizes, listed_on)
     values ('WK-375', 'watkin', '375 series', 'RP', '2', '2016-04-01')`,
  );
  execute(
    db,
    `insert into testers (tester_id, name, agency, certificate_number, issued_on, expires_on, endorsements)
     values ('T-118', 'p. adeyemi', 'board', 'BF-4471', '2023-05-01', '2026-04-30', 'RP,DC')`,
  );
  execute(
    db,
    `insert into gauges (gauge_id, tester_id, maker, serial_number, calibrated_on,
       calibration_interval_months, accuracy_psid)
     values ('G-77', 'T-118', 'midwest', '845-C', '2024-02-15', 12, 0.2)`,
  );
  execute(
    db,
    `insert into assemblies (assembly_id, connection_id, scope, assembly_class, model_id,
       serial_number, size_inches, installed_on, location)
     values ('BA-1', 'SC-1', 'containment', 'RP', 'WK-375', '4471182', 2, '2019-05-01', 'vault')`,
  );
  return db;
}

function addReport(store: Database, id = 'TR-1'): void {
  execute(
    store,
    `insert into test_reports (
       report_id, assembly_id, tester_id, gauge_id, assembly_class_tested, tested_on, filed_on,
       repair_made, admissible, outcome, as_found_outcome, recorded_at
     ) values (?, 'BA-1', 'T-118', 'G-77', 'RP', '2024-03-04', '2024-03-06', 0, 1, 'pass', 'pass', ?)`,
    [id, NOW],
  );
}

afterEach(() => {
  if (db !== undefined) {
    closeDatabase(db);
    db = undefined;
  }
});

describe('the third migration', () => {
  it('adds the testing tables', () => {
    const tables = tableNames(migrated());
    for (const table of ['test_reports', 'report_readings', 'notices', 'variances', 'events']) {
      expect(tables).toContain(table);
    }
  });
});

describe('reports', () => {
  it('takes a report against a fitted assembly', () => {
    const store = migrated();
    addReport(store);
    expect(selectAll(store, 'select * from test_reports')).toHaveLength(1);
  });

  it('refuses a filing that predates the test', () => {
    const store = migrated();
    expect(() =>
      execute(
        store,
        `insert into test_reports (
           report_id, assembly_id, tester_id, gauge_id, assembly_class_tested, tested_on, filed_on,
           repair_made, admissible, outcome, as_found_outcome, recorded_at
         ) values ('TR-9', 'BA-1', 'T-118', 'G-77', 'RP', '2024-03-04', '2024-03-01', 0, 1, 'pass', 'pass', ?)`,
        [NOW],
      ),
    ).toThrow();
  });

  it('refuses an outcome that is not one of the four', () => {
    const store = migrated();
    expect(() =>
      execute(
        store,
        `insert into test_reports (
           report_id, assembly_id, tester_id, gauge_id, assembly_class_tested, tested_on, filed_on,
           repair_made, admissible, outcome, as_found_outcome, recorded_at
         ) values ('TR-8', 'BA-1', 'T-118', 'G-77', 'RP', '2024-03-04', '2024-03-06', 0, 1, 'lovely', 'pass', ?)`,
        [NOW],
      ),
    ).toThrow();
  });

  it('will not let a tester be deleted while a report names them', () => {
    const store = migrated();
    addReport(store);
    expect(() => execute(store, "delete from testers where tester_id = 'T-118'")).toThrow();
  });

  it('takes the readings with the report', () => {
    const store = migrated();
    addReport(store);
    execute(
      store,
      `insert into report_readings (report_id, phase, reading_key, numeric_value)
       values ('TR-1', 'as_found', 'check1Differential', 8.2)`,
    );
    execute(store, "delete from test_reports where report_id = 'TR-1'");
    expect(selectAll(store, 'select * from report_readings')).toEqual([]);
  });
});

describe('readings', () => {
  it('holds a number or a flag and not both', () => {
    const store = migrated();
    addReport(store);
    expect(() =>
      execute(
        store,
        `insert into report_readings (report_id, phase, reading_key, numeric_value, flag_value)
         values ('TR-1', 'as_found', 'bypassTight', 1, 1)`,
      ),
    ).toThrow();
    expect(() =>
      execute(
        store,
        `insert into report_readings (report_id, phase, reading_key)
         values ('TR-1', 'as_found', 'bypassTight')`,
      ),
    ).toThrow();
  });

  it('keeps the two phases apart under the same key', () => {
    const store = migrated();
    addReport(store);
    execute(
      store,
      `insert into report_readings (report_id, phase, reading_key, numeric_value)
       values ('TR-1', 'as_found', 'check1Differential', 0.4),
              ('TR-1', 'as_left', 'check1Differential', 8.1)`,
    );
    expect(selectAll(store, 'select * from report_readings')).toHaveLength(2);
  });

  it('refuses a phase nobody fills in', () => {
    const store = migrated();
    addReport(store);
    expect(() =>
      execute(
        store,
        `insert into report_readings (report_id, phase, reading_key, numeric_value)
         values ('TR-1', 'as_thought', 'check1Differential', 8.2)`,
      ),
    ).toThrow();
  });
});

describe('notices and variances', () => {
  it('refuses two notices at the same stage for one due date', () => {
    const store = migrated();
    const insert = `insert into notices (
        notice_id, connection_id, stage, due_date, issued_on, ladder, days_past_due, body
      ) values (?, 'SC-1', 'first', '2024-05-01', '2024-05-02', 'standard', 1, 'please arrange a test')`;
    execute(store, insert, ['N-1']);
    expect(() => execute(store, insert, ['N-2'])).toThrow();
  });

  it('keeps a notice when the assembly it named is removed', () => {
    const store = migrated();
    execute(
      store,
      `insert into notices (
         notice_id, connection_id, assembly_id, stage, due_date, issued_on, ladder, days_past_due, body
       ) values ('N-3', 'SC-1', 'BA-1', 'first', '2024-05-01', '2024-05-02', 'standard', 1, 'x')`,
    );
    execute(store, "delete from assemblies where assembly_id = 'BA-1'");
    const row = selectOne<{ assembly_id: string | null }>(
      store,
      "select assembly_id from notices where notice_id = 'N-3'",
    );
    expect(row?.assembly_id).toBeNull();
  });

  it('refuses a variance decision with no decision date', () => {
    const store = migrated();
    expect(() =>
      execute(
        store,
        `insert into variances (variance_id, connection_id, applied_on, decision, accepted_class,
           granted_against_degree)
         values ('V-1', 'SC-1', '2024-01-01', 'granted', 'DC', 'health')`,
      ),
    ).toThrow();
  });

  it('refuses a variance that expires before it starts', () => {
    const store = migrated();
    expect(() =>
      execute(
        store,
        `insert into variances (variance_id, connection_id, applied_on, accepted_class,
           granted_against_degree, effective_from, expires_on)
         values ('V-2', 'SC-1', '2024-01-01', 'DC', 'health', '2024-06-01', '2024-05-01')`,
      ),
    ).toThrow();
  });
});

describe('the event trail', () => {
  it('numbers events as they land', () => {
    const store = migrated();
    execute(
      store,
      `insert into events (happened_at, actor, kind, subject_kind, subject_id, detail)
       values (?, 'clerk', 'survey_recorded', 'connection', 'SC-1', 'walked by r. okafor'),
              (?, 'clerk', 'assembly_installed', 'assembly', 'BA-1', 'meter vault')`,
      [NOW, NOW],
    );
    const rows = selectAll<{ event_id: number; kind: string }>(
      store,
      'select event_id, kind from events order by event_id',
    );
    expect(rows.map((row) => row.event_id)).toEqual([1, 2]);
    expect(rows[1]?.kind).toBe('assembly_installed');
  });

  it('does not lose events when the subject is deleted', () => {
    const store = migrated();
    execute(
      store,
      `insert into events (happened_at, actor, kind, subject_kind, subject_id)
       values (?, 'clerk', 'assembly_installed', 'assembly', 'BA-1')`,
      [NOW],
    );
    execute(store, "delete from assemblies where assembly_id = 'BA-1'");
    expect(selectAll(store, 'select * from events')).toHaveLength(1);
  });
});

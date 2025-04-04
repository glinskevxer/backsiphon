import { afterEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  execute,
  openDatabase,
  selectAll,
  tableNames,
  type Database,
} from '../../../src/storage/db';
import { migrate } from '../../../src/storage/schema';

const NOW = '2024-03-25T08:00:00Z';

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
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['SC-1', 'A-1', 'kerrigan plating', '14 forge road', 'PLATING', 2, 0, 1, '2019-04-02'],
  );
  execute(
    db,
    `insert into approved_models (model_id, maker, model, assembly_class, sizes, listed_on)
     values (?, ?, ?, ?, ?, ?)`,
    ['WK-375', 'watkin', '375 series', 'RP', '0.75,1,1.5,2', '2016-04-01'],
  );
  execute(
    db,
    `insert into testers (tester_id, name, agency, certificate_number, issued_on, expires_on, endorsements)
     values (?, ?, ?, ?, ?, ?, ?)`,
    [
      'T-118',
      'p. adeyemi',
      'state waterworks board',
      'BF-4471',
      '2023-05-01',
      '2026-04-30',
      'RP,DC',
    ],
  );
  return db;
}

function addAssembly(store: Database, id = 'BA-1', serial = '4471182'): void {
  execute(
    store,
    `insert into assemblies (
       assembly_id, connection_id, scope, assembly_class, model_id, serial_number,
       size_inches, installed_on, location
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, 'SC-1', 'containment', 'RP', 'WK-375', serial, 2, '2019-05-01', 'meter vault'],
  );
}

function addGauge(store: Database, id = 'G-1', serial = '845-C'): void {
  execute(
    store,
    `insert into gauges (
       gauge_id, tester_id, maker, serial_number, calibrated_on,
       calibration_interval_months, accuracy_psid
     ) values (?, ?, ?, ?, ?, ?, ?)`,
    [id, 'T-118', 'midwest', serial, '2024-02-15', 12, 0.2],
  );
}

afterEach(() => {
  if (db !== undefined) {
    closeDatabase(db);
    db = undefined;
  }
});

describe('the second migration', () => {
  it('adds the hardware tables', () => {
    const tables = tableNames(migrated());
    for (const table of ['approved_models', 'assemblies', 'gauges', 'testers']) {
      expect(tables).toContain(table);
    }
  });
});

describe('assemblies', () => {
  it('takes one against a listed model', () => {
    const store = migrated();
    addAssembly(store);
    expect(selectAll(store, 'select * from assemblies')).toHaveLength(1);
  });

  it('refuses one pointing at a model nobody has listed', () => {
    const store = migrated();
    expect(() =>
      execute(
        store,
        `insert into assemblies (
           assembly_id, connection_id, scope, assembly_class, model_id, serial_number,
           size_inches, installed_on, location
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['BA-2', 'SC-1', 'containment', 'RP', 'NOPE-1', '99', 2, '2019-05-01', 'vault'],
      ),
    ).toThrow();
  });

  it('refuses the same serial twice for one model', () => {
    const store = migrated();
    addAssembly(store);
    expect(() => addAssembly(store, 'BA-3')).toThrow();
  });

  it('refuses a scope that is neither containment nor isolation', () => {
    const store = migrated();
    expect(() =>
      execute(
        store,
        `insert into assemblies (
           assembly_id, connection_id, scope, assembly_class, model_id, serial_number,
           size_inches, installed_on, location
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['BA-4', 'SC-1', 'somewhere', 'RP', 'WK-375', '1', 2, '2019-05-01', 'vault'],
      ),
    ).toThrow();
  });

  it('refuses a removal date before the installation', () => {
    const store = migrated();
    expect(() =>
      execute(
        store,
        `insert into assemblies (
           assembly_id, connection_id, scope, assembly_class, model_id, serial_number,
           size_inches, installed_on, removed_on, location
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'BA-5',
          'SC-1',
          'containment',
          'RP',
          'WK-375',
          '2',
          2,
          '2019-05-01',
          '2018-01-01',
          'vault',
        ],
      ),
    ).toThrow();
  });

  it('goes with the connection when the connection goes', () => {
    const store = migrated();
    addAssembly(store);
    execute(store, 'delete from service_connections where connection_id = ?', ['SC-1']);
    expect(selectAll(store, 'select * from assemblies')).toEqual([]);
  });
});

describe('models', () => {
  it('refuses a delisting on or before the listing', () => {
    const store = migrated();
    expect(() =>
      execute(
        store,
        `insert into approved_models (model_id, maker, model, assembly_class, sizes, listed_on, delisted_on)
         values (?, ?, ?, ?, ?, ?, ?)`,
        ['WK-350', 'watkin', '350', 'DC', '1,2', '2020-01-01', '2020-01-01'],
      ),
    ).toThrow();
  });

  it('refuses a class that is not one of the eight', () => {
    const store = migrated();
    expect(() =>
      execute(
        store,
        `insert into approved_models (model_id, maker, model, assembly_class, sizes, listed_on)
         values (?, ?, ?, ?, ?, ?)`,
        ['ZZ-1', 'nobody', 'thing', 'RPZ', '2', '2020-01-01'],
      ),
    ).toThrow();
  });
});

describe('testers and gauges', () => {
  it('takes a gauge registered to a tester', () => {
    const store = migrated();
    addGauge(store);
    expect(selectAll(store, 'select * from gauges')).toHaveLength(1);
  });

  it('refuses a gauge with no tester behind it', () => {
    const store = migrated();
    expect(() =>
      execute(
        store,
        `insert into gauges (
           gauge_id, tester_id, maker, serial_number, calibrated_on,
           calibration_interval_months, accuracy_psid
         ) values (?, ?, ?, ?, ?, ?, ?)`,
        ['G-9', 'T-404', 'midwest', '1', '2024-01-01', 12, 0.2],
      ),
    ).toThrow();
  });

  it('will not delete a tester who still has a gauge', () => {
    const store = migrated();
    addGauge(store);
    expect(() => execute(store, 'delete from testers where tester_id = ?', ['T-118'])).toThrow();
  });

  it('refuses a certificate that expires before it was issued', () => {
    const store = migrated();
    expect(() =>
      execute(
        store,
        `insert into testers (tester_id, name, agency, certificate_number, issued_on, expires_on, endorsements)
         values (?, ?, ?, ?, ?, ?, ?)`,
        ['T-2', 'x', 'board', 'BF-2', '2024-01-01', '2023-01-01', 'DC'],
      ),
    ).toThrow();
  });

  it('refuses a gauge with no certified band', () => {
    const store = migrated();
    expect(() =>
      execute(
        store,
        `insert into gauges (
           gauge_id, tester_id, maker, serial_number, calibrated_on,
           calibration_interval_months, accuracy_psid
         ) values (?, ?, ?, ?, ?, ?, ?)`,
        ['G-8', 'T-118', 'midwest', '2', '2024-01-01', 12, 0],
      ),
    ).toThrow();
  });

  it('refuses the same certificate number twice at one agency', () => {
    const store = migrated();
    expect(() =>
      execute(
        store,
        `insert into testers (tester_id, name, agency, certificate_number, issued_on, expires_on, endorsements)
         values (?, ?, ?, ?, ?, ?, ?)`,
        ['T-3', 'other', 'state waterworks board', 'BF-4471', '2023-05-01', '2026-04-30', 'DC'],
      ),
    ).toThrow();
  });
});

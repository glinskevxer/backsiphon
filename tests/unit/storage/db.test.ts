import { afterEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  execute,
  foreignKeysOn,
  openDatabase,
  selectAll,
  selectOne,
  tableNames,
  withTransaction,
  type Database,
} from '../../../src/storage/db';

let db: Database | undefined;

function open(): Database {
  db = openDatabase({ file: ':memory:' });
  db.exec(`
    create table parent (id integer primary key, label text not null);
    create table child (
      id integer primary key,
      parent_id integer not null references parent (id),
      note text not null
    );
  `);
  return db;
}

afterEach(() => {
  if (db !== undefined) {
    closeDatabase(db);
    db = undefined;
  }
});

describe('opening', () => {
  it('turns foreign keys on', () => {
    expect(foreignKeysOn(open())).toBe(true);
  });

  it('refuses a child with no parent', () => {
    const store = open();
    expect(() => execute(store, 'insert into child values (1, 99, ?)', ['orphan'])).toThrow();
  });

  it('closes without complaining twice', () => {
    const store = open();
    closeDatabase(store);
    closeDatabase(store);
    expect(store.open).toBe(false);
    db = undefined;
  });

  it('lists the tables it holds', () => {
    expect(tableNames(open())).toEqual(['child', 'parent']);
  });
});

describe('reading', () => {
  it('reads one row or nothing', () => {
    const store = open();
    execute(store, 'insert into parent values (1, ?)', ['meter vault']);
    expect(
      selectOne<{ label: string }>(store, 'select label from parent where id = 1')?.label,
    ).toBe('meter vault');
    expect(selectOne(store, 'select label from parent where id = 2')).toBeUndefined();
  });

  it('reads a list and counts what it changed', () => {
    const store = open();
    expect(execute(store, 'insert into parent values (1, ?), (2, ?)', ['a', 'b'])).toBe(2);
    expect(selectAll<{ id: number }>(store, 'select id from parent order by id')).toHaveLength(2);
  });
});

describe('transactions', () => {
  it('commits the work of a block that returns', () => {
    const store = open();
    const inserted = withTransaction(store, () => {
      execute(store, 'insert into parent values (1, ?)', ['kept']);
      return 'done';
    });
    expect(inserted).toBe('done');
    expect(selectAll(store, 'select * from parent')).toHaveLength(1);
  });

  it('rolls the whole block back when it throws', () => {
    const store = open();
    expect(() =>
      withTransaction(store, () => {
        execute(store, 'insert into parent values (1, ?)', ['gone']);
        throw new Error('the readings did not arrive');
      }),
    ).toThrow('the readings did not arrive');
    expect(selectAll(store, 'select * from parent')).toHaveLength(0);
  });

  it('rolls an inner block back without losing the outer one', () => {
    const store = open();
    withTransaction(store, () => {
      execute(store, 'insert into parent values (1, ?)', ['outer']);
      try {
        withTransaction(store, () => {
          execute(store, 'insert into parent values (2, ?)', ['inner']);
          throw new Error('inner gave up');
        });
      } catch {
        // the outer block decides this is survivable
      }
    });
    const rows = selectAll<{ label: string }>(store, 'select label from parent');
    expect(rows.map((row) => row.label)).toEqual(['outer']);
  });

  it('leaves no transaction open after a failure', () => {
    const store = open();
    try {
      withTransaction(store, () => {
        throw new Error('nope');
      });
    } catch {
      // expected
    }
    expect(store.inTransaction).toBe(false);
    execute(store, 'insert into parent values (1, ?)', ['still writable']);
    expect(selectAll(store, 'select * from parent')).toHaveLength(1);
  });
});

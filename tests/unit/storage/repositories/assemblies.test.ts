import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, type Database } from '../../../../src/storage/db';
import { migrate } from '../../../../src/storage/schema';
import { insertConnection } from '../../../../src/storage/repositories/connections';
import {
  assemblyAtPoint,
  delistModel,
  findAssembly,
  findModel,
  insertAssembly,
  insertModel,
  listAssemblies,
  listModels,
  removeAssembly,
} from '../../../../src/storage/repositories/assemblies';
import type { InstalledAssembly } from '../../../../src/domain/deficiency';
import type { AssemblyModel } from '../../../../src/domain/approvals';

let db: Database;

const model: AssemblyModel = {
  modelId: 'WK-375',
  maker: 'watkin',
  model: '375 series',
  assemblyClass: 'RP',
  sizes: [0.75, 1, 1.5, 2],
  listedOn: '2016-04-01',
  note: 'the workhorse',
};

function assembly(overrides: Partial<InstalledAssembly> = {}): InstalledAssembly {
  return {
    assemblyId: 'BA-1',
    connectionId: 'SC-1',
    scope: 'containment',
    assemblyClass: 'RP',
    modelId: 'WK-375',
    serialNumber: '4471182',
    sizeInches: 2,
    installedOn: '2019-05-01',
    location: 'meter vault, north side',
    ...overrides,
  };
}

beforeEach(() => {
  db = openDatabase({ file: ':memory:' });
  const run = migrate(db, '2024-04-12T09:00:00Z');
  if (!run.ok) {
    throw new Error(run.error);
  }
  insertConnection(db, {
    connectionId: 'SC-1',
    accountNumber: 'A-1',
    premiseName: 'kerrigan plating',
    premiseAddress: '14 forge road',
    premiseUseCode: 'PLATING',
    serviceSizeInches: 2,
    fireService: false,
    purveyorMetered: true,
    connectedOn: '2015-01-01',
    route: 'north',
    outletElevationInches: 12,
    indoorRiser: false,
    downstreamShutoff: true,
    continuousPressureHours: 24,
  });
  insertModel(db, model);
});

afterEach(() => {
  closeDatabase(db);
});

describe('models', () => {
  it('reads the sizes back as numbers', () => {
    expect(findModel(db, 'WK-375')?.sizes).toEqual([0.75, 1, 1.5, 2]);
  });

  it('leaves an undelisted model without the field', () => {
    expect(findModel(db, 'WK-375')?.delistedOn).toBeUndefined();
  });

  it('lists them by class', () => {
    insertModel(db, { ...model, modelId: 'WK-350', assemblyClass: 'DC', sizes: [2, 3] });
    expect(listModels(db).map((entry) => entry.modelId)).toEqual(['WK-350', 'WK-375']);
    expect(listModels(db, 'DC').map((entry) => entry.modelId)).toEqual(['WK-350']);
  });

  it('refuses the same model twice', () => {
    expect(insertModel(db, model).ok).toBe(false);
  });

  it('takes one off the list from a date', () => {
    const result = delistModel(db, 'WK-375', '2023-09-30');
    expect(result.ok).toBe(true);
    expect(findModel(db, 'WK-375')?.delistedOn).toBe('2023-09-30');
  });

  it('will not delist twice or before the listing', () => {
    delistModel(db, 'WK-375', '2023-09-30');
    expect(delistModel(db, 'WK-375', '2024-01-01').ok).toBe(false);
    expect(delistModel(db, 'WK-404', '2024-01-01').ok).toBe(false);
    expect(insertModel(db, { ...model, modelId: 'WK-2' }).ok).toBe(true);
    expect(delistModel(db, 'WK-2', '2015-01-01').ok).toBe(false);
  });

  it('leaves the fitted assemblies alone when a model is delisted', () => {
    insertAssembly(db, assembly());
    delistModel(db, 'WK-375', '2023-09-30');
    expect(findAssembly(db, 'BA-1')?.modelId).toBe('WK-375');
  });
});

describe('assemblies', () => {
  it('reads one back with its location', () => {
    insertAssembly(db, assembly());
    const found = findAssembly(db, 'BA-1');
    expect(found?.location).toBe('meter vault, north side');
    expect(found?.removedOn).toBeUndefined();
  });

  it('refuses one against a model nobody has listed', () => {
    expect(insertAssembly(db, assembly({ modelId: 'ZZ-1' })).ok).toBe(false);
  });

  it('refuses the same serial twice on one model', () => {
    insertAssembly(db, assembly());
    const again = insertAssembly(db, assembly({ assemblyId: 'BA-2' }));
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.error).toContain('already on file');
    }
  });

  it('takes the same serial under a different model', () => {
    insertModel(db, { ...model, modelId: 'WK-350', assemblyClass: 'DC' });
    insertAssembly(db, assembly());
    expect(
      insertAssembly(db, assembly({ assemblyId: 'BA-2', modelId: 'WK-350', assemblyClass: 'DC' }))
        .ok,
    ).toBe(true);
  });

  it('filters by connection, scope and day', () => {
    insertAssembly(db, assembly());
    insertAssembly(
      db,
      assembly({
        assemblyId: 'BA-2',
        scope: 'isolation',
        serialNumber: '2',
        installedOn: '2021-01-01',
      }),
    );
    expect(listAssemblies(db, { connectionId: 'SC-1' })).toHaveLength(2);
    expect(listAssemblies(db, { scope: 'isolation' })).toHaveLength(1);
    expect(listAssemblies(db, { activeOn: '2020-01-01' })).toHaveLength(1);
    expect(listAssemblies(db, { activeOn: '2018-01-01' })).toHaveLength(0);
  });
});

describe('the assembly at a point', () => {
  it('is the one in the ground on the day', () => {
    insertAssembly(db, assembly({ removedOn: '2022-03-01' }));
    insertAssembly(
      db,
      assembly({ assemblyId: 'BA-2', serialNumber: '9', installedOn: '2022-03-01' }),
    );
    expect(assemblyAtPoint(db, 'SC-1', 'containment', '2021-01-01')?.assemblyId).toBe('BA-1');
    expect(assemblyAtPoint(db, 'SC-1', 'containment', '2023-01-01')?.assemblyId).toBe('BA-2');
    expect(assemblyAtPoint(db, 'SC-1', 'containment', '2018-01-01')).toBeUndefined();
  });

  it('is nothing at a point nobody has fitted', () => {
    insertAssembly(db, assembly());
    expect(assemblyAtPoint(db, 'SC-1', 'isolation', '2024-01-01')).toBeUndefined();
  });

  it('takes the newest when two are somehow in the ground at once', () => {
    insertAssembly(db, assembly());
    insertAssembly(
      db,
      assembly({ assemblyId: 'BA-2', serialNumber: '9', installedOn: '2020-01-01' }),
    );
    expect(assemblyAtPoint(db, 'SC-1', 'containment', '2024-01-01')?.assemblyId).toBe('BA-2');
  });
});

describe('taking one out', () => {
  beforeEach(() => {
    insertAssembly(db, assembly());
  });

  it('records the date', () => {
    expect(removeAssembly(db, 'BA-1', '2024-02-01').ok).toBe(true);
    expect(findAssembly(db, 'BA-1')?.removedOn).toBe('2024-02-01');
  });

  it('will not take one out twice, or before it went in, or if it is not there', () => {
    removeAssembly(db, 'BA-1', '2024-02-01');
    expect(removeAssembly(db, 'BA-1', '2024-03-01').ok).toBe(false);
    expect(removeAssembly(db, 'BA-404', '2024-03-01').ok).toBe(false);
    insertAssembly(db, assembly({ assemblyId: 'BA-3', serialNumber: '7' }));
    expect(removeAssembly(db, 'BA-3', '2019-05-01').ok).toBe(false);
  });
});

describe('serial numbers', () => {
  it('lets a body be refitted once the old row is closed', () => {
    insertAssembly(db, assembly());
    removeAssembly(db, 'BA-1', '2024-02-01');
    const again = insertAssembly(db, assembly({ assemblyId: 'BA-2', installedOn: '2024-02-01' }));
    expect(again.ok).toBe(true);
  });

  it('still refuses two live rows with the same serial on one model', () => {
    insertAssembly(db, assembly());
    expect(insertAssembly(db, assembly({ assemblyId: 'BA-2' })).ok).toBe(false);
  });

  it('keeps both rows so the history reads', () => {
    insertAssembly(db, assembly());
    removeAssembly(db, 'BA-1', '2024-02-01');
    insertAssembly(db, assembly({ assemblyId: 'BA-2', installedOn: '2024-02-01' }));
    expect(listAssemblies(db, { connectionId: 'SC-1' })).toHaveLength(2);
    expect(listAssemblies(db, { connectionId: 'SC-1', activeOn: '2024-03-01' })).toHaveLength(1);
  });
});

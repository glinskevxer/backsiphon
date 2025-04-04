import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../../src/service/register';
import { openConnection } from '../../../src/service/connections';
import {
  installAssembly,
  relocateAssembly,
  remedyForAssembly,
  swapAssembly,
  takeAssemblyOut,
  type InstallInput,
} from '../../../src/service/assemblies';
import {
  delistModel,
  findAssembly,
  insertModel,
  listAssemblies,
} from '../../../src/storage/repositories/assemblies';
import { eventsFor } from '../../../src/storage/repositories/events';

let register: Register;

function install(overrides: Partial<InstallInput> = {}): InstallInput {
  return {
    connectionId: 'SC-00001',
    scope: 'containment',
    assemblyClass: 'RP',
    modelId: 'WK-375',
    serialNumber: '4471182',
    sizeInches: 2,
    installedOn: '2021-06-01',
    location: 'meter vault, north side',
    ...overrides,
  };
}

beforeEach(() => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-06-10T09:00:00Z',
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
  openConnection(register, {
    accountNumber: 'A-1001',
    premiseName: 'kerrigan plating',
    premiseAddress: '14 forge road',
    premiseUseCode: 'PLATING',
    serviceSizeInches: 2,
    fireService: false,
    purveyorMetered: true,
    connectedOn: '2019-04-02',
  });
  insertModel(register.db, {
    modelId: 'WK-375',
    maker: 'watkin',
    model: '375 series',
    assemblyClass: 'RP',
    sizes: [1, 1.5, 2],
    listedOn: '2016-04-01',
    note: '',
  });
  insertModel(register.db, {
    modelId: 'CB-40S',
    maker: 'cobern',
    model: '40 spill resistant',
    assemblyClass: 'SVB',
    sizes: [0.75, 1],
    listedOn: '2019-11-12',
    note: '',
  });
});

afterEach(() => {
  closeRegister(register);
});

describe('putting one in', () => {
  it('mints an id and records the maker on the trail', () => {
    const fitted = installAssembly(register, install());
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) {
      return;
    }
    expect(fitted.value.assemblyId).toBe('BA-00001');
    const events = eventsFor(register.db, 'assembly', 'BA-00001');
    expect(events[0]?.detail).toContain('watkin 375 series');
    expect(events[0]?.detail).toContain('meter vault');
  });

  it('refuses a class that cannot sit at that point', () => {
    const result = installAssembly(
      register,
      install({ assemblyClass: 'SVB', modelId: 'CB-40S', sizeInches: 1 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not accepted at a containment point');
    }
  });

  it('refuses a model that is not listed at that size or as that class', () => {
    expect(installAssembly(register, install({ sizeInches: 6 })).ok).toBe(false);
    expect(installAssembly(register, install({ assemblyClass: 'DC' })).ok).toBe(false);
  });

  it('refuses a model that had not been listed on the day of the work', () => {
    expect(installAssembly(register, install({ installedOn: '2015-01-01' })).ok).toBe(false);
  });

  it('refuses a model that came off the list before the work', () => {
    delistModel(register.db, 'WK-375', '2020-01-01');
    expect(installAssembly(register, install({ installedOn: '2021-06-01' })).ok).toBe(false);
    expect(installAssembly(register, install({ installedOn: '2019-06-01' })).ok).toBe(true);
  });

  it('refuses a second assembly at a point that already has one', () => {
    installAssembly(register, install());
    const second = installAssembly(
      register,
      install({ serialNumber: '999', installedOn: '2022-01-01' }),
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toContain('BA-00001');
    }
  });

  it('takes one at the other scope of the same connection', () => {
    installAssembly(register, install());
    const isolation = installAssembly(
      register,
      install({
        scope: 'isolation',
        assemblyClass: 'SVB',
        modelId: 'CB-40S',
        sizeInches: 1,
        serialNumber: '888',
      }),
    );
    expect(isolation.ok).toBe(true);
    expect(listAssemblies(register.db, { connectionId: 'SC-00001' })).toHaveLength(2);
  });

  it('refuses one with nowhere written down', () => {
    expect(installAssembly(register, install({ location: '   ' })).ok).toBe(false);
  });

  it('refuses one on a connection that is not in service', () => {
    expect(installAssembly(register, install({ installedOn: '2018-01-01' })).ok).toBe(false);
    expect(installAssembly(register, install({ connectionId: 'SC-00404' })).ok).toBe(false);
  });
});

describe('taking one out', () => {
  beforeEach(() => {
    installAssembly(register, install());
  });

  it('records the date and the reason', () => {
    expect(takeAssemblyOut(register, 'BA-00001', '2024-02-01', 'body cracked by frost').ok).toBe(
      true,
    );
    expect(findAssembly(register.db, 'BA-00001')?.removedOn).toBe('2024-02-01');
    const events = eventsFor(register.db, 'assembly', 'BA-00001');
    expect(events[1]?.detail).toContain('frost');
  });

  it('will not take one out without a reason', () => {
    expect(takeAssemblyOut(register, 'BA-00001', '2024-02-01', '  ').ok).toBe(false);
  });

  it('frees the point for the next one', () => {
    takeAssemblyOut(register, 'BA-00001', '2024-02-01', 'cracked');
    expect(
      installAssembly(register, install({ serialNumber: '999', installedOn: '2024-02-01' })).ok,
    ).toBe(true);
  });
});

describe('swapping one', () => {
  beforeEach(() => {
    installAssembly(register, install());
  });

  it('takes the old one out and puts the new one in on the same day', () => {
    const swapped = swapAssembly(
      register,
      'BA-00001',
      {
        assemblyClass: 'RP',
        modelId: 'WK-375',
        serialNumber: '5582001',
        sizeInches: 2,
        installedOn: '2024-03-04',
        location: 'meter vault, north side',
      },
      'body cracked by frost',
    );
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) {
      return;
    }
    expect(swapped.value.removed.removedOn).toBe('2024-03-04');
    expect(swapped.value.installed.assemblyId).toBe('BA-00002');
    expect(
      listAssemblies(register.db, { connectionId: 'SC-00001', activeOn: '2024-03-04' }),
    ).toHaveLength(1);
  });

  it('leaves the old one in place when the new one is refused', () => {
    const swapped = swapAssembly(
      register,
      'BA-00001',
      {
        assemblyClass: 'RP',
        modelId: 'ZZ-1',
        serialNumber: '5582001',
        sizeInches: 2,
        installedOn: '2024-03-04',
        location: 'vault',
      },
      'cracked',
    );
    expect(swapped.ok).toBe(false);
    expect(findAssembly(register.db, 'BA-00001')?.removedOn).toBeUndefined();
    expect(listAssemblies(register.db, { connectionId: 'SC-00001' })).toHaveLength(1);
  });

  it('says so when there is nothing to swap', () => {
    expect(
      swapAssembly(
        register,
        'BA-00404',
        {
          assemblyClass: 'RP',
          modelId: 'WK-375',
          serialNumber: '1',
          sizeInches: 2,
          installedOn: '2024-03-04',
          location: 'vault',
        },
        'x',
      ).ok,
    ).toBe(false);
  });
});

describe('repair or replace', () => {
  beforeEach(() => {
    installAssembly(register, install());
  });

  it('is a repair while the model is listed', () => {
    const remedy = remedyForAssembly(register, 'BA-00001', '2024-06-01');
    expect(remedy.ok && remedy.value).toBe('repair');
  });

  it('is a replacement once the model has come off the list', () => {
    delistModel(register.db, 'WK-375', '2023-09-30');
    const remedy = remedyForAssembly(register, 'BA-00001', '2024-06-01');
    expect(remedy.ok && remedy.value).toBe('replace');
  });

  it('reads the list as at the date of the failure', () => {
    delistModel(register.db, 'WK-375', '2023-09-30');
    const earlier = remedyForAssembly(register, 'BA-00001', '2023-01-01');
    expect(earlier.ok && earlier.value).toBe('repair');
  });

  it('says so when the assembly is not on file', () => {
    expect(remedyForAssembly(register, 'BA-00404', '2024-06-01').ok).toBe(false);
  });
});

describe('moving one', () => {
  beforeEach(() => {
    installAssembly(register, install());
    openConnection(register, {
      accountNumber: 'A-1002',
      premiseName: 'the other shop',
      premiseAddress: '16 forge road',
      premiseUseCode: 'INDUSTRIAL',
      serviceSizeInches: 2,
      fireService: false,
      purveyorMetered: true,
      connectedOn: '2019-04-02',
    });
  });

  function move(
    overrides: Partial<Parameters<typeof relocateAssembly>[2]> = {},
  ): ReturnType<typeof relocateAssembly> {
    return relocateAssembly(register, 'BA-00001', {
      connectionId: 'SC-00002',
      scope: 'containment',
      location: 'meter box by the gate',
      on: '2024-03-04',
      reason: 'the shop moved next door and took it with them',
      ...overrides,
    });
  }

  it('takes it out of one point and puts it into the other under a new id', () => {
    const moved = move();
    expect(moved.ok).toBe(true);
    if (!moved.ok) {
      return;
    }
    expect(moved.value.from.assemblyId).toBe('BA-00001');
    expect(moved.value.to.assemblyId).toBe('BA-00002');
    expect(findAssembly(register.db, 'BA-00001')?.removedOn).toBe('2024-03-04');
    expect(findAssembly(register.db, 'BA-00002')?.location).toBe('meter box by the gate');
  });

  it('keeps the serial number, which is what the maker stamped on it', () => {
    const moved = move();
    expect(moved.ok && moved.value.to.serialNumber).toBe('4471182');
  });

  it('will not move a grandfathered assembly anywhere', () => {
    delistModel(register.db, 'WK-375', '2023-09-30');
    const moved = move();
    expect(moved.ok).toBe(false);
    if (!moved.ok) {
      expect(moved.error).toContain('cannot be moved');
    }
    expect(findAssembly(register.db, 'BA-00001')?.removedOn).toBeUndefined();
  });

  it('will not move it onto a point that is already occupied', () => {
    installAssembly(register, install({ connectionId: 'SC-00002', serialNumber: '999' }));
    const moved = move();
    expect(moved.ok).toBe(false);
    expect(findAssembly(register.db, 'BA-00001')?.removedOn).toBeUndefined();
  });

  it('will not move it to where it already is, or without a reason', () => {
    expect(move({ connectionId: 'SC-00001' }).ok).toBe(false);
    expect(move({ reason: '  ' }).ok).toBe(false);
  });

  it('leaves a line on the trail naming both points', () => {
    move();
    const events = eventsFor(register.db, 'assembly', 'BA-00002');
    expect(events.map((entry) => entry.kind)).toContain('assembly_moved');
    expect(events[events.length - 1]?.detail).toContain('SC-00001 containment');
  });
});

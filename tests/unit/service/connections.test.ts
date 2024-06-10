import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../../src/service/register';
import {
  changePremiseUse,
  closeConnection,
  openConnection,
  type NewConnection,
} from '../../../src/service/connections';
import {
  findConnection,
  listConnections,
  updateFixtureFacts,
} from '../../../src/storage/repositories/connections';
import { eventsFor } from '../../../src/storage/repositories/events';

let register: Register;

function input(overrides: Partial<NewConnection> = {}): NewConnection {
  return {
    accountNumber: 'A-1001',
    premiseName: 'kerrigan plating',
    premiseAddress: '14 forge road',
    premiseUseCode: 'PLATING',
    serviceSizeInches: 2,
    fireService: false,
    purveyorMetered: true,
    connectedOn: '2019-04-02',
    ...overrides,
  };
}

beforeEach(() => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-06-05T09:00:00Z',
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
});

afterEach(() => {
  closeRegister(register);
});

describe('opening one', () => {
  it('mints an id and stores it', () => {
    const opened = openConnection(register, input());
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    expect(opened.value.connectionId).toBe('SC-00001');
    expect(findConnection(register.db, 'SC-00001')?.premiseName).toBe('kerrigan plating');
  });

  it('counts up from what is already there', () => {
    openConnection(register, input());
    const second = openConnection(register, input({ accountNumber: 'A-1002' }));
    expect(second.ok && second.value.connectionId).toBe('SC-00002');
  });

  it('puts a line on the trail naming the use', () => {
    openConnection(register, input());
    const events = eventsFor(register.db, 'connection', 'SC-00001');
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('connection_opened');
    expect(events[0]?.actor).toBe('clerk.hines');
    expect(events[0]?.detail).toContain('metal finishing shop');
  });

  it('trims what the clerk typed', () => {
    const opened = openConnection(
      register,
      input({ accountNumber: ' A-1001 ', premiseName: '  kerrigan plating ' }),
    );
    expect(opened.ok && opened.value.accountNumber).toBe('A-1001');
    expect(opened.ok && opened.value.premiseName).toBe('kerrigan plating');
  });

  it('defaults the route rather than refusing', () => {
    const opened = openConnection(register, input());
    expect(opened.ok && opened.value.route).toBe('unassigned');
  });

  it('refuses a use code the taxonomy does not know', () => {
    const result = openConnection(register, input({ premiseUseCode: 'SPACEPORT' }));
    expect(result.ok).toBe(false);
    expect(listConnections(register.db)).toHaveLength(0);
  });

  it('refuses a bad date, an empty account and a size of nothing', () => {
    expect(openConnection(register, input({ connectedOn: '2 april 2019' })).ok).toBe(false);
    expect(openConnection(register, input({ accountNumber: '  ' })).ok).toBe(false);
    expect(openConnection(register, input({ serviceSizeInches: 0 })).ok).toBe(false);
  });

  it('leaves no event behind when the write is refused', () => {
    openConnection(register, input());
    const clash = openConnection(register, input({ premiseName: 'another' }));
    expect(clash.ok).toBe(false);
    expect(eventsFor(register.db, 'connection', 'SC-00002')).toEqual([]);
  });
});

describe('a change of tenant', () => {
  beforeEach(() => {
    openConnection(register, input());
  });

  it('writes the new use and asks for a fresh survey', () => {
    const changed = changePremiseUse(register, 'SC-00001', {
      premiseUseCode: 'WAREHOUSE',
      premiseName: 'forge road storage',
      on: '2024-06-01',
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) {
      return;
    }
    expect(changed.value.resurveyNeeded).toBe(true);
    expect(changed.value.previousUseCode).toBe('PLATING');
    expect(findConnection(register.db, 'SC-00001')?.premiseUseCode).toBe('WAREHOUSE');
  });

  it('records what it was and what it became', () => {
    changePremiseUse(register, 'SC-00001', { premiseUseCode: 'WAREHOUSE', on: '2024-06-01' });
    const events = eventsFor(register.db, 'connection', 'SC-00001');
    expect(events[1]?.kind).toBe('premise_use_changed');
    expect(events[1]?.detail).toContain('PLATING became WAREHOUSE');
  });

  it('refuses a change to the same use, an unknown use, or a missing connection', () => {
    expect(changePremiseUse(register, 'SC-00001', { premiseUseCode: 'PLATING', on: '2024-06-01' }).ok).toBe(false);
    expect(changePremiseUse(register, 'SC-00001', { premiseUseCode: 'SPACEPORT', on: '2024-06-01' }).ok).toBe(false);
    expect(changePremiseUse(register, 'SC-00404', { premiseUseCode: 'OFFICE', on: '2024-06-01' }).ok).toBe(false);
  });
});

describe('closing one', () => {
  beforeEach(() => {
    openConnection(register, input());
  });

  it('records the date and the reason', () => {
    const closed = closeConnection(register, 'SC-00001', '2024-05-31', 'premise demolished');
    expect(closed.ok).toBe(true);
    expect(findConnection(register.db, 'SC-00001')?.disconnectedOn).toBe('2024-05-31');
    const events = eventsFor(register.db, 'connection', 'SC-00001');
    expect(events[1]?.detail).toContain('demolished');
  });

  it('will not close without a reason or twice', () => {
    expect(closeConnection(register, 'SC-00001', '2024-05-31', '   ').ok).toBe(false);
    closeConnection(register, 'SC-00001', '2024-05-31', 'premise demolished');
    expect(closeConnection(register, 'SC-00001', '2024-06-30', 'again').ok).toBe(false);
  });
});

describe('the fixture geometry', () => {
  it('takes the conservative defaults when nobody has measured', () => {
    const opened = openConnection(register, input());
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    expect(opened.value.outletElevationInches).toBe(12);
    expect(opened.value.indoorRiser).toBe(false);
    expect(opened.value.downstreamShutoff).toBe(true);
    expect(opened.value.continuousPressureHours).toBe(24);
  });

  it('takes what the surveyor measured', () => {
    const opened = openConnection(
      register,
      input({
        outletElevationInches: 8,
        indoorRiser: true,
        downstreamShutoff: false,
        continuousPressureHours: 4,
      }),
    );
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    expect(opened.value.outletElevationInches).toBe(8);
    expect(opened.value.indoorRiser).toBe(true);
    expect(opened.value.downstreamShutoff).toBe(false);
    expect(opened.value.continuousPressureHours).toBe(4);
  });

  it('writes a correction onto an existing connection', () => {
    openConnection(register, input());
    const changed = updateFixtureFacts(register.db, 'SC-00001', {
      outletElevationInches: 6,
      indoorRiser: true,
    });
    expect(changed.ok).toBe(true);
    const found = findConnection(register.db, 'SC-00001');
    expect(found?.outletElevationInches).toBe(6);
    expect(found?.indoorRiser).toBe(true);
    expect(found?.downstreamShutoff).toBe(true);
  });

  it('refuses geometry that cannot be true', () => {
    openConnection(register, input());
    expect(updateFixtureFacts(register.db, 'SC-00001', { outletElevationInches: -2 }).ok).toBe(false);
    expect(updateFixtureFacts(register.db, 'SC-00001', { continuousPressureHours: 30 }).ok).toBe(false);
    expect(updateFixtureFacts(register.db, 'SC-00404', { indoorRiser: true }).ok).toBe(false);
  });
});

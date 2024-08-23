import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../../src/service/register';
import { openConnection } from '../../../src/service/connections';
import { recordSurvey } from '../../../src/service/surveys';
import { installAssembly } from '../../../src/service/assemblies';
import { applyForVariance, decideGrant, decideRefusal, revoke } from '../../../src/service/variances';
import { protectionStatus } from '../../../src/service/protection';
import { insertModel } from '../../../src/storage/repositories/assemblies';
import { findVariance } from '../../../src/storage/repositories/variances';
import { eventsFor } from '../../../src/storage/repositories/events';

let register: Register;

function setUp(findings: string[]): string {
  const opened = openConnection(register, {
    accountNumber: `A-${Math.random().toString().slice(2, 8)}`,
    premiseName: 'kerrigan plating',
    premiseAddress: '14 forge road',
    premiseUseCode: 'INDUSTRIAL',
    serviceSizeInches: 2,
    fireService: false,
    purveyorMetered: true,
    connectedOn: '2018-01-01',
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  const surveyed = recordSurvey(register, {
    connectionId: opened.value.connectionId,
    surveyedOn: '2023-01-10',
    surveyor: 'r. okafor',
    findingCodes: findings,
    accessGranted: true,
  });
  if (!surveyed.ok) {
    throw new Error(surveyed.error);
  }
  return opened.value.connectionId;
}

beforeEach(() => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-08-28T09:00:00Z',
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
  insertModel(register.db, {
    modelId: 'WK-350',
    maker: 'watkin',
    model: '350',
    assemblyClass: 'DC',
    sizes: [2],
    listedOn: '2016-04-01',
    note: '',
  });
});

afterEach(() => {
  closeRegister(register);
});

describe('applying', () => {
  it('takes an application against the standing requirement', () => {
    const id = setUp(['AUX_WELL']);
    const applied = applyForVariance(register, {
      connectionId: id,
      appliedOn: '2024-03-01',
      acceptedClass: 'DC',
      note: 'the well was capped last year',
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(applied.value.varianceId).toBe('V-0001');
    expect(applied.value.grantedAgainstDegree).toBe('health');
    expect(eventsFor(register.db, 'variance', 'V-0001')[0]?.detail).toContain('where a RP is required');
  });

  it('refuses one that asks for something already accepted', () => {
    const id = setUp(['AUX_WELL']);
    const applied = applyForVariance(register, {
      connectionId: id,
      appliedOn: '2024-03-01',
      acceptedClass: 'RPDA',
    });
    expect(applied.ok).toBe(false);
    if (!applied.ok) {
      expect(applied.error).toContain('no variance is needed');
    }
  });

  it('refuses one against an air gap', () => {
    const id = setUp(['RECLAIMED']);
    const applied = applyForVariance(register, {
      connectionId: id,
      appliedOn: '2024-03-01',
      acceptedClass: 'RP',
    });
    expect(applied.ok).toBe(false);
    if (!applied.ok) {
      expect(applied.error).toContain('cannot be varied');
    }
  });

  it('refuses a second application while one is pending', () => {
    const id = setUp(['AUX_WELL']);
    applyForVariance(register, { connectionId: id, appliedOn: '2024-03-01', acceptedClass: 'DC' });
    const again = applyForVariance(register, {
      connectionId: id,
      appliedOn: '2024-04-01',
      acceptedClass: 'DC',
    });
    expect(again.ok).toBe(false);
  });

  it('refuses one on a connection nobody has walked', () => {
    const opened = openConnection(register, {
      accountNumber: 'A-9999',
      premiseName: 'unwalked',
      premiseAddress: 'somewhere',
      premiseUseCode: 'OFFICE',
      serviceSizeInches: 1,
      fireService: false,
      purveyorMetered: true,
      connectedOn: '2020-01-01',
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const applied = applyForVariance(register, {
      connectionId: opened.value.connectionId,
      appliedOn: '2024-03-01',
      acceptedClass: 'DC',
    });
    expect(applied.ok).toBe(false);
  });
});

describe('deciding', () => {
  let connectionId: string;

  beforeEach(() => {
    connectionId = setUp(['AUX_WELL']);
    applyForVariance(register, {
      connectionId,
      appliedOn: '2024-03-01',
      acceptedClass: 'DC',
    });
  });

  it('grants one on conditions and it takes effect', () => {
    const granted = decideGrant(register, 'V-0001', {
      decidedOn: '2024-03-20',
      effectiveFrom: '2024-04-01',
      expiresOn: '2025-03-31',
      conditions: ['the well stays capped', 'quarterly inspection'],
    });
    expect(granted.ok).toBe(true);
    installAssembly(register, {
      connectionId,
      scope: 'containment',
      assemblyClass: 'DC',
      modelId: 'WK-350',
      serialNumber: '1',
      sizeInches: 2,
      installedOn: '2024-04-02',
      location: 'vault',
    });
    const status = protectionStatus(register, connectionId, '2024-06-01');
    expect(status.ok && status.value.containment.effectiveClass).toBe('DC');
    expect(status.ok && status.value.containment.deficiency.kind).toBe('none');
  });

  it('will not grant one with no conditions on it', () => {
    const granted = decideGrant(register, 'V-0001', {
      decidedOn: '2024-03-20',
      effectiveFrom: '2024-04-01',
      conditions: [],
    });
    expect(granted.ok).toBe(false);
  });

  it('refuses one with a reason and writes it on the trail', () => {
    const denied = decideRefusal(register, 'V-0001', '2024-03-20', 'the injector is still there');
    expect(denied.ok).toBe(true);
    expect(findVariance(register.db, 'V-0001')?.decision).toBe('denied');
    expect(eventsFor(register.db, 'variance', 'V-0001')[1]?.kind).toBe('variance_denied');
  });

  it('revokes a granted one and the requirement comes back', () => {
    decideGrant(register, 'V-0001', {
      decidedOn: '2024-03-20',
      effectiveFrom: '2024-04-01',
      conditions: ['the well stays capped'],
    });
    installAssembly(register, {
      connectionId,
      scope: 'containment',
      assemblyClass: 'DC',
      modelId: 'WK-350',
      serialNumber: '2',
      sizeInches: 2,
      installedOn: '2024-04-02',
      location: 'vault',
    });
    expect(revoke(register, 'V-0001', '2024-09-01', 'the cap came off').ok).toBe(true);
    const status = protectionStatus(register, connectionId, '2024-09-02');
    expect(status.ok && status.value.containment.effectiveClass).toBe('RP');
    expect(status.ok && status.value.containment.deficiency.kind).toBe('wrong_class');
  });

  it('will not revoke without a reason or one that was never granted', () => {
    expect(revoke(register, 'V-0001', '2024-09-01', '  ').ok).toBe(false);
    expect(revoke(register, 'V-0001', '2024-09-01', 'because').ok).toBe(false);
  });

  it('says so when there is no such variance', () => {
    expect(
      decideGrant(register, 'V-0404', {
        decidedOn: '2024-03-20',
        effectiveFrom: '2024-04-01',
        conditions: ['x'],
      }).ok,
    ).toBe(false);
  });
});

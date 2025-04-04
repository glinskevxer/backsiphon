import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../../src/service/register';
import { loadDemoDistrict } from '../../../src/service/demo';
import { programSummary } from '../../../src/service/reporting';
import { complianceFor } from '../../../src/service/compliance';
import { listConnections } from '../../../src/storage/repositories/connections';
import { openConnection } from '../../../src/service/connections';

let register: Register;

beforeEach(() => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-11-04T09:00:00Z',
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
});

afterEach(() => {
  closeRegister(register);
});

describe('the demo district', () => {
  it('builds the same district every time', () => {
    const loaded = loadDemoDistrict(register, '2024-11-04');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(loaded.value.connections).toBe(11);
    expect(loaded.value.assemblies).toBe(8);
    expect(loaded.value.reports).toBe(6);
    expect(listConnections(register.db)).toHaveLength(11);
  });

  it('leaves the district in a state worth teaching from', () => {
    loadDemoDistrict(register, '2024-11-04');
    const summary = programSummary(register, '2024-11-04');
    expect(summary.byStanding.compliant).toBeGreaterThan(0);
    expect(summary.byStanding.deficient).toBeGreaterThan(0);
    expect(summary.byStanding.shutoff_eligible).toBeGreaterThan(0);
    expect(summary.byDegree.health).toBeGreaterThan(0);
  });

  it('puts an air gap requirement on the works and nothing mechanical will do', () => {
    loadDemoDistrict(register, '2024-11-04');
    const works = listConnections(register.db).find((entry) => entry.accountNumber === 'A-1010');
    expect(works).toBeDefined();
    if (works === undefined) {
      return;
    }
    const status = complianceFor(register, works.connectionId, '2024-11-04');
    expect(status.ok && status.value.containment.point.requiredClass).toBe('AG');
  });

  it('leaves a failed test on the nursery, which is on the repair clock', () => {
    loadDemoDistrict(register, '2024-11-04');
    const nursery = listConnections(register.db).find((entry) => entry.accountNumber === 'A-1006');
    expect(nursery).toBeDefined();
    if (nursery === undefined) {
      return;
    }
    const status = complianceFor(register, nursery.connectionId, '2024-01-16');
    expect(status.ok && status.value.containment.due?.basis).toBe('repair');
  });

  it('refuses to touch a register that has anything on it', () => {
    openConnection(register, {
      accountNumber: 'A-9999',
      premiseName: 'somebody real',
      premiseAddress: 'somewhere',
      premiseUseCode: 'OFFICE',
      serviceSizeInches: 1,
      fireService: false,
      purveyorMetered: true,
      connectedOn: '2020-01-01',
    });
    const loaded = loadDemoDistrict(register, '2024-11-04');
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error).toContain('already has connections');
    }
  });
});

/**
 * A year on one connection, start to finish.
 *
 * This is the test that would have caught every wiring mistake the unit tests
 * cannot see, because each step reads what the previous one wrote.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { complianceFor } from '../../src/service/compliance';
import { runNotices } from '../../src/service/notices';
import { invoiceFor } from '../../src/service/billing';
import { swapAssembly } from '../../src/service/assemblies';
import { openNotices } from '../../src/storage/repositories/notices';
import { fileTest, fit, open, openOffice, walk, FAILING_RP, type Office } from '../support/office';

let office: Office;

function standing(connectionId: string, asOf: string): string {
  const status = complianceFor(office.register, connectionId, asOf);
  if (!status.ok) {
    throw new Error(status.error);
  }
  return status.value.standing;
}

beforeEach(() => {
  office = openOffice();
});

afterEach(() => {
  office.close();
});

describe('a plating shop through one year', () => {
  it('walks from a survey to a shutoff and back to compliant', () => {
    const connectionId = open(office, { accountNumber: 'A-4471', premiseUseCode: 'INDUSTRIAL' });

    // nobody has walked it, so nothing can be said about it at all
    expect(complianceFor(office.register, connectionId, '2024-01-02').ok).toBe(false);

    // the survey finds a well, which makes it a health hazard at the meter
    walk(office, connectionId, '2024-01-15', ['AUX_WELL']);
    expect(standing(connectionId, '2024-01-16')).toBe('deficient');

    // the customer fits the right class and has it tested
    const assemblyId = fit(office, { connectionId, installedOn: '2024-02-01' });
    // a new assembly gets ten days to be tested before anybody writes to them
    const grace = complianceFor(office.register, connectionId, '2024-02-02');
    expect(grace.ok && grace.value.containment.due?.basis).toBe('first_test');
    expect(standing(connectionId, '2024-02-02')).toBe('compliant');
    expect(standing(connectionId, '2024-02-12')).toBe('overdue');

    const firstTest = fileTest(office, { assemblyId, testedOn: '2024-02-05' });
    expect(firstTest.ok && firstTest.value.evaluation.outcome).toBe('pass');
    expect(standing(connectionId, '2024-02-06')).toBe('compliant');

    // a year later it is due again and nobody has come
    expect(standing(connectionId, '2025-02-05')).toBe('compliant');
    expect(standing(connectionId, '2025-02-06')).toBe('overdue');

    // the letters go out on the health ladder, which reaches shutoff in thirty days
    const first = runNotices(office.register, { asOf: '2025-02-10' });
    expect(first.ok && first.value.issued[0]?.stage).toBe('first');
    const second = runNotices(office.register, { asOf: '2025-02-25' });
    expect(second.ok && second.value.issued[0]?.stage).toBe('second');
    const final = runNotices(office.register, { asOf: '2025-03-05' });
    expect(final.ok && final.value.issued[0]?.stage).toBe('final');
    const shutoff = runNotices(office.register, { asOf: '2025-03-10' });
    expect(shutoff.ok && shutoff.value.issued[0]?.stage).toBe('shutoff');
    expect(standing(connectionId, '2025-03-10')).toBe('shutoff_eligible');

    // the invoice at that point carries the whole penalty ladder
    const invoice = invoiceFor(office.register, connectionId, '2025-03-10');
    expect(invoice.ok).toBe(true);
    if (!invoice.ok) {
      return;
    }
    expect(invoice.value.invoice.lines.map((line) => line.code)).toEqual([
      'ANNUAL-B2',
      'LATE1',
      'LATE2',
      'SHUTOFF',
      'HEALTH',
    ]);

    // a tester finally comes out and the assembly fails
    const failed = fileTest(office, {
      assemblyId,
      testedOn: '2025-03-12',
      asFound: FAILING_RP,
    });
    expect(failed.ok && failed.value.evaluation.outcome).toBe('fail');
    expect(openNotices(office.register.db)).toHaveLength(4);

    // it is on the repair clock now, five working days
    const repairDue = complianceFor(office.register, connectionId, '2025-03-13');
    expect(repairDue.ok && repairDue.value.containment.due?.basis).toBe('repair');
    expect(repairDue.ok && repairDue.value.containment.due?.due).toBe('2025-03-19');

    // the body is cracked, so it is swapped rather than repaired
    const swapped = swapAssembly(
      office.register,
      assemblyId,
      {
        assemblyClass: 'RP',
        modelId: 'WK-375',
        serialNumber: 'S-9001',
        sizeInches: 2,
        installedOn: '2025-03-17',
        location: 'meter vault',
      },
      'body cracked at the relief port',
    );
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) {
      return;
    }

    // the new one passes, which clears every letter at once
    const passed = fileTest(office, {
      assemblyId: swapped.value.installed.assemblyId,
      testedOn: '2025-03-18',
    });
    expect(passed.ok && passed.value.noticesCleared).toBe(4);
    expect(openNotices(office.register.db)).toEqual([]);
    expect(standing(connectionId, '2025-03-19')).toBe('compliant');

    // and the cycle now runs from the new passing test
    const after = complianceFor(office.register, connectionId, '2025-03-19');
    expect(after.ok && after.value.containment.due?.due).toBe('2026-03-18');
  });
});

describe('a survey that finds the premise worse', () => {
  it('makes an assembly that was right yesterday wrong today', () => {
    const connectionId = open(office, { accountNumber: 'A-5502' });
    walk(office, connectionId, '2024-01-15', ['FIRE_PLAIN']);

    const assemblyId = fit(office, {
      connectionId,
      assemblyClass: 'DC',
      modelId: 'WK-350',
      installedOn: '2024-02-01',
    });
    fileTest(office, {
      assemblyId,
      testedOn: '2024-02-05',
      asFound: { check1Differential: 2.4, check2Differential: 1.8 },
    });
    expect(standing(connectionId, '2024-02-06')).toBe('compliant');

    // the next survey finds a chemical injector on the irrigation line
    walk(office, connectionId, '2024-08-01', ['FIRE_PLAIN', 'IRRIG_CHEM']);
    const after = complianceFor(office.register, connectionId, '2024-08-02');
    expect(after.ok).toBe(true);
    if (!after.ok) {
      return;
    }
    expect(after.value.containment.point.requiredClass).toBe('RP');
    expect(after.value.containment.point.deficiency.kind).toBe('wrong_class');
    expect(after.value.containment.point.deficiency.missing).toEqual(['stopsHealthHazard']);
    expect(after.value.standing).toBe('deficient');
    expect(after.value.urgency).toBe('immediate');
  });
});

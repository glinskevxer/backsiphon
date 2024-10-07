/**
 * The variance path, which is the one people get wrong.
 *
 * A variance changes the class the office will accept and nothing else. These
 * tests hold the calendar still and check that the test cycle, the notice
 * ladder and the survey all behave exactly as they did before it was granted.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { complianceFor } from '../../src/service/compliance';
import { runNotices } from '../../src/service/notices';
import { applyForVariance, decideGrant, decideRefusal, revoke } from '../../src/service/variances';
import { invoiceFor } from '../../src/service/billing';
import { protectionStatus } from '../../src/service/protection';
import { fileTest, fit, open, openOffice, walk, PASSING_DC, type Office } from '../support/office';

let office: Office;

beforeEach(() => {
  office = openOffice();
});

afterEach(() => {
  office.close();
});

describe('a variance that is granted', () => {
  it('accepts a lesser class without touching the calendar', () => {
    const connectionId = open(office, { accountNumber: 'A-7001' });
    walk(office, connectionId, '2024-01-15', ['AUX_WELL']);

    // the customer has a double check in and asks to keep it
    const assemblyId = fit(office, {
      connectionId,
      assemblyClass: 'DC',
      modelId: 'WK-350',
      installedOn: '2024-02-01',
    });
    const before = protectionStatus(office.register, connectionId, '2024-02-02');
    expect(before.ok && before.value.containment.deficiency.kind).toBe('wrong_class');

    const applied = applyForVariance(office.register, {
      connectionId,
      appliedOn: '2024-02-03',
      acceptedClass: 'DC',
      note: 'the well has been capped and the pump removed',
    });
    expect(applied.ok).toBe(true);

    // while it is pending the ladder is not held, because this is a health hazard
    fileTest(office, { assemblyId, testedOn: '2024-02-05', asFound: PASSING_DC });
    const pending = complianceFor(office.register, connectionId, '2025-02-20');
    expect(pending.ok && pending.value.containment.delinquency?.held).toBe(false);

    const granted = decideGrant(office.register, 'V-0001', {
      decidedOn: '2024-02-20',
      effectiveFrom: '2024-03-01',
      expiresOn: '2025-02-28',
      conditions: ['the well stays capped', 'the office may inspect on demand'],
    });
    expect(granted.ok).toBe(true);

    // from the effective date the fitted double check answers the requirement
    const after = complianceFor(office.register, connectionId, '2024-03-02');
    expect(after.ok).toBe(true);
    if (!after.ok) {
      return;
    }
    expect(after.value.containment.point.requiredClass).toBe('RP');
    expect(after.value.containment.point.effectiveClass).toBe('DC');
    expect(after.value.standing).toBe('compliant');

    // the test date is where it always was, a year from the passing test
    expect(after.value.containment.due?.due).toBe('2025-02-05');

    // and the invoice drops to the double check band
    const invoice = invoiceFor(office.register, connectionId, '2024-03-02');
    expect(invoice.ok && invoice.value.requiredClass).toBe('DC');
    expect(invoice.ok && invoice.value.invoice.lines[0]?.cents).toBe(7800);

    // when it expires the requirement comes back on its own
    const expired = complianceFor(office.register, connectionId, '2025-03-01');
    expect(expired.ok && expired.value.containment.point.effectiveClass).toBe('RP');
    expect(expired.ok && expired.value.containment.point.deficiency.kind).toBe('wrong_class');
  });

  it('is void from the day a survey finds the premise worse', () => {
    const connectionId = open(office, {
      accountNumber: 'A-7002',
      outletElevationInches: 20,
      indoorRiser: true,
    });
    // an indoor riser over a photographic bath asks for the spill resistant
    // breaker, and nothing here reaches the meter, so containment stays at a
    // pollutional hazard
    walk(office, connectionId, '2024-01-15', ['FIRE_PLAIN', 'PHOTO_LAB']);
    fit(office, {
      connectionId,
      assemblyClass: 'PVB',
      modelId: 'CB-40P',
      scope: 'isolation',
      sizeInches: 1,
      installedOn: '2024-02-01',
    });

    applyForVariance(office.register, {
      connectionId,
      appliedOn: '2024-02-03',
      acceptedClass: 'PVB',
      scope: 'isolation',
    });
    const granted = decideGrant(office.register, 'V-0001', {
      decidedOn: '2024-02-20',
      effectiveFrom: '2024-03-01',
      conditions: ['no injector on the line'],
    });
    expect(granted.ok).toBe(true);

    const before = protectionStatus(office.register, connectionId, '2024-03-02');
    expect(before.ok && before.value.isolation.varianceStatus).toBe('in_effect');

    walk(office, connectionId, '2024-06-01', ['FIRE_PLAIN', 'PHOTO_LAB', 'AUX_WELL']);
    const after = protectionStatus(office.register, connectionId, '2024-06-02');
    expect(after.ok && after.value.isolation.varianceStatus).toBe('void_degree_raised');
  });

  it('comes off the moment it is revoked', () => {
    const connectionId = open(office, { accountNumber: 'A-7003' });
    walk(office, connectionId, '2024-01-15', ['AUX_WELL']);
    fit(office, {
      connectionId,
      assemblyClass: 'DC',
      modelId: 'WK-350',
      installedOn: '2024-02-01',
    });
    applyForVariance(office.register, {
      connectionId,
      appliedOn: '2024-02-03',
      acceptedClass: 'DC',
    });
    decideGrant(office.register, 'V-0001', {
      decidedOn: '2024-02-20',
      effectiveFrom: '2024-03-01',
      conditions: ['the well stays capped'],
    });
    expect(revoke(office.register, 'V-0001', '2024-09-01', 'the cap was found off').ok).toBe(true);

    const before = complianceFor(office.register, connectionId, '2024-08-31');
    expect(before.ok && before.value.containment.point.effectiveClass).toBe('DC');
    const after = complianceFor(office.register, connectionId, '2024-09-01');
    expect(after.ok && after.value.containment.point.effectiveClass).toBe('RP');
    // nothing was ever tested here either, so the letters had already run out
    expect(after.ok && after.value.standing).toBe('shutoff_eligible');
  });
});

describe('a variance that is pending on a pollutional hazard', () => {
  it('holds the letters until it is decided', () => {
    const connectionId = open(office, { accountNumber: 'A-7004' });
    walk(office, connectionId, '2024-01-15', ['FIRE_PLAIN']);
    const assemblyId = fit(office, {
      connectionId,
      assemblyClass: 'DC',
      modelId: 'WK-350',
      installedOn: '2024-02-01',
    });
    fileTest(office, { assemblyId, testedOn: '2024-02-05', asFound: PASSING_DC });

    applyForVariance(office.register, {
      connectionId,
      appliedOn: '2025-01-05',
      acceptedClass: 'PVB',
    });

    // the test falls due while the application is in front of the office
    const held = runNotices(office.register, { asOf: '2025-04-01' });
    expect(held.ok && held.value.issued).toEqual([]);
    const status = complianceFor(office.register, connectionId, '2025-04-01');
    expect(status.ok && status.value.containment.delinquency?.held).toBe(true);

    // once it is refused the ladder starts climbing from where it was
    decideRefusal(office.register, 'V-0001', '2025-04-02', 'a breaker cannot sit on a fire line');
    const letters = runNotices(office.register, { asOf: '2025-04-03' });
    expect(letters.ok && letters.value.issued[0]?.stage).toBe('final');
  });
});

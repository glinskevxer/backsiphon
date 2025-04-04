/**
 * What a refused report does and does not do.
 *
 * The rule the office argues about with contractors: a report it cannot accept
 * leaves the assembly exactly where it was. Not failed, not tested, not
 * anything. These tests hold that in place from both ends, because the cheap
 * mistake is to file the readings and quietly move the due date.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { complianceFor } from '../../src/service/compliance';
import { runNotices } from '../../src/service/notices';
import { importReportsCsv } from '../../src/service/imports';
import { lastPassingTest, reportsForAssembly } from '../../src/storage/repositories/reports';
import {
  recalibrate,
  renewCertificate,
  suspendTester,
} from '../../src/storage/repositories/testers';
import { fileTest, fit, open, openOffice, walk, PASSING_RP, type Office } from '../support/office';

let office: Office;

function dueDate(connectionId: string, asOf: string): string | undefined {
  const status = complianceFor(office.register, connectionId, asOf);
  return status.ok ? status.value.containment.due?.due : undefined;
}

beforeEach(() => {
  office = openOffice();
});

afterEach(() => {
  office.close();
});

describe('a report the office cannot accept', () => {
  it('leaves the due date and the ladder exactly where they were', () => {
    const connectionId = open(office, { accountNumber: 'A-8001' });
    walk(office, connectionId, '2023-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2023-02-01' });
    fileTest(office, { assemblyId, testedOn: '2023-02-05' });
    expect(dueDate(connectionId, '2024-01-01')).toBe('2024-02-05');

    // the tester is suspended in the new year and tests it anyway
    suspendTester(office.register.db, 'T-118', '2024-01-01', 'falsified three reports');
    const refused = fileTest(office, { assemblyId, testedOn: '2024-02-01' });
    expect(refused.ok).toBe(true);
    if (!refused.ok) {
      return;
    }
    expect(refused.value.ruling.admissible).toBe(false);
    expect(refused.value.evaluation.outcome).toBe('pass');

    // the readings are on file and they change nothing
    expect(reportsForAssembly(office.register.db, assemblyId)).toHaveLength(2);
    expect(dueDate(connectionId, '2024-02-10')).toBe('2024-02-05');
    expect(lastPassingTest(office.register.db, assemblyId)?.report.testedOn).toBe('2023-02-05');

    // so the letters carry on climbing
    const letters = runNotices(office.register, { asOf: '2024-02-20' });
    expect(letters.ok && letters.value.issued[0]?.stage).toBe('second');
  });

  it('is accepted again the moment the certificate is renewed', () => {
    const connectionId = open(office, { accountNumber: 'A-8002' });
    walk(office, connectionId, '2023-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2023-02-01' });

    // the certificate ran out at the end of january
    renewCertificate(office.register.db, 'T-118', '2015-05-01', '2024-01-31', ['RP']);
    const late = fileTest(office, { assemblyId, testedOn: '2024-02-05' });
    expect(late.ok && late.value.stored.inadmissibleCodes).toEqual(['tester_not_certified']);

    renewCertificate(office.register.db, 'T-118', '2024-02-10', '2027-02-09', ['RP']);
    const good = fileTest(office, { assemblyId, testedOn: '2024-02-15' });
    expect(good.ok && good.value.ruling.admissible).toBe(true);
    expect(dueDate(connectionId, '2024-03-01')).toBe('2025-02-15');
  });

  it('is refused for the gauge as well as the tester', () => {
    const connectionId = open(office, { accountNumber: 'A-8003' });
    walk(office, connectionId, '2023-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2023-02-01' });

    // the gauge is recalibrated to a band the office will not accept
    recalibrate(office.register.db, 'G-77', '2024-01-05', 1.5);
    const refused = fileTest(office, { assemblyId, testedOn: '2024-02-05' });
    expect(refused.ok && refused.value.stored.inadmissibleCodes).toEqual(['gauge_band_too_wide']);

    recalibrate(office.register.db, 'G-77', '2024-02-10', 0.2);
    const good = fileTest(office, { assemblyId, testedOn: '2024-02-15' });
    expect(good.ok && good.value.ruling.admissible).toBe(true);
  });

  it('is refused row by row inside a batch without stopping the others', () => {
    const first = open(office, { accountNumber: 'A-8004' });
    const second = open(office, { accountNumber: 'A-8005' });
    walk(office, first, '2023-01-10', ['AUX_WELL']);
    walk(office, second, '2023-01-10', ['AUX_WELL']);
    const firstAssembly = fit(office, { connectionId: first, installedOn: '2023-02-01' });
    const secondAssembly = fit(office, { connectionId: second, installedOn: '2023-02-01' });

    const batch = [
      'assembly,tester,gauge,tested,filed,found.check1Differential,found.reliefOpening',
      `${firstAssembly},T-118,G-77,2024-02-05,2024-02-06,8.2,3.1`,
      `${secondAssembly},T-118,G-77,2024-02-05,2024-06-01,8.2,3.1`,
    ].join('\n');

    const summary = importReportsCsv(office.register, batch);
    expect(summary.ok).toBe(true);
    if (!summary.ok) {
      return;
    }
    expect(summary.value.accepted).toBe(1);
    expect(summary.value.refused).toBe(1);
    expect(dueDate(first, '2024-03-01')).toBe('2025-02-05');
    expect(dueDate(second, '2024-03-01')).toBe('2023-02-11');
  });
});

describe('two points on one connection', () => {
  it('measures them apart and takes the worse of the two', () => {
    const connectionId = open(office, {
      accountNumber: 'A-8006',
      outletElevationInches: 20,
      indoorRiser: false,
    });
    // a pier at the meter and a photographic bath inside, neither of which can
    // push back under pressure, so the breaker is allowed to stand
    walk(office, connectionId, '2024-01-10', ['PIER_TIDAL', 'PHOTO_LAB']);

    const containment = fit(office, { connectionId, installedOn: '2024-02-01' });
    const isolation = fit(office, {
      connectionId,
      scope: 'isolation',
      assemblyClass: 'PVB',
      modelId: 'CB-40P',
      sizeInches: 1,
      installedOn: '2024-02-01',
      location: 'photo room riser',
    });

    fileTest(office, { assemblyId: containment, testedOn: '2024-02-05', asFound: PASSING_RP });
    const status = complianceFor(office.register, connectionId, '2024-02-06');
    expect(status.ok).toBe(true);
    if (!status.ok) {
      return;
    }
    expect(status.value.containment.point.deficiency.kind).toBe('none');
    expect(status.value.isolation.point.deficiency.kind).toBe('none');

    // the breaker has never been tested, so once its ten days are up the whole
    // connection is late even though the containment side is in order
    expect(status.value.isolation.due?.basis).toBe('first_test');
    expect(status.value.standing).toBe('compliant');
    const late = complianceFor(office.register, connectionId, '2024-02-12');
    expect(late.ok && late.value.standing).toBe('overdue');

    fileTest(office, {
      assemblyId: isolation,
      testedOn: '2024-02-08',
      asFound: { airInletOpening: 2.2, check1Differential: 3.4 },
    });
    const after = complianceFor(office.register, connectionId, '2024-02-09');
    expect(after.ok && after.value.standing).toBe('compliant');
  });
});

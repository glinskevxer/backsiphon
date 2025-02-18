import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { annualReturn, returnRows, type AnnualReturn } from '../../../src/service/annual';
import { runNotices } from '../../../src/service/notices';
import { executeOrder, raiseOrder } from '../../../src/service/shutoff';
import { fileTest, fit, open, openOffice, walk, FAILING_RP, type Office } from '../../support/office';

let office: Office;

function entry(year = 2024): AnnualReturn {
  const result = annualReturn(office.register, year);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

beforeEach(() => {
  office = openOffice();
});

afterEach(() => {
  office.close();
});

describe('the annual return', () => {
  it('refuses something that is not a year', () => {
    expect(annualReturn(office.register, 12).ok).toBe(false);
    expect(annualReturn(office.register, 2024.5).ok).toBe(false);
  });

  it('counts an empty district without falling over', () => {
    const empty = entry();
    expect(empty.connections).toBe(0);
    expect(empty.testedInYear).toBe(0);
    expect(empty.asOf).toBe('2024-12-31');
  });

  it('counts the connections by degree and whether they are protected', () => {
    const first = open(office, { accountNumber: 'A-1' });
    walk(office, first, '2023-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId: first, installedOn: '2023-02-01' });
    fileTest(office, { assemblyId, testedOn: '2024-02-05' });

    const second = open(office, { accountNumber: 'A-2' });
    walk(office, second, '2023-01-10', ['FIRE_PLAIN']);

    open(office, { accountNumber: 'A-3' });

    const counted = entry();
    expect(counted.connections).toBe(3);
    expect(counted.byDegree.health).toBe(1);
    expect(counted.byDegree.nonhealth).toBe(1);
    expect(counted.protected).toBe(1);
    expect(counted.unprotected).toBe(1);
    expect(counted.neverSurveyed).toBe(1);
  });

  it('counts only the tests inside the year, and the refusals apart', () => {
    const connectionId = open(office, { accountNumber: 'A-4' });
    walk(office, connectionId, '2022-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2022-02-01' });
    fileTest(office, { assemblyId, testedOn: '2023-06-01' });
    fileTest(office, { assemblyId, testedOn: '2024-06-01' });
    fileTest(office, { assemblyId, testedOn: '2024-08-01', asFound: FAILING_RP });
    fileTest(office, { assemblyId, testedOn: '2024-09-01', filedOn: '2024-12-01' });

    const counted = entry();
    expect(counted.testedInYear).toBe(2);
    expect(counted.passedInYear).toBe(1);
    expect(counted.failedInYear).toBe(1);
    expect(counted.refusedInYear).toBe(1);
    expect(entry(2023).testedInYear).toBe(1);
  });

  it('counts the letters and the shutoffs the office worked in the year', () => {
    const connectionId = open(office, { accountNumber: 'A-5' });
    walk(office, connectionId, '2022-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2022-02-01' });
    fileTest(office, { assemblyId, testedOn: '2023-02-05' });
    runNotices(office.register, { asOf: '2024-02-20' });
    runNotices(office.register, { asOf: '2024-03-10' });
    raiseOrder(office.register, connectionId, '2024-04-01', 'no test since 2023');
    executeOrder(office.register, 'SO-0001', '2024-04-08', 'crew 3');

    const counted = entry();
    expect(counted.noticesIssued).toBe(2);
    expect(counted.noticesOpenAtYearEnd).toBe(2);
    expect(counted.shutoffsOrdered).toBe(1);
    expect(counted.shutoffsCarriedOut).toBe(1);
    expect(entry(2023).noticesIssued).toBe(0);
  });

  it('lays the return out in the order the form wants', () => {
    const rows = returnRows(entry());
    expect(rows[0]?.[0]).toBe('reporting year');
    expect(rows.map(([label]) => label)).toContain('assemblies subject to field test');
    expect(rows).toHaveLength(18);
  });
});

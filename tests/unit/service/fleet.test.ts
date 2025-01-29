import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { firstTimeFailureRate, fleetRecord, type ModelRecord } from '../../../src/service/fleet';
import { delistModel } from '../../../src/storage/repositories/assemblies';
import { takeAssemblyOut } from '../../../src/service/assemblies';
import { fileTest, fit, open, openOffice, walk, FAILING_RP, type Office } from '../../support/office';

let office: Office;

function records(asOf = '2025-02-01'): ModelRecord[] {
  const result = fleetRecord(office.register, asOf);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

function recordFor(modelId: string, asOf = '2025-02-01'): ModelRecord {
  const found = records(asOf).find((entry) => entry.modelId === modelId);
  if (found === undefined) {
    throw new Error(`no record for ${modelId}`);
  }
  return found;
}

function fitOne(index: number): string {
  const connectionId = open(office, { accountNumber: `A-${index}` });
  walk(office, connectionId, '2023-01-10', ['AUX_WELL']);
  return fit(office, { connectionId, installedOn: '2023-02-01' });
}

beforeEach(() => {
  office = openOffice();
});

afterEach(() => {
  office.close();
});

describe('the fleet record', () => {
  it('counts a model nobody has fitted at zero rather than leaving it out', () => {
    expect(recordFor('CB-40P').fitted).toBe(0);
    expect(recordFor('CB-40P').meanAgeYears).toBe(0);
    expect(recordFor('CB-40P').oldest).toBeUndefined();
  });

  it('counts what is in the ground and how old it is', () => {
    fitOne(1);
    fitOne(2);
    const record = recordFor('WK-375');
    expect(record.fitted).toBe(2);
    expect(record.meanAgeYears).toBeCloseTo(2, 1);
    expect(record.oldest).toBe('2023-02-01');
  });

  it('moves one out of the fitted count when it comes out', () => {
    const assemblyId = fitOne(3);
    takeAssemblyOut(office.register, assemblyId, '2024-06-01', 'cracked');
    const record = recordFor('WK-375');
    expect(record.fitted).toBe(0);
    expect(record.removed).toBe(1);
  });

  it('counts the tests that failed when the tester arrived', () => {
    const first = fitOne(4);
    fileTest(office, { assemblyId: first, testedOn: '2024-02-01' });
    fileTest(office, { assemblyId: first, testedOn: '2024-08-01', asFound: FAILING_RP });
    const record = recordFor('WK-375');
    expect(record.testsJudged).toBe(2);
    expect(record.firstTimeFailures).toBe(1);
  });

  it('counts a repair the tester made as a first time failure too', () => {
    const assemblyId = fitOne(5);
    fileTest(office, {
      assemblyId,
      testedOn: '2024-02-01',
      asFound: FAILING_RP,
      repairMade: true,
      repairNote: 'reground',
      asLeft: { check1Differential: 8.4, reliefOpening: 3.1 },
    });
    const record = recordFor('WK-375');
    expect(record.firstTimeFailures).toBe(1);
    expect(record.repairRate).toBe(1);
  });

  it('does not count a refused report at all', () => {
    const assemblyId = fitOne(6);
    fileTest(office, { assemblyId, testedOn: '2024-02-01', filedOn: '2024-06-01' });
    expect(recordFor('WK-375').testsJudged).toBe(0);
  });

  it('will not quote a rate off two tests', () => {
    const assemblyId = fitOne(7);
    fileTest(office, { assemblyId, testedOn: '2024-02-01', asFound: FAILING_RP });
    expect(firstTimeFailureRate(recordFor('WK-375'))).toBeUndefined();
  });

  it('quotes one once there are enough tests behind it', () => {
    for (let index = 0; index < 12; index += 1) {
      const assemblyId = fitOne(100 + index);
      fileTest(office, {
        assemblyId,
        testedOn: '2024-02-01',
        asFound: index % 4 === 0 ? FAILING_RP : { check1Differential: 8.2, reliefOpening: 3.1 },
      });
    }
    const record = recordFor('WK-375');
    expect(record.testsJudged).toBe(12);
    expect(firstTimeFailureRate(record)).toBe(0.25);
  });

  it('reads the listing as at the day asked about', () => {
    fitOne(8);
    delistModel(office.register.db, 'WK-375', '2024-06-01');
    expect(recordFor('WK-375', '2024-01-01').listing).toBe('listed');
    expect(recordFor('WK-375', '2025-02-01').listing).toBe('delisted');
  });

  it('puts the busiest model at the top', () => {
    fitOne(9);
    expect(records()[0]?.modelId).toBe('WK-375');
  });
});

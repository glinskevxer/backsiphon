import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { drawSchedule, peakMonth } from '../../../src/service/schedule';
import { fileTest, fit, open, openOffice, walk, type Office } from '../../support/office';

let office: Office;

function connectionTestedOn(account: string, testedOn: string, findings = ['AUX_WELL']): void {
  const connectionId = open(office, { accountNumber: account });
  walk(office, connectionId, '2023-01-10', findings);
  const assemblyId = fit(office, { connectionId, installedOn: '2023-02-01' });
  fileTest(office, { assemblyId, testedOn });
}

beforeEach(() => {
  office = openOffice();
});

afterEach(() => {
  office.close();
});

describe('drawing the year ahead', () => {
  it('draws twelve months from the start of the month it is asked about', () => {
    const schedule = drawSchedule(office.register, { asOf: '2025-04-17' });
    expect(schedule.from).toBe('2025-04-01');
    expect(schedule.months).toHaveLength(12);
    expect(schedule.months[0]?.month).toBe('2025-04');
    expect(schedule.months[11]?.month).toBe('2026-03');
  });

  it('puts a test in the month its anniversary falls in', () => {
    connectionTestedOn('A-1', '2024-09-12');
    const schedule = drawSchedule(office.register, { asOf: '2025-04-17' });
    const september = schedule.months.find((month) => month.month === '2025-09');
    expect(september?.due).toBe(1);
    expect(september?.healthHazard).toBe(1);
    expect(september?.connections).toHaveLength(1);
  });

  it('counts a pollutional hazard in the month but not in the health column', () => {
    connectionTestedOn('A-2', '2024-09-12', ['FIRE_PLAIN']);
    const schedule = drawSchedule(office.register, { asOf: '2025-04-17' });
    const september = schedule.months.find((month) => month.month === '2025-09');
    expect(september?.due).toBe(1);
    expect(september?.healthHazard).toBe(0);
  });

  it('counts what is already late apart from the months ahead', () => {
    connectionTestedOn('A-3', '2023-09-12');
    const schedule = drawSchedule(office.register, { asOf: '2025-04-17' });
    expect(schedule.alreadyLate).toBe(1);
    expect(schedule.months.every((month) => month.due === 0)).toBe(true);
  });

  it('leaves a test beyond the window out entirely', () => {
    connectionTestedOn('A-4', '2025-03-01');
    const schedule = drawSchedule(office.register, { asOf: '2025-04-17', months: 6 });
    expect(schedule.months).toHaveLength(6);
    expect(schedule.months.every((month) => month.due === 0)).toBe(true);
  });

  it('counts the connections it could not read', () => {
    open(office, { accountNumber: 'A-5' });
    const schedule = drawSchedule(office.register, { asOf: '2025-04-17' });
    expect(schedule.unreadable).toBe(1);
  });

  it('names the busiest month', () => {
    connectionTestedOn('A-6', '2024-09-12');
    connectionTestedOn('A-7', '2024-09-20');
    connectionTestedOn('A-8', '2024-11-02');
    const schedule = drawSchedule(office.register, { asOf: '2025-04-17' });
    expect(peakMonth(schedule)?.month).toBe('2025-09');
    expect(peakMonth(schedule)?.due).toBe(2);
  });

  it('takes one route at a time', () => {
    const north = open(office, { accountNumber: 'A-9', route: 'north' });
    walk(office, north, '2023-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId: north, installedOn: '2023-02-01' });
    fileTest(office, { assemblyId, testedOn: '2024-09-12' });
    const schedule = drawSchedule(office.register, { asOf: '2025-04-17', route: 'south' });
    expect(schedule.months.every((month) => month.due === 0)).toBe(true);
  });
});

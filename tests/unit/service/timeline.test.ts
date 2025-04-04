import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { timelineFor, type TimelineEntry } from '../../../src/service/timeline';
import { applyForVariance, decideGrant } from '../../../src/service/variances';
import { runNotices } from '../../../src/service/notices';
import { executeOrder, raiseOrder } from '../../../src/service/shutoff';
import { takeAssemblyOut } from '../../../src/service/assemblies';
import {
  fileTest,
  fit,
  open,
  openOffice,
  walk,
  FAILING_RP,
  type Office,
} from '../../support/office';

let office: Office;

function entries(connectionId: string): TimelineEntry[] {
  const timeline = timelineFor(office.register, connectionId);
  if (!timeline.ok) {
    throw new Error(timeline.error);
  }
  return timeline.value;
}

beforeEach(() => {
  office = openOffice();
});

afterEach(() => {
  office.close();
});

describe('the file on one connection', () => {
  it('opens with the day it was connected', () => {
    const connectionId = open(office, { accountNumber: 'A-1' });
    const file = entries(connectionId);
    expect(file).toHaveLength(1);
    expect(file[0]?.kind).toBe('connection');
    expect(file[0]?.on).toBe('2015-01-01');
  });

  it('puts a test on the day it was tested, not the day it was filed', () => {
    const connectionId = open(office, { accountNumber: 'A-2' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2024-02-01' });
    fileTest(office, { assemblyId, testedOn: '2024-02-05', filedOn: '2024-02-25' });
    const test = entries(connectionId).find((entry) => entry.kind === 'test');
    expect(test?.on).toBe('2024-02-05');
    expect(test?.summary).toContain('pass');
  });

  it('says when a report was refused rather than what it read', () => {
    const connectionId = open(office, { accountNumber: 'A-3' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2024-02-01' });
    fileTest(office, { assemblyId, testedOn: '2024-02-05', filedOn: '2024-06-05' });
    const test = entries(connectionId).find((entry) => entry.kind === 'test');
    expect(test?.summary).toContain('refused: filed_too_late');
  });

  it('reads in date order across all six kinds', () => {
    const connectionId = open(office, { accountNumber: 'A-4' });
    walk(office, connectionId, '2023-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2023-02-01' });
    fileTest(office, { assemblyId, testedOn: '2023-02-05' });
    applyForVariance(office.register, {
      connectionId,
      appliedOn: '2023-06-01',
      acceptedClass: 'DC',
    });
    decideGrant(office.register, 'V-0001', {
      decidedOn: '2023-06-20',
      effectiveFrom: '2023-07-01',
      expiresOn: '2023-12-31',
      conditions: ['the well stays capped'],
    });
    runNotices(office.register, { asOf: '2024-02-20' });
    raiseOrder(office.register, connectionId, '2024-04-01', 'no test since 2023');
    executeOrder(office.register, 'SO-0001', '2024-04-08', 'crew 3');
    takeAssemblyOut(office.register, assemblyId, '2024-05-01', 'replaced under warranty');

    const file = entries(connectionId);
    const dates = file.map((entry) => entry.on);
    expect([...dates].sort()).toEqual(dates);
    expect(file.map((entry) => entry.kind)).toEqual([
      'connection',
      'survey',
      'assembly',
      'test',
      'variance',
      'variance',
      'notice',
      'shutoff',
      'shutoff',
      'assembly',
    ]);
  });

  it('puts a survey before an assembly fitted on the same day', () => {
    const connectionId = open(office, { accountNumber: 'A-5' });
    walk(office, connectionId, '2024-03-01', ['AUX_WELL']);
    fit(office, { connectionId, installedOn: '2024-03-01' });
    const sameDay = entries(connectionId).filter((entry) => entry.on === '2024-03-01');
    expect(sameDay.map((entry) => entry.kind)).toEqual(['survey', 'assembly']);
  });

  it('carries a failed test and the repair that followed it', () => {
    const connectionId = open(office, { accountNumber: 'A-6' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2024-02-01' });
    fileTest(office, {
      assemblyId,
      testedOn: '2024-02-05',
      asFound: FAILING_RP,
      repairMade: true,
      repairNote: 'reground the first check',
      asLeft: { check1Differential: 8.4, reliefOpening: 3.1 },
    });
    const test = entries(connectionId).find((entry) => entry.kind === 'test');
    expect(test?.summary).toContain('repaired on site');
  });

  it('says so when there is no such connection', () => {
    expect(timelineFor(office.register, 'SC-00404').ok).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, type Database } from '../../../../src/storage/db';
import { migrate } from '../../../../src/storage/schema';
import { insertConnection } from '../../../../src/storage/repositories/connections';
import {
  countSurveys,
  currentSurvey,
  findSurvey,
  insertSurvey,
  surveyHistory,
  surveysDue,
  type SurveyRow,
} from '../../../../src/storage/repositories/surveys';

let db: Database;

function survey(overrides: Partial<SurveyRow> = {}): SurveyRow {
  return {
    surveyId: 'SV-1',
    connectionId: 'SC-1',
    surveyedOn: '2023-06-14',
    surveyor: 'r. okafor',
    accessGranted: true,
    premiseUseCode: 'PLATING',
    containmentDegree: 'health',
    isolationDegree: 'health',
    airGapRequired: false,
    backpressure: true,
    basis: 'category',
    nextSurveyDue: '2024-06-14',
    findingCodes: ['PLATING', 'ELEVATED_TANK'],
    recordedAt: '2023-06-15T08:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  db = openDatabase({ file: ':memory:' });
  const run = migrate(db, '2024-04-08T09:00:00Z');
  if (!run.ok) {
    throw new Error(run.error);
  }
  for (const [id, account] of [
    ['SC-1', 'A-1'],
    ['SC-2', 'A-2'],
  ] as const) {
    insertConnection(db, {
      connectionId: id,
      accountNumber: account,
      premiseName: 'a premise',
      premiseAddress: 'somewhere',
      premiseUseCode: 'PLATING',
      serviceSizeInches: 2,
      fireService: false,
      purveyorMetered: true,
      connectedOn: '2015-01-01',
      route: 'north',
      outletElevationInches: 12,
      indoorRiser: false,
      downstreamShutoff: true,
      continuousPressureHours: 24,
    });
  }
});

afterEach(() => {
  closeDatabase(db);
});

describe('writing one', () => {
  it('reads the findings back in order', () => {
    insertSurvey(db, survey());
    expect(findSurvey(db, 'SV-1')?.findingCodes).toEqual(['ELEVATED_TANK', 'PLATING']);
  });

  it('reads the flags back as booleans', () => {
    insertSurvey(db, survey({ airGapRequired: true, backpressure: false, accessGranted: false }));
    const found = findSurvey(db, 'SV-1');
    expect(found?.airGapRequired).toBe(true);
    expect(found?.backpressure).toBe(false);
    expect(found?.accessGranted).toBe(false);
  });

  it('takes a survey with no findings at all', () => {
    insertSurvey(db, survey({ findingCodes: [] }));
    expect(findSurvey(db, 'SV-1')?.findingCodes).toEqual([]);
  });

  it('refuses one against a connection that is not on file', () => {
    const result = insertSurvey(db, survey({ connectionId: 'SC-404' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not on file');
    }
  });

  it('writes nothing at all when a finding fails', () => {
    const result = insertSurvey(db, survey({ findingCodes: ['PLATING', 'PLATING'] }));
    expect(result.ok).toBe(false);
    expect(findSurvey(db, 'SV-1')).toBeUndefined();
    expect(countSurveys(db, 'SC-1')).toBe(0);
  });
});

describe('which survey the register works from', () => {
  beforeEach(() => {
    insertSurvey(
      db,
      survey({ surveyId: 'SV-1', surveyedOn: '2021-03-01', containmentDegree: 'nonhealth' }),
    );
    insertSurvey(db, survey({ surveyId: 'SV-2', surveyedOn: '2023-06-14' }));
    insertSurvey(
      db,
      survey({ surveyId: 'SV-3', surveyedOn: '2022-09-09', containmentDegree: 'none' }),
    );
  });

  it('is the most recent one', () => {
    expect(currentSurvey(db, 'SC-1')?.surveyId).toBe('SV-2');
  });

  it('is the most recent one as at a date, for reopening an old decision', () => {
    expect(currentSurvey(db, 'SC-1', '2023-01-01')?.surveyId).toBe('SV-3');
    expect(currentSurvey(db, 'SC-1', '2021-06-01')?.surveyId).toBe('SV-1');
    expect(currentSurvey(db, 'SC-1', '2020-01-01')).toBeUndefined();
  });

  it('is nothing at all on a connection nobody has walked', () => {
    expect(currentSurvey(db, 'SC-2')).toBeUndefined();
  });

  it('lists the history newest first', () => {
    expect(surveyHistory(db, 'SC-1').map((entry) => entry.surveyId)).toEqual([
      'SV-2',
      'SV-3',
      'SV-1',
    ]);
  });

  it('counts what is on file', () => {
    expect(countSurveys(db, 'SC-1')).toBe(3);
    expect(countSurveys(db, 'SC-2')).toBe(0);
  });
});

describe('surveys that have fallen due', () => {
  beforeEach(() => {
    insertSurvey(db, survey({ surveyId: 'SV-1', nextSurveyDue: '2024-06-14' }));
    insertSurvey(
      db,
      survey({
        surveyId: 'SV-2',
        connectionId: 'SC-2',
        surveyedOn: '2022-01-05',
        nextSurveyDue: '2025-01-05',
      }),
    );
  });

  it('lists the ones past the date, soonest first', () => {
    expect(surveysDue(db, '2024-06-14').map((entry) => entry.surveyId)).toEqual(['SV-1']);
    expect(surveysDue(db, '2025-02-01').map((entry) => entry.surveyId)).toEqual(['SV-1', 'SV-2']);
    expect(surveysDue(db, '2024-01-01')).toEqual([]);
  });

  it('only reads the latest survey of each connection', () => {
    insertSurvey(
      db,
      survey({ surveyId: 'SV-3', surveyedOn: '2024-02-01', nextSurveyDue: '2026-02-01' }),
    );
    expect(surveysDue(db, '2025-02-01').map((entry) => entry.surveyId)).toEqual(['SV-2']);
  });
});

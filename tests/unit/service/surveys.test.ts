import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeRegister, openRegister, type Register } from '../../../src/service/register';
import { closeConnection, openConnection } from '../../../src/service/connections';
import { dueSurveys, neverSurveyed, recordSurvey } from '../../../src/service/surveys';
import { currentSurvey, surveyHistory } from '../../../src/storage/repositories/surveys';
import { eventsFor } from '../../../src/storage/repositories/events';

let register: Register;

beforeEach(() => {
  const opened = openRegister({
    file: ':memory:',
    actor: 'clerk.hines',
    now: () => '2024-06-06T09:00:00Z',
  });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  register = opened.value;
  openConnection(register, {
    accountNumber: 'A-1001',
    premiseName: 'kerrigan plating',
    premiseAddress: '14 forge road',
    premiseUseCode: 'PLATING',
    serviceSizeInches: 2,
    fireService: false,
    purveyorMetered: true,
    connectedOn: '2019-04-02',
  });
  openConnection(register, {
    accountNumber: 'A-1002',
    premiseName: 'brightwater office',
    premiseAddress: '2 canal street',
    premiseUseCode: 'OFFICE',
    serviceSizeInches: 1,
    fireService: false,
    purveyorMetered: true,
    connectedOn: '2020-01-06',
  });
});

afterEach(() => {
  closeRegister(register);
});

describe('recording one', () => {
  it('reads the use code off the connection', () => {
    const recorded = recordSurvey(register, {
      connectionId: 'SC-00001',
      surveyedOn: '2024-02-01',
      surveyor: 'r. okafor',
      findingCodes: [],
      accessGranted: true,
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) {
      return;
    }
    expect(recorded.value.survey.premiseUseCode).toBe('PLATING');
    expect(recorded.value.assessment.containmentDegree).toBe('health');
    expect(recorded.value.survey.basis).toBe('category');
  });

  it('stores the findings and the next due date', () => {
    const recorded = recordSurvey(register, {
      connectionId: 'SC-00002',
      surveyedOn: '2024-02-01',
      surveyor: 'r. okafor',
      findingCodes: ['DOCK_HYDRANT'],
      accessGranted: true,
    });
    expect(recorded.ok && recorded.value.survey.nextSurveyDue).toBe('2029-02-01');
    expect(currentSurvey(register.db, 'SC-00002')?.findingCodes).toEqual(['DOCK_HYDRANT']);
  });

  it('names the degree on the trail', () => {
    recordSurvey(register, {
      connectionId: 'SC-00001',
      surveyedOn: '2024-02-01',
      surveyor: 'r. okafor',
      findingCodes: [],
      accessGranted: true,
    });
    const events = eventsFor(register.db, 'connection', 'SC-00001');
    expect(events[1]?.kind).toBe('survey_recorded');
    expect(events[1]?.detail).toContain('containment health');
  });

  it('reports how the degree moved between two surveys', () => {
    recordSurvey(register, {
      connectionId: 'SC-00002',
      surveyedOn: '2022-02-01',
      surveyor: 'r. okafor',
      findingCodes: [],
      accessGranted: true,
    });
    const second = recordSurvey(register, {
      connectionId: 'SC-00002',
      surveyedOn: '2024-02-01',
      surveyor: 'r. okafor',
      findingCodes: ['AUX_WELL'],
      accessGranted: true,
    });
    expect(second.ok && second.value.degreeChange).toBe('none to health');
    const events = eventsFor(register.db, 'connection', 'SC-00002');
    expect(events[2]?.detail).toContain('moved none to health');
  });

  it('says nothing about a change where the degree held', () => {
    recordSurvey(register, {
      connectionId: 'SC-00001',
      surveyedOn: '2022-02-01',
      surveyor: 'r. okafor',
      findingCodes: [],
      accessGranted: true,
    });
    const second = recordSurvey(register, {
      connectionId: 'SC-00001',
      surveyedOn: '2024-02-01',
      surveyor: 'r. okafor',
      findingCodes: [],
      accessGranted: true,
    });
    expect(second.ok && second.value.degreeChange).toBeUndefined();
  });

  it('flags a survey that a later one has already overtaken', () => {
    recordSurvey(register, {
      connectionId: 'SC-00001',
      surveyedOn: '2024-02-01',
      surveyor: 'r. okafor',
      findingCodes: [],
      accessGranted: true,
    });
    const older = recordSurvey(register, {
      connectionId: 'SC-00001',
      surveyedOn: '2023-02-01',
      surveyor: 'r. okafor',
      findingCodes: [],
      accessGranted: true,
    });
    expect(older.ok && older.value.supersededByLater).toBe(true);
    expect(currentSurvey(register.db, 'SC-00001')?.surveyedOn).toBe('2024-02-01');
    expect(surveyHistory(register.db, 'SC-00001')).toHaveLength(2);
  });

  it('refuses one against a connection nobody has, or with a bad date', () => {
    expect(
      recordSurvey(register, {
        connectionId: 'SC-00404',
        surveyedOn: '2024-02-01',
        surveyor: 'r',
        findingCodes: [],
        accessGranted: true,
      }).ok,
    ).toBe(false);
    expect(
      recordSurvey(register, {
        connectionId: 'SC-00001',
        surveyedOn: 'february',
        surveyor: 'r',
        findingCodes: [],
        accessGranted: true,
      }).ok,
    ).toBe(false);
  });

  it('refuses one before the connection went in or after it came out', () => {
    closeConnection(register, 'SC-00002', '2023-01-01', 'demolished');
    expect(
      recordSurvey(register, {
        connectionId: 'SC-00002',
        surveyedOn: '2024-02-01',
        surveyor: 'r',
        findingCodes: [],
        accessGranted: true,
      }).ok,
    ).toBe(false);
    expect(
      recordSurvey(register, {
        connectionId: 'SC-00001',
        surveyedOn: '2015-02-01',
        surveyor: 'r',
        findingCodes: [],
        accessGranted: true,
      }).ok,
    ).toBe(false);
  });

  it('refuses a finding nobody has heard of and leaves nothing behind', () => {
    const result = recordSurvey(register, {
      connectionId: 'SC-00001',
      surveyedOn: '2024-02-01',
      surveyor: 'r. okafor',
      findingCodes: ['GHOSTS'],
      accessGranted: true,
    });
    expect(result.ok).toBe(false);
    expect(surveyHistory(register.db, 'SC-00001')).toEqual([]);
  });
});

describe('what the office has to go and walk', () => {
  it('lists the connections nobody has ever surveyed', () => {
    expect(neverSurveyed(register)).toEqual(['SC-00001', 'SC-00002']);
    recordSurvey(register, {
      connectionId: 'SC-00001',
      surveyedOn: '2024-02-01',
      surveyor: 'r. okafor',
      findingCodes: [],
      accessGranted: true,
    });
    expect(neverSurveyed(register)).toEqual(['SC-00002']);
  });

  it('drops a closed connection off that list', () => {
    closeConnection(register, 'SC-00002', '2024-01-01', 'demolished');
    expect(neverSurveyed(register)).toEqual(['SC-00001']);
  });

  it('lists the surveys that have fallen due', () => {
    recordSurvey(register, {
      connectionId: 'SC-00001',
      surveyedOn: '2023-02-01',
      surveyor: 'r. okafor',
      findingCodes: [],
      accessGranted: true,
    });
    expect(dueSurveys(register, '2024-01-31')).toEqual([]);
    expect(dueSurveys(register, '2024-02-01').map((entry) => entry.surveyId)).toEqual(['SV-00001']);
  });
});

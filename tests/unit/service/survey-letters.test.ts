import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { describeSurveyRun, runSurveyLetters } from '../../../src/service/survey-letters';
import { changePremiseUse } from '../../../src/service/connections';
import { recentEvents } from '../../../src/storage/repositories/events';
import { open, openOffice, walk, type Office } from '../../support/office';

let office: Office;

beforeEach(() => {
  office = openOffice();
});

afterEach(() => {
  office.close();
});

describe('the survey letter run', () => {
  it('writes to a premise nobody has ever walked', () => {
    open(office, { accountNumber: 'A-1', premiseName: 'kerrigan plating' });
    const run = runSurveyLetters(office.register, { asOf: '2025-01-06' });
    expect(run.ok).toBe(true);
    if (!run.ok) {
      return;
    }
    expect(run.value.letters).toHaveLength(1);
    expect(run.value.letters[0]?.reason).toBe('never_walked');
    expect(run.value.letters[0]?.body).toContain('do not show a hazard survey');
  });

  it('says nothing about a premise walked inside its interval', () => {
    const connectionId = open(office, { accountNumber: 'A-2' });
    walk(office, connectionId, '2024-06-01', []);
    const run = runSurveyLetters(office.register, { asOf: '2025-01-06' });
    expect(run.ok && run.value.letters).toEqual([]);
  });

  it('writes once the interval has run out', () => {
    const connectionId = open(office, { accountNumber: 'A-3', premiseUseCode: 'PLATING' });
    walk(office, connectionId, '2023-06-01', ['PLATING']);
    const run = runSurveyLetters(office.register, { asOf: '2025-01-06' });
    expect(run.ok && run.value.letters[0]?.reason).toBe('interval_expired');
    expect(run.ok && run.value.letters[0]?.body).toContain('2023-06-01');
  });

  it('writes when the premise has changed hands since the survey', () => {
    const connectionId = open(office, { accountNumber: 'A-4', premiseUseCode: 'WAREHOUSE' });
    walk(office, connectionId, '2024-11-01', []);
    changePremiseUse(office.register, connectionId, {
      premiseUseCode: 'PLATING',
      on: '2024-12-01',
    });
    const run = runSurveyLetters(office.register, { asOf: '2025-01-06' });
    expect(run.ok && run.value.letters[0]?.reason).toBe('use_changed');
    expect(run.ok && run.value.letters[0]?.body).toContain('metal finishing shop');
  });

  it('does not write to the same customer twice in six weeks', () => {
    open(office, { accountNumber: 'A-5' });
    runSurveyLetters(office.register, { asOf: '2025-01-06' });
    const again = runSurveyLetters(office.register, { asOf: '2025-01-20' });
    expect(again.ok && again.value.letters).toEqual([]);
    expect(again.ok && again.value.skipped[0]?.reason).toContain('2025-01-06');
    const later = runSurveyLetters(office.register, { asOf: '2025-03-20' });
    expect(later.ok && later.value.letters).toHaveLength(1);
  });

  it('writes nothing at all on a dry run', () => {
    open(office, { accountNumber: 'A-6' });
    const run = runSurveyLetters(office.register, { asOf: '2025-01-06', dryRun: true });
    expect(run.ok && run.value.letters).toHaveLength(1);
    expect(recentEvents(office.register.db, { kind: 'survey_letter' })).toEqual([]);
  });

  it('takes one route at a time and describes itself', () => {
    open(office, { accountNumber: 'A-7', route: 'north' });
    open(office, { accountNumber: 'A-8', route: 'south' });
    const run = runSurveyLetters(office.register, { asOf: '2025-01-06', route: 'south' });
    expect(run.ok && run.value.considered).toBe(1);
    expect(run.ok && describeSurveyRun(run.value)).toBe(
      '1 connections, 1 letters (1 never_walked), 0 skipped',
    );
  });
});

describe('the wording the office has settled on', () => {
  it('uses the heading and the footer from the policy', () => {
    const other = openOffice();
    const settled = {
      ...other.register,
      policy: {
        ...other.register.policy,
        letter: {
          heading: 'north valley water, cross connection control',
          footer: 'telephone the program office on 555 0100',
        },
      },
    };
    open({ ...other, register: settled }, { accountNumber: 'A-1' });
    const run = runSurveyLetters(settled, { asOf: '2025-01-06' });
    expect(run.ok).toBe(true);
    if (run.ok) {
      expect(run.value.letters[0]?.body).toContain('north valley water, cross connection control');
      expect(run.value.letters[0]?.body).toContain('555 0100');
    }
    other.close();
  });
});

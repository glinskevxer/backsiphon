import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, type Database } from '../../../../src/storage/db';
import { migrate } from '../../../../src/storage/schema';
import {
  appendEvent,
  countEvents,
  eventKinds,
  eventsFor,
  recentEvents,
  type NewEvent,
} from '../../../../src/storage/repositories/events';

let db: Database;

function event(overrides: Partial<NewEvent> = {}): NewEvent {
  return {
    happenedAt: '2024-05-21T09:00:00Z',
    actor: 'clerk.hines',
    kind: 'survey_recorded',
    subjectKind: 'connection',
    subjectId: 'SC-1',
    ...overrides,
  };
}

beforeEach(() => {
  db = openDatabase({ file: ':memory:' });
  const run = migrate(db, '2024-05-21T08:00:00Z');
  if (!run.ok) {
    throw new Error(run.error);
  }
});

afterEach(() => {
  closeDatabase(db);
});

describe('appending', () => {
  it('hands back the row it wrote, numbered', () => {
    const first = appendEvent(db, event());
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.value.eventId).toBe(1);
    expect(first.value.detail).toBe('');
    const second = appendEvent(db, event({ kind: 'assembly_installed' }));
    expect(second.ok && second.value.eventId).toBe(2);
  });

  it('keeps the detail line', () => {
    const written = appendEvent(db, event({ detail: 'walked by r. okafor, access refused' }));
    expect(written.ok && written.value.detail).toContain('access refused');
  });

  it('will not take one with nobody behind it', () => {
    expect(appendEvent(db, event({ actor: '  ' })).ok).toBe(false);
    expect(appendEvent(db, event({ kind: '' })).ok).toBe(false);
    expect(countEvents(db)).toBe(0);
  });

  it('takes an event about something that is not in the store', () => {
    expect(appendEvent(db, event({ subjectKind: 'assembly', subjectId: 'BA-404' })).ok).toBe(true);
  });
});

describe('reading it back', () => {
  beforeEach(() => {
    appendEvent(db, event({ kind: 'connection_opened', happenedAt: '2024-01-02T09:00:00Z' }));
    appendEvent(db, event({ kind: 'survey_recorded', happenedAt: '2024-02-02T09:00:00Z' }));
    appendEvent(
      db,
      event({
        kind: 'report_filed',
        subjectKind: 'report',
        subjectId: 'TR-1',
        actor: 'clerk.owusu',
        happenedAt: '2024-03-02T09:00:00Z',
      }),
    );
    appendEvent(db, event({ kind: 'survey_recorded', happenedAt: '2024-04-02T09:00:00Z' }));
  });

  it('reads one subject in the order it happened', () => {
    expect(eventsFor(db, 'connection', 'SC-1').map((entry) => entry.kind)).toEqual([
      'connection_opened',
      'survey_recorded',
      'survey_recorded',
    ]);
    expect(eventsFor(db, 'report', 'TR-1')).toHaveLength(1);
    expect(eventsFor(db, 'assembly', 'BA-1')).toEqual([]);
  });

  it('reads the recent ones newest first', () => {
    expect(recentEvents(db).map((entry) => entry.eventId)).toEqual([4, 3, 2, 1]);
  });

  it('filters by kind, actor and time', () => {
    expect(recentEvents(db, { kind: 'survey_recorded' })).toHaveLength(2);
    expect(recentEvents(db, { actor: 'clerk.owusu' })).toHaveLength(1);
    expect(recentEvents(db, { since: '2024-03-01T00:00:00Z' })).toHaveLength(2);
    expect(
      recentEvents(db, { kind: 'survey_recorded', since: '2024-03-01T00:00:00Z' }),
    ).toHaveLength(1);
  });

  it('takes a limit', () => {
    expect(recentEvents(db, { limit: 2 }).map((entry) => entry.eventId)).toEqual([4, 3]);
  });

  it('counts the kinds, busiest first', () => {
    expect(eventKinds(db)).toEqual([
      { kind: 'survey_recorded', total: 2 },
      { kind: 'connection_opened', total: 1 },
      { kind: 'report_filed', total: 1 },
    ]);
  });
});

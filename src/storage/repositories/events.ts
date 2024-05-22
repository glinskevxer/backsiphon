/**
 * The event trail.
 *
 * Append only, and nothing else in the register reads it to make a decision.
 * It exists so that a clerk can answer the question every customer eventually
 * asks, which is not "what does the file say" but "who changed it and when".
 */

import { err, ok, type Result } from '../../util/result';
import { execute, selectAll, selectOne, type Database } from '../db';

export type SubjectKind =
  | 'connection'
  | 'survey'
  | 'assembly'
  | 'model'
  | 'tester'
  | 'gauge'
  | 'report'
  | 'notice'
  | 'variance';

export interface EventRecord {
  readonly eventId: number;
  readonly happenedAt: string;
  readonly actor: string;
  readonly kind: string;
  readonly subjectKind: SubjectKind;
  readonly subjectId: string;
  readonly detail: string;
}

export interface NewEvent {
  readonly happenedAt: string;
  readonly actor: string;
  readonly kind: string;
  readonly subjectKind: SubjectKind;
  readonly subjectId: string;
  readonly detail?: string;
}

interface EventRow {
  event_id: number;
  happened_at: string;
  actor: string;
  kind: string;
  subject_kind: SubjectKind;
  subject_id: string;
  detail: string;
}

const COLUMNS = 'event_id, happened_at, actor, kind, subject_kind, subject_id, detail';

function toRecord(row: EventRow): EventRecord {
  return {
    eventId: row.event_id,
    happenedAt: row.happened_at,
    actor: row.actor,
    kind: row.kind,
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    detail: row.detail,
  };
}

export function appendEvent(db: Database, event: NewEvent): Result<EventRecord, string> {
  if (event.actor.trim() === '') {
    return err('an event has to name who did it');
  }
  if (event.kind.trim() === '') {
    return err('an event has to say what happened');
  }
  execute(
    db,
    `insert into events (happened_at, actor, kind, subject_kind, subject_id, detail)
     values (?, ?, ?, ?, ?, ?)`,
    [event.happenedAt, event.actor, event.kind, event.subjectKind, event.subjectId, event.detail ?? ''],
  );
  const row = selectOne<EventRow>(
    db,
    `select ${COLUMNS} from events order by event_id desc limit 1`,
  );
  return row === undefined ? err('the event did not land') : ok(toRecord(row));
}

export function eventsFor(db: Database, subjectKind: SubjectKind, subjectId: string): EventRecord[] {
  return selectAll<EventRow>(
    db,
    `select ${COLUMNS} from events where subject_kind = ? and subject_id = ? order by event_id`,
    [subjectKind, subjectId],
  ).map(toRecord);
}

export interface EventFilter {
  readonly kind?: string;
  readonly actor?: string;
  readonly since?: string;
  readonly limit?: number;
}

export function recentEvents(db: Database, filter: EventFilter = {}): EventRecord[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.kind !== undefined) {
    clauses.push('kind = ?');
    params.push(filter.kind);
  }
  if (filter.actor !== undefined) {
    clauses.push('actor = ?');
    params.push(filter.actor);
  }
  if (filter.since !== undefined) {
    clauses.push('happened_at >= ?');
    params.push(filter.since);
  }
  const where = clauses.length === 0 ? '' : `where ${clauses.join(' and ')}`;
  params.push(filter.limit ?? 100);
  return selectAll<EventRow>(
    db,
    `select ${COLUMNS} from events ${where} order by event_id desc limit ?`,
    params,
  ).map(toRecord);
}

export function countEvents(db: Database): number {
  return selectOne<{ total: number }>(db, 'select count(*) as total from events')?.total ?? 0;
}

/** Every kind of event on file with how many of each, for a quiet week. */
export function eventKinds(db: Database): Array<{ kind: string; total: number }> {
  return selectAll<{ kind: string; total: number }>(
    db,
    'select kind, count(*) as total from events group by kind order by total desc, kind',
  );
}

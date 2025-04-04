/**
 * Notices.
 *
 * A notice is a letter that went out. It is not a state the register works
 * out again later, which is why it is stored rather than derived: the customer
 * has the letter, and the office has to be able to say exactly what was sent
 * and on what day even after the underlying position has changed.
 */

import type { CivilDate } from '../../util/dates';
import { err, ok, type Result } from '../../util/result';
import type { NoticeStage } from '../../domain/delinquency';
import { execute, selectAll, selectOne, type Database } from '../db';
import { describeConstraintError, toNullable } from '../rows';

export interface NoticeRecord {
  readonly noticeId: string;
  readonly connectionId: string;
  readonly assemblyId?: string;
  readonly stage: Exclude<NoticeStage, 'none'>;
  readonly dueDate: CivilDate;
  readonly issuedOn: CivilDate;
  readonly ladder: string;
  readonly daysPastDue: number;
  readonly clearedOn?: CivilDate;
  readonly body: string;
}

interface NoticeRow {
  notice_id: string;
  connection_id: string;
  assembly_id: string | null;
  stage: Exclude<NoticeStage, 'none'>;
  due_date: string;
  issued_on: string;
  ladder: string;
  days_past_due: number;
  cleared_on: string | null;
  body: string;
}

const COLUMNS = `notice_id, connection_id, assembly_id, stage, due_date, issued_on, ladder,
  days_past_due, cleared_on, body`;

function toRecord(row: NoticeRow): NoticeRecord {
  return {
    noticeId: row.notice_id,
    connectionId: row.connection_id,
    ...(row.assembly_id === null ? {} : { assemblyId: row.assembly_id }),
    stage: row.stage,
    dueDate: row.due_date,
    issuedOn: row.issued_on,
    ladder: row.ladder,
    daysPastDue: row.days_past_due,
    ...(row.cleared_on === null ? {} : { clearedOn: row.cleared_on }),
    body: row.body,
  };
}

export function insertNotice(db: Database, notice: NoticeRecord): Result<NoticeRecord, string> {
  try {
    execute(db, `insert into notices (${COLUMNS}) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      notice.noticeId,
      notice.connectionId,
      toNullable(notice.assemblyId),
      notice.stage,
      notice.dueDate,
      notice.issuedOn,
      notice.ladder,
      notice.daysPastDue,
      toNullable(notice.clearedOn),
      notice.body,
    ]);
    return ok(notice);
  } catch (error) {
    return err(describeConstraintError(error, `the notice ${notice.noticeId}`));
  }
}

export function findNotice(db: Database, noticeId: string): NoticeRecord | undefined {
  const row = selectOne<NoticeRow>(db, `select ${COLUMNS} from notices where notice_id = ?`, [
    noticeId,
  ]);
  return row === undefined ? undefined : toRecord(row);
}

/** Whether this rung has already gone out for this due date. */
export function noticeAlreadySent(
  db: Database,
  connectionId: string,
  dueDate: CivilDate,
  stage: Exclude<NoticeStage, 'none'>,
): boolean {
  return (
    (selectOne<{ total: number }>(
      db,
      `select count(*) as total from notices
       where connection_id = ? and due_date = ? and stage = ?`,
      [connectionId, dueDate, stage],
    )?.total ?? 0) > 0
  );
}

export function noticesForConnection(db: Database, connectionId: string): NoticeRecord[] {
  return selectAll<NoticeRow>(
    db,
    `select ${COLUMNS} from notices where connection_id = ? order by issued_on desc, notice_id desc`,
    [connectionId],
  ).map(toRecord);
}

export function openNotices(db: Database, asOf?: CivilDate): NoticeRecord[] {
  const clause = asOf === undefined ? '' : 'and issued_on <= ?';
  const params = asOf === undefined ? [] : [asOf];
  return selectAll<NoticeRow>(
    db,
    `select ${COLUMNS} from notices where cleared_on is null ${clause}
     order by issued_on, notice_id`,
    params,
  ).map(toRecord);
}

/**
 * Clear every open notice on a connection. This is what a passing test does,
 * and it clears the whole ladder rather than one rung, because the thing the
 * letters were about has happened.
 */
export function clearNotices(
  db: Database,
  connectionId: string,
  on: CivilDate,
): Result<number, string> {
  const open = openNotices(db).filter((notice) => notice.connectionId === connectionId);
  const early = open.find((notice) => notice.issuedOn > on);
  if (early !== undefined) {
    return err(
      `the notice ${early.noticeId} went out on ${early.issuedOn}, it cannot be cleared on ${on}`,
    );
  }
  const changed = execute(
    db,
    'update notices set cleared_on = ? where connection_id = ? and cleared_on is null',
    [on, connectionId],
  );
  return ok(changed);
}

/** Close one letter rather than the whole ladder. */
export function clearNotice(
  db: Database,
  noticeId: string,
  on: CivilDate,
): Result<NoticeRecord, string> {
  const notice = findNotice(db, noticeId);
  if (notice === undefined) {
    return err(`there is no notice with the id ${noticeId}`);
  }
  if (notice.clearedOn !== undefined) {
    return err(`the notice ${noticeId} was closed on ${notice.clearedOn} already`);
  }
  execute(db, 'update notices set cleared_on = ? where notice_id = ?', [on, noticeId]);
  return ok({ ...notice, clearedOn: on });
}

export function highestStageSent(
  db: Database,
  connectionId: string,
  dueDate: CivilDate,
): Exclude<NoticeStage, 'none'> | undefined {
  const order: Array<Exclude<NoticeStage, 'none'>> = ['shutoff', 'final', 'second', 'first'];
  const sent = new Set(
    selectAll<{ stage: Exclude<NoticeStage, 'none'> }>(
      db,
      'select stage from notices where connection_id = ? and due_date = ?',
      [connectionId, dueDate],
    ).map((row) => row.stage),
  );
  return order.find((stage) => sent.has(stage));
}

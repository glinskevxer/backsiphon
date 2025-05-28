/**
 * The letter run.
 *
 * A clerk runs this on a morning and it works out which rung every overdue
 * connection has reached, skips the ones that have already had that letter,
 * and writes the rest. It is deliberately safe to run twice in a day: the
 * store refuses a second letter at the same rung for the same due date, and
 * this checks before it tries, so a double run is quiet rather than noisy.
 */

import type { CivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import { NOTICE_ID } from '../util/ids';
import type { NoticeStage } from '../domain/delinquency';
import { withTransaction } from '../storage/db';
import { listConnections } from '../storage/repositories/connections';
import { appendEvent } from '../storage/repositories/events';
import {
  clearNotice,
  findNotice,
  insertNotice,
  noticeAlreadySent,
  type NoticeRecord,
} from '../storage/repositories/notices';
import { complianceFor, type ComplianceStatus, type PointCompliance } from './compliance';
import { describeLetterRun, summarise } from './letters';
import { formatId, parseId } from '../util/ids';
import { mintId, type Register } from './register';

export interface NoticeRunOptions {
  readonly asOf: CivilDate;
  /** Work out what would go out without writing anything. */
  readonly dryRun?: boolean;
  /** Only this route, for an office that walks one at a time. */
  readonly route?: string;
  /**
   * Stop after this many letters. An office that has not run this for a year
   * does not want four hundred letters in one envelope run, it wants the worst
   * hundred today and the rest next week.
   */
  readonly limit?: number;
}

export interface SkippedConnection {
  readonly connectionId: string;
  readonly reason: string;
}

export interface NoticeRun {
  readonly issued: ReadonlyArray<NoticeRecord>;
  readonly skipped: ReadonlyArray<SkippedConnection>;
  readonly considered: number;
}

export function runNotices(
  register: Register,
  options: NoticeRunOptions,
): Result<NoticeRun, string> {
  const connections = listConnections(register.db, {
    activeOn: options.asOf,
    ...(options.route === undefined ? {} : { route: options.route }),
  });

  const issued: NoticeRecord[] = [];
  const skipped: SkippedConnection[] = [];
  const pending: Array<{ notice: NoticeRecord; accountNumber: string }> = [];
  let sequence = sequenceOf(mintId(register, NOTICE_ID, 'notices', 'notice_id'));

  for (const connection of connections) {
    const status = complianceFor(register, connection.connectionId, options.asOf);
    if (!status.ok) {
      skipped.push({ connectionId: connection.connectionId, reason: status.error });
      continue;
    }
    const due = dueLetter(status.value);
    if (due === undefined) {
      continue;
    }
    if (noticeAlreadySent(register.db, connection.connectionId, due.dueDate, due.stage)) {
      skipped.push({
        connectionId: connection.connectionId,
        reason: `the ${due.stage} notice for ${due.dueDate} has already gone out`,
      });
      continue;
    }

    const notice: NoticeRecord = {
      noticeId: formatId(NOTICE_ID, sequence),
      connectionId: connection.connectionId,
      ...(due.assemblyId === undefined ? {} : { assemblyId: due.assemblyId }),
      stage: due.stage,
      dueDate: due.dueDate,
      issuedOn: options.asOf,
      ladder: due.ladder,
      daysPastDue: due.daysPastDue,
      body: noticeBody(register, status.value, due),
    };
    sequence += 1;

    if (options.dryRun === true) {
      issued.push(notice);
      if (options.limit !== undefined && issued.length >= options.limit) {
        break;
      }
      continue;
    }

    pending.push({ notice, accountNumber: connection.accountNumber });
    if (options.limit !== undefined && pending.length >= options.limit) {
      break;
    }
  }

  // one transaction for the whole run rather than one per letter. on a
  // district of a few hundred that is the difference between a run somebody
  // waits for and a run somebody makes a cup of tea during.
  if (pending.length > 0) {
    withTransaction(register.db, () => {
      for (const entry of pending) {
        const stored = insertNotice(register.db, entry.notice);
        if (!stored.ok) {
          skipped.push({
            connectionId: entry.notice.connectionId,
            reason: stored.error,
          });
          continue;
        }
        appendEvent(register.db, {
          happenedAt: register.now(),
          actor: register.actor,
          kind: 'notice_issued',
          subjectKind: 'notice',
          subjectId: entry.notice.noticeId,
          detail:
            `${entry.notice.stage} notice to ${entry.accountNumber}, ` +
            `${entry.notice.daysPastDue} days past due`,
        });
        issued.push(entry.notice);
      }
    });
  }

  return ok({ issued, skipped, considered: connections.length });
}

interface DueLetter {
  readonly stage: Exclude<NoticeStage, 'none'>;
  readonly dueDate: CivilDate;
  readonly daysPastDue: number;
  readonly ladder: string;
  readonly assemblyId?: string;
  readonly scope: string;
}

/** The rung the connection has reached, taking the worse of the two points. */
function dueLetter(status: ComplianceStatus): DueLetter | undefined {
  const candidates = [status.containment, status.isolation]
    .map(letterFor)
    .filter((entry): entry is DueLetter => entry !== undefined);
  if (candidates.length === 0) {
    return undefined;
  }
  return candidates.sort((left, right) => right.daysPastDue - left.daysPastDue)[0];
}

function letterFor(point: PointCompliance): DueLetter | undefined {
  const delinquency = point.delinquency;
  if (delinquency === undefined || point.due === undefined) {
    return undefined;
  }
  if (delinquency.stage === 'none' || delinquency.held) {
    return undefined;
  }
  return {
    stage: delinquency.stage,
    dueDate: point.due.due,
    daysPastDue: delinquency.daysPastDue,
    ladder: delinquency.ladder.name,
    ...(point.assembly === undefined ? {} : { assemblyId: point.assembly.assemblyId }),
    scope: point.scope,
  };
}

export function noticeBody(register: Register, status: ComplianceStatus, due: DueLetter): string {
  const letter = register.policy.letter;
  const lines = [
    letter.heading ?? `${register.policy.purveyorName} cross connection control program`,
    `account ${status.connectionId}, ${due.scope} protection`,
    `the test of the assembly at this connection was due on ${due.dueDate}`,
    `it is now ${due.daysPastDue} days past due`,
  ];
  if (due.stage === 'shutoff') {
    lines.push('water service at this address may now be shut off without further notice');
  } else if (due.stage === 'final') {
    lines.push('this is the final notice before the service is scheduled for shutoff');
  } else {
    lines.push(
      letter.ask ?? 'please arrange a test by a certified tester and have the report filed',
    );
  }
  if (letter.footer !== undefined) {
    lines.push(letter.footer);
  }
  return lines.join('\n');
}

/**
 * Take a letter back. The office does this when it wrote to the wrong address
 * or when the customer turns out to have filed on time and the paperwork was
 * sitting in a tray. The letter stays on the file with the day it was
 * cancelled on it, because the customer has a copy either way.
 */
export function cancelNotice(
  register: Register,
  noticeId: string,
  on: CivilDate,
  reason: string,
): Result<NoticeRecord, string> {
  if (reason.trim() === '') {
    return err('cancelling a letter has to say why');
  }
  const notice = findNotice(register.db, noticeId);
  if (notice === undefined) {
    return err(`there is no notice with the id ${noticeId}`);
  }
  if (notice.clearedOn !== undefined) {
    return err(`the notice ${noticeId} was already closed on ${notice.clearedOn}`);
  }
  if (on < notice.issuedOn) {
    return err(
      `the notice ${noticeId} went out on ${notice.issuedOn}, it cannot be cancelled on ${on}`,
    );
  }
  return withTransaction(register.db, () => {
    const cleared = clearNotice(register.db, noticeId, on);
    if (!cleared.ok) {
      return cleared;
    }
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'notice_cancelled',
      subjectKind: 'notice',
      subjectId: noticeId,
      detail: `${on}: ${reason}`,
    });
    return cleared;
  });
}

/** The number inside an id the register has just minted. */
function sequenceOf(id: string): number {
  const parsed = parseId(NOTICE_ID, id);
  return parsed.ok ? parsed.value : 1;
}

export function describeRun(run: NoticeRun): string {
  return describeLetterRun(
    summarise(
      run.considered,
      run.issued.map((notice) => notice.stage),
      run.skipped.length,
    ),
  );
}

/**
 * Everything that has happened at one connection, in one column.
 *
 * The clerk on the telephone does not want six tables. They want the file, in
 * order, with the dates the customer is quoting at them. This reads the six
 * tables and interleaves them by the day the thing happened, which is not the
 * day it was written down: a report filed in June for a test in February
 * belongs in February.
 */

import type { CivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import { findConnection } from '../storage/repositories/connections';
import { surveyHistory } from '../storage/repositories/surveys';
import { listAssemblies } from '../storage/repositories/assemblies';
import { reportsForAssembly } from '../storage/repositories/reports';
import { noticesForConnection } from '../storage/repositories/notices';
import { variancesForConnection } from '../storage/repositories/variances';
import { ordersFor } from './shutoff';
import type { Register } from './register';

export type EntryKind =
  | 'connection'
  | 'survey'
  | 'assembly'
  | 'test'
  | 'notice'
  | 'variance'
  | 'shutoff';

export interface TimelineEntry {
  readonly on: CivilDate;
  readonly kind: EntryKind;
  readonly reference: string;
  readonly summary: string;
}

export function timelineFor(
  register: Register,
  connectionId: string,
): Result<TimelineEntry[], string> {
  const connection = findConnection(register.db, connectionId);
  if (connection === undefined) {
    return err(`there is no connection with the id ${connectionId}`);
  }

  const entries: TimelineEntry[] = [
    {
      on: connection.connectedOn,
      kind: 'connection',
      reference: connection.connectionId,
      summary: `${connection.premiseName} connected on account ${connection.accountNumber}`,
    },
  ];

  if (connection.disconnectedOn !== undefined) {
    entries.push({
      on: connection.disconnectedOn,
      kind: 'connection',
      reference: connection.connectionId,
      summary: 'the service was taken off the register',
    });
  }

  for (const survey of surveyHistory(register.db, connectionId)) {
    entries.push({
      on: survey.surveyedOn,
      kind: 'survey',
      reference: survey.surveyId,
      summary:
        `walked by ${survey.surveyor}, ${survey.containmentDegree} at the meter, ` +
        `${survey.isolationDegree} inside` +
        (survey.findingCodes.length === 0 ? '' : `, findings ${survey.findingCodes.join(' ')}`),
    });
  }

  for (const assembly of listAssemblies(register.db, { connectionId })) {
    entries.push({
      on: assembly.installedOn,
      kind: 'assembly',
      reference: assembly.assemblyId,
      summary: `${assembly.assemblyClass} ${assembly.modelId} fitted at ${assembly.location}`,
    });
    if (assembly.removedOn !== undefined) {
      entries.push({
        on: assembly.removedOn,
        kind: 'assembly',
        reference: assembly.assemblyId,
        summary: `the ${assembly.assemblyClass} came out`,
      });
    }
    for (const stored of reportsForAssembly(register.db, assembly.assemblyId)) {
      entries.push({
        on: stored.report.testedOn,
        kind: 'test',
        reference: stored.report.reportId,
        summary: stored.admissible
          ? `tested by ${stored.report.testerId}, ${stored.outcome}` +
            (stored.report.repairMade ? ', repaired on site' : '')
          : `tested by ${stored.report.testerId} and refused: ${stored.inadmissibleCodes.join(' ')}`,
      });
    }
  }

  for (const notice of noticesForConnection(register.db, connectionId)) {
    entries.push({
      on: notice.issuedOn,
      kind: 'notice',
      reference: notice.noticeId,
      summary: `${notice.stage} notice, ${notice.daysPastDue} days past the due date of ${notice.dueDate}`,
    });
    if (notice.clearedOn !== undefined) {
      entries.push({
        on: notice.clearedOn,
        kind: 'notice',
        reference: notice.noticeId,
        summary: `the ${notice.stage} notice was closed`,
      });
    }
  }

  for (const variance of variancesForConnection(register.db, connectionId)) {
    entries.push({
      on: variance.appliedOn,
      kind: 'variance',
      reference: variance.varianceId,
      summary: `applied for, asking the office to accept a ${variance.acceptedClass}`,
    });
    if (variance.decidedOn !== undefined) {
      entries.push({
        on: variance.decidedOn,
        kind: 'variance',
        reference: variance.varianceId,
        summary: `${variance.decision ?? 'decided'} by the office`,
      });
    }
    if (variance.revokedOn !== undefined) {
      entries.push({
        on: variance.revokedOn,
        kind: 'variance',
        reference: variance.varianceId,
        summary: 'revoked',
      });
    }
  }

  for (const order of ordersFor(register, connectionId)) {
    entries.push({
      on: order.raisedOn,
      kind: 'shutoff',
      reference: order.orderId,
      summary: `order raised by ${order.raisedBy}: ${order.reason}`,
    });
    if (order.executedOn !== undefined) {
      entries.push({
        on: order.executedOn,
        kind: 'shutoff',
        reference: order.orderId,
        summary: `water off, ${order.executedBy ?? 'a crew'} went`,
      });
    }
    if (order.restoredOn !== undefined) {
      entries.push({
        on: order.restoredOn,
        kind: 'shutoff',
        reference: order.orderId,
        summary: `water back on, ${order.restoredBy ?? 'a crew'} went`,
      });
    }
    if (order.cancelledOn !== undefined) {
      entries.push({
        on: order.cancelledOn,
        kind: 'shutoff',
        reference: order.orderId,
        summary: `order called off: ${order.cancelledReason ?? 'no reason given'}`,
      });
    }
  }

  return ok(entries.sort(byDateThenKind));
}

const KIND_ORDER: EntryKind[] = [
  'connection',
  'survey',
  'assembly',
  'test',
  'variance',
  'notice',
  'shutoff',
];

function byDateThenKind(left: TimelineEntry, right: TimelineEntry): number {
  if (left.on !== right.on) {
    return left.on.localeCompare(right.on);
  }
  const order = KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind);
  return order === 0 ? left.reference.localeCompare(right.reference) : order;
}

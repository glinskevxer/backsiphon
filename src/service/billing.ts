/**
 * What a connection owes for the year.
 *
 * The annual fee is charged against the class the office requires after any
 * variance, so a customer who has been let off a reduced pressure assembly
 * pays the double check band. The penalties come off the notice ladder, and
 * the reinspection count comes off the trail, because that is where a visit is
 * actually recorded.
 */

import type { CivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import { buildInvoice, formatCents, type Invoice } from '../domain/fees';
import type { NoticeStage } from '../domain/delinquency';
import { recentEvents } from '../storage/repositories/events';
import { listConnections } from '../storage/repositories/connections';
import { complianceFor } from './compliance';
import type { Register } from './register';

export interface ConnectionInvoice {
  readonly connectionId: string;
  readonly accountNumber: string;
  readonly asOf: CivilDate;
  readonly requiredClass?: string;
  readonly stage: NoticeStage;
  readonly reinspections: number;
  readonly invoice: Invoice;
}

/** Visits the office had to make, counted off the trail rather than guessed. */
export function reinspectionCount(register: Register, connectionId: string, since: CivilDate): number {
  return recentEvents(register.db, { kind: 'reinspection_visit', limit: 500 }).filter(
    (event) => event.subjectId === connectionId && event.happenedAt.slice(0, 10) >= since,
  ).length;
}

export function invoiceFor(
  register: Register,
  connectionId: string,
  asOf: CivilDate,
): Result<ConnectionInvoice, string> {
  const connection = listConnections(register.db).find(
    (candidate) => candidate.connectionId === connectionId,
  );
  if (connection === undefined) {
    return err(`there is no connection with the id ${connectionId}`);
  }
  const status = complianceFor(register, connectionId, asOf);
  if (!status.ok) {
    return err(status.error);
  }

  const point = status.value.containment;
  const stage = point.delinquency?.stage ?? 'none';
  const reinspections = reinspectionCount(register, connectionId, yearStart(asOf));
  const requiredClass = point.point.effectiveClass;

  const invoice = buildInvoice({
    ...(requiredClass === undefined ? {} : { requiredClass }),
    sizeInches: point.assembly?.sizeInches ?? connection.serviceSizeInches,
    penalties: {
      stage,
      degree: status.value.protection.survey.containmentDegree,
      reinspections,
    },
  });

  return ok({
    connectionId,
    accountNumber: connection.accountNumber,
    asOf,
    ...(requiredClass === undefined ? {} : { requiredClass }),
    stage,
    reinspections,
    invoice,
  });
}

export interface BillingRun {
  readonly invoices: ReadonlyArray<ConnectionInvoice>;
  readonly skipped: ReadonlyArray<{ connectionId: string; reason: string }>;
  readonly totalCents: number;
}

export function billingRun(register: Register, asOf: CivilDate, route?: string): BillingRun {
  const invoices: ConnectionInvoice[] = [];
  const skipped: Array<{ connectionId: string; reason: string }> = [];
  for (const connection of listConnections(register.db, {
    activeOn: asOf,
    ...(route === undefined ? {} : { route }),
  })) {
    const invoice = invoiceFor(register, connection.connectionId, asOf);
    if (invoice.ok) {
      invoices.push(invoice.value);
    } else {
      skipped.push({ connectionId: connection.connectionId, reason: invoice.error });
    }
  }
  return {
    invoices,
    skipped,
    totalCents: invoices.reduce((total, entry) => total + entry.invoice.totalCents, 0),
  };
}

export function describeInvoice(invoice: ConnectionInvoice): string[] {
  return [
    ...invoice.invoice.lines.map((line) => `${line.description}  ${formatCents(line.cents)}`),
    `total  ${formatCents(invoice.invoice.totalCents)}`,
  ];
}

function yearStart(asOf: CivilDate): CivilDate {
  return `${asOf.slice(0, 4)}-01-01`;
}

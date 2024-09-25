/**
 * The numbers the office is asked for.
 *
 * Two audiences. The program manager wants to know how much work is coming and
 * where the register is weak, and the state wants a compliance rate. They are
 * not the same number: the state counts assemblies tested inside their cycle,
 * and the manager cares about the connections that have no assembly at all,
 * which the state number cannot see.
 */

import { addDays, type CivilDate } from '../util/dates';
import type { HazardDegree } from '../domain/hazard';
import { isTestable } from '../domain/assembly';
import { listConnections } from '../storage/repositories/connections';
import { listAssemblies } from '../storage/repositories/assemblies';
import { complianceFor, type Standing } from './compliance';
import type { Register } from './register';

export interface StandingCounts {
  readonly compliant: number;
  readonly not_yet_due: number;
  readonly due: number;
  readonly overdue: number;
  readonly deficient: number;
  readonly shutoff_eligible: number;
  readonly unreadable: number;
}

export interface ProgramSummary {
  readonly asOf: CivilDate;
  readonly connections: number;
  readonly assemblies: number;
  readonly testableAssemblies: number;
  readonly byStanding: StandingCounts;
  readonly byDegree: Record<HazardDegree, number>;
  /** Testable assemblies tested inside their cycle, over all of them. */
  readonly complianceRate: number;
  readonly neverSurveyed: number;
  readonly shutoffEligible: ReadonlyArray<string>;
}

export function programSummary(register: Register, asOf: CivilDate): ProgramSummary {
  const connections = listConnections(register.db, { activeOn: asOf });
  const assemblies = listAssemblies(register.db, { activeOn: asOf });
  const testable = assemblies.filter((assembly) => isTestable(assembly.assemblyClass));

  const byStanding: Record<Standing | 'unreadable', number> = {
    compliant: 0,
    not_yet_due: 0,
    due: 0,
    overdue: 0,
    deficient: 0,
    shutoff_eligible: 0,
    unreadable: 0,
  };
  const byDegree: Record<HazardDegree, number> = { none: 0, nonhealth: 0, health: 0 };
  const shutoffEligible: string[] = [];
  let tested = 0;
  let neverSurveyed = 0;

  for (const connection of connections) {
    const status = complianceFor(register, connection.connectionId, asOf);
    if (!status.ok) {
      byStanding.unreadable += 1;
      neverSurveyed += 1;
      continue;
    }
    byStanding[status.value.standing] += 1;
    byDegree[status.value.protection.survey.containmentDegree] += 1;
    if (status.value.shutoffEligible) {
      shutoffEligible.push(connection.connectionId);
    }
    for (const point of [status.value.containment, status.value.isolation]) {
      if (point.due !== undefined && point.assembly !== undefined && asOf <= point.due.due) {
        tested += 1;
      }
    }
  }

  return {
    asOf,
    connections: connections.length,
    assemblies: assemblies.length,
    testableAssemblies: testable.length,
    byStanding,
    byDegree,
    complianceRate: testable.length === 0 ? 1 : round(tested / testable.length),
    neverSurveyed,
    shutoffEligible,
  };
}

export interface WorkItem {
  readonly connectionId: string;
  readonly accountNumber: string;
  readonly route: string;
  readonly address: string;
  readonly assemblyId?: string;
  readonly assemblyClass?: string;
  readonly location?: string;
  readonly due?: CivilDate;
  readonly standing: Standing;
  readonly urgency: string;
}

export interface WorkListOptions {
  readonly asOf: CivilDate;
  /** How far ahead to look. Zero is everything already due. */
  readonly withinDays?: number;
  readonly route?: string;
}

/**
 * The list a tester or an inspector takes out in the van. Sorted by route and
 * then by how late it is, because that is the order somebody drives it in.
 */
export function workList(register: Register, options: WorkListOptions): WorkItem[] {
  const horizon = addDays(options.asOf, options.withinDays ?? 0);
  const items: WorkItem[] = [];

  for (const connection of listConnections(register.db, {
    activeOn: options.asOf,
    ...(options.route === undefined ? {} : { route: options.route }),
  })) {
    const status = complianceFor(register, connection.connectionId, options.asOf);
    if (!status.ok) {
      items.push({
        connectionId: connection.connectionId,
        accountNumber: connection.accountNumber,
        route: connection.route,
        address: connection.premiseAddress,
        standing: 'deficient',
        urgency: 'survey',
      });
      continue;
    }
    for (const point of [status.value.containment, status.value.isolation]) {
      const due = point.due?.due;
      const wanted = due !== undefined && due <= horizon;
      const deficient =
        point.point.deficiency.kind !== 'none' && point.point.deficiency.kind !== 'not_required';
      if (!wanted && !deficient) {
        continue;
      }
      items.push({
        connectionId: connection.connectionId,
        accountNumber: connection.accountNumber,
        route: connection.route,
        address: connection.premiseAddress,
        ...(point.assembly === undefined
          ? {}
          : {
              assemblyId: point.assembly.assemblyId,
              assemblyClass: point.assembly.assemblyClass,
              location: point.assembly.location,
            }),
        ...(due === undefined ? {} : { due }),
        standing: status.value.standing,
        urgency: point.point.deficiency.urgency,
      });
    }
  }

  return items.sort(byRouteThenDue);
}

function byRouteThenDue(left: WorkItem, right: WorkItem): number {
  if (left.route !== right.route) {
    return left.route.localeCompare(right.route);
  }
  const leftDue = left.due ?? '9999-12-31';
  const rightDue = right.due ?? '0000-01-01';
  return leftDue.localeCompare(rightDue);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

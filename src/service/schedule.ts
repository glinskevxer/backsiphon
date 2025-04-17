/**
 * What falls due, month by month, for the year ahead.
 *
 * The program office plans a testing season with this. It is not the work
 * list: the work list is what is late today, and this is what will be late if
 * nobody does anything, which is the number that decides how many testers the
 * district needs in June.
 */

import { addMonths, startOfMonth, type CivilDate } from '../util/dates';
import { isTestable } from '../domain/assembly';
import { listConnections } from '../storage/repositories/connections';
import { complianceFor } from './compliance';
import type { Register } from './register';

export interface ScheduleMonth {
  readonly month: string;
  readonly due: number;
  readonly healthHazard: number;
  readonly connections: ReadonlyArray<string>;
}

export interface Schedule {
  readonly from: CivilDate;
  readonly months: ReadonlyArray<ScheduleMonth>;
  /** Tests already past due on the day the schedule was drawn. */
  readonly alreadyLate: number;
  /** Assemblies on a cycle that the schedule could not read at all. */
  readonly unreadable: number;
}

export interface ScheduleOptions {
  readonly asOf: CivilDate;
  readonly months?: number;
  readonly route?: string;
}

export function drawSchedule(register: Register, options: ScheduleOptions): Schedule {
  const monthCount = options.months ?? 12;
  const start = startOfMonth(options.asOf);
  const buckets = new Map<string, { due: number; health: number; connections: string[] }>();
  for (let offset = 0; offset < monthCount; offset += 1) {
    buckets.set(addMonths(start, offset).slice(0, 7), { due: 0, health: 0, connections: [] });
  }

  let alreadyLate = 0;
  let unreadable = 0;

  for (const connection of listConnections(register.db, {
    activeOn: options.asOf,
    ...(options.route === undefined ? {} : { route: options.route }),
  })) {
    const status = complianceFor(register, connection.connectionId, options.asOf);
    if (!status.ok) {
      unreadable += 1;
      continue;
    }
    for (const point of [status.value.containment, status.value.isolation]) {
      if (point.assembly === undefined || !isTestable(point.assembly.assemblyClass)) {
        continue;
      }
      const due = point.due?.due;
      if (due === undefined) {
        continue;
      }
      if (due < options.asOf) {
        alreadyLate += 1;
        continue;
      }
      const bucket = buckets.get(due.slice(0, 7));
      if (bucket === undefined) {
        continue;
      }
      bucket.due += 1;
      if (status.value.protection.survey.containmentDegree === 'health') {
        bucket.health += 1;
      }
      if (!bucket.connections.includes(connection.connectionId)) {
        bucket.connections.push(connection.connectionId);
      }
    }
  }

  return {
    from: start,
    months: [...buckets.entries()].map(([month, bucket]) => ({
      month,
      due: bucket.due,
      healthHazard: bucket.health,
      connections: bucket.connections,
    })),
    alreadyLate,
    unreadable,
  };
}

/** The busiest month, which is the one the office plans around. */
export function peakMonth(schedule: Schedule): ScheduleMonth | undefined {
  return [...schedule.months].sort((left, right) => right.due - left.due)[0];
}

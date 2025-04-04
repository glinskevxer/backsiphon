/**
 * The return the state asks for once a year.
 *
 * It is not the manager's summary with a date on it. The state counts
 * differently: it wants service connections by degree of hazard, how many of
 * those carry the protection the rules ask for, how many were tested during
 * the year rather than inside their own cycle, and what the office did about
 * the ones that were not. The year is a calendar year and the answers are as
 * at the last day of it.
 */

import { addDays, type CivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import type { HazardDegree } from '../domain/hazard';
import { isTestable } from '../domain/assembly';
import { listConnections } from '../storage/repositories/connections';
import { listAssemblies } from '../storage/repositories/assemblies';
import { reportsForAssembly } from '../storage/repositories/reports';
import { openNotices, noticesForConnection } from '../storage/repositories/notices';
import { complianceFor } from './compliance';
import { ordersFor } from './shutoff';
import type { Register } from './register';

export interface AnnualReturn {
  readonly year: number;
  readonly asOf: CivilDate;
  readonly connections: number;
  readonly byDegree: Record<HazardDegree, number>;
  /** Connections whose required protection is fitted and satisfied. */
  readonly protected: number;
  readonly unprotected: number;
  readonly assembliesInService: number;
  readonly testableAssemblies: number;
  readonly testedInYear: number;
  readonly passedInYear: number;
  readonly failedInYear: number;
  readonly refusedInYear: number;
  readonly noticesIssued: number;
  readonly noticesOpenAtYearEnd: number;
  readonly shutoffsOrdered: number;
  readonly shutoffsCarriedOut: number;
  readonly neverSurveyed: number;
}

export function annualReturn(register: Register, year: number): Result<AnnualReturn, string> {
  if (!Number.isInteger(year) || year < 1900 || year > 2999) {
    return err(`${year} is not a year`);
  }
  const from: CivilDate = `${year}-01-01`;
  const to: CivilDate = `${year}-12-31`;
  const afterYear = addDays(to, 1);

  const connections = listConnections(register.db, { activeOn: to });
  const byDegree: Record<HazardDegree, number> = { none: 0, nonhealth: 0, health: 0 };
  let protectedCount = 0;
  let unprotected = 0;
  let neverSurveyed = 0;
  let noticesIssued = 0;
  let shutoffsOrdered = 0;
  let shutoffsCarriedOut = 0;

  for (const connection of connections) {
    const status = complianceFor(register, connection.connectionId, to);
    if (!status.ok) {
      neverSurveyed += 1;
    } else {
      byDegree[status.value.protection.survey.containmentDegree] += 1;
      const containment = status.value.containment.point.deficiency.kind;
      if (containment === 'none' || containment === 'not_required') {
        protectedCount += 1;
      } else {
        unprotected += 1;
      }
    }

    noticesIssued += noticesForConnection(register.db, connection.connectionId).filter(
      (notice) => notice.issuedOn >= from && notice.issuedOn <= to,
    ).length;

    for (const order of ordersFor(register, connection.connectionId)) {
      if (order.raisedOn >= from && order.raisedOn <= to) {
        shutoffsOrdered += 1;
      }
      if (order.executedOn !== undefined && order.executedOn >= from && order.executedOn <= to) {
        shutoffsCarriedOut += 1;
      }
    }
  }

  const assemblies = listAssemblies(register.db, { activeOn: to });
  let tested = 0;
  let passed = 0;
  let failed = 0;
  let refused = 0;

  for (const assembly of listAssemblies(register.db)) {
    for (const stored of reportsForAssembly(register.db, assembly.assemblyId)) {
      if (stored.report.testedOn < from || stored.report.testedOn > to) {
        continue;
      }
      if (!stored.admissible) {
        refused += 1;
        continue;
      }
      tested += 1;
      if (stored.outcome === 'pass') {
        passed += 1;
      } else if (stored.outcome === 'fail') {
        failed += 1;
      }
    }
  }

  return ok({
    year,
    asOf: to,
    connections: connections.length,
    byDegree,
    protected: protectedCount,
    unprotected,
    assembliesInService: assemblies.length,
    testableAssemblies: assemblies.filter((assembly) => isTestable(assembly.assemblyClass)).length,
    testedInYear: tested,
    passedInYear: passed,
    failedInYear: failed,
    refusedInYear: refused,
    noticesIssued,
    noticesOpenAtYearEnd: openNotices(register.db, to).filter(
      (notice) => notice.issuedOn < afterYear,
    ).length,
    shutoffsOrdered,
    shutoffsCarriedOut,
    neverSurveyed,
  });
}

/** The return as the rows the state's own form wants, in its order. */
export function returnRows(entry: AnnualReturn): Array<[string, number | string]> {
  return [
    ['reporting year', entry.year],
    ['service connections', entry.connections],
    ['health hazard connections', entry.byDegree.health],
    ['pollutional hazard connections', entry.byDegree.nonhealth],
    ['no hazard connections', entry.byDegree.none],
    ['connections protected as required', entry.protected],
    ['connections not protected as required', entry.unprotected],
    ['connections never surveyed', entry.neverSurveyed],
    ['assemblies in service', entry.assembliesInService],
    ['assemblies subject to field test', entry.testableAssemblies],
    ['tests accepted during the year', entry.testedInYear],
    ['tests passed', entry.passedInYear],
    ['tests failed', entry.failedInYear],
    ['reports refused', entry.refusedInYear],
    ['notices issued', entry.noticesIssued],
    ['notices open at year end', entry.noticesOpenAtYearEnd],
    ['shutoffs ordered', entry.shutoffsOrdered],
    ['shutoffs carried out', entry.shutoffsCarriedOut],
  ];
}

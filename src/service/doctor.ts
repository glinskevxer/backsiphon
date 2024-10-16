/**
 * Looking for the things a register quietly gets wrong.
 *
 * None of these are schema problems. The store will hold every one of them
 * happily, which is exactly why somebody has to go and look: two assemblies at
 * one point, a certificate that lapsed last month with reports filed under it,
 * a model that came off the list years ago and is still in fifty vaults.
 */

import { addDays, type CivilDate } from '../util/dates';
import { certificationStatus, gaugeStatus, calibrationDueOn } from '../domain/tester';
import { listConnections } from '../storage/repositories/connections';
import { listAssemblies, listModels } from '../storage/repositories/assemblies';
import { currentSurvey } from '../storage/repositories/surveys';
import { gaugesOf, listTesters } from '../storage/repositories/testers';
import { openNotices } from '../storage/repositories/notices';
import { reportsForAssembly } from '../storage/repositories/reports';
import type { Register } from './register';

export type CheckSeverity = 'note' | 'warning' | 'fault';

export interface Finding {
  readonly check: string;
  readonly severity: CheckSeverity;
  readonly subject: string;
  readonly detail: string;
}

export interface Examination {
  readonly asOf: CivilDate;
  readonly findings: ReadonlyArray<Finding>;
  readonly faults: number;
  readonly warnings: number;
}

/** How far ahead a lapsing certificate is worth mentioning. */
export const LAPSE_HORIZON_DAYS = 60;

export function examine(register: Register, asOf: CivilDate): Examination {
  const findings: Finding[] = [
    ...doubleFitted(register, asOf),
    ...unsurveyed(register, asOf),
    ...grandfathered(register, asOf),
    ...lapsingCertificates(register, asOf),
    ...staleGauges(register, asOf),
    ...reportsAfterRemoval(register),
    ...longOpenNotices(register, asOf),
  ];
  return {
    asOf,
    findings,
    faults: findings.filter((finding) => finding.severity === 'fault').length,
    warnings: findings.filter((finding) => finding.severity === 'warning').length,
  };
}

function doubleFitted(register: Register, asOf: CivilDate): Finding[] {
  const seen = new Map<string, string[]>();
  for (const assembly of listAssemblies(register.db, { activeOn: asOf })) {
    const key = `${assembly.connectionId}/${assembly.scope}`;
    seen.set(key, [...(seen.get(key) ?? []), assembly.assemblyId]);
  }
  return [...seen.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({
      check: 'two assemblies at one point',
      severity: 'fault' as const,
      subject: key,
      detail: `${ids.join(' and ')} are both in the ground, so nobody can say which was tested`,
    }));
}

function unsurveyed(register: Register, asOf: CivilDate): Finding[] {
  return listConnections(register.db, { activeOn: asOf })
    .filter((connection) => currentSurvey(register.db, connection.connectionId, asOf) === undefined)
    .map((connection) => ({
      check: 'never surveyed',
      severity: 'warning' as const,
      subject: connection.connectionId,
      detail: `${connection.premiseName} has been on the register since ${connection.connectedOn}`,
    }));
}

function grandfathered(register: Register, asOf: CivilDate): Finding[] {
  const delisted = new Map(
    listModels(register.db)
      .filter((model) => model.delistedOn !== undefined && model.delistedOn <= asOf)
      .map((model) => [model.modelId, model.delistedOn ?? '']),
  );
  return listAssemblies(register.db, { activeOn: asOf })
    .filter((assembly) => delisted.has(assembly.modelId))
    .map((assembly) => ({
      check: 'grandfathered model',
      severity: 'note' as const,
      subject: assembly.assemblyId,
      detail: `${assembly.modelId} came off the list on ${delisted.get(assembly.modelId) ?? ''}, so a failure means replacement`,
    }));
}

function lapsingCertificates(register: Register, asOf: CivilDate): Finding[] {
  const horizon = addDays(asOf, LAPSE_HORIZON_DAYS);
  const findings: Finding[] = [];
  for (const tester of listTesters(register.db)) {
    const standing = certificationStatus(tester, asOf);
    if (standing === 'expired' || standing === 'suspended') {
      findings.push({
        check: 'certificate not current',
        severity: 'warning',
        subject: tester.testerId,
        detail: `${tester.name} reads ${standing}, so nothing they file now can be accepted`,
      });
      continue;
    }
    if (standing === 'valid' && tester.expiresOn <= horizon) {
      findings.push({
        check: 'certificate about to lapse',
        severity: 'note',
        subject: tester.testerId,
        detail: `${tester.name} runs out on ${tester.expiresOn}`,
      });
    }
  }
  return findings;
}

function staleGauges(register: Register, asOf: CivilDate): Finding[] {
  const findings: Finding[] = [];
  for (const tester of listTesters(register.db)) {
    for (const gauge of gaugesOf(register.db, tester.testerId)) {
      if (gaugeStatus(gauge, asOf) === 'out_of_calibration') {
        findings.push({
          check: 'gauge out of calibration',
          severity: 'warning',
          subject: gauge.gaugeId,
          detail: `last calibrated ${gauge.calibratedOn}, due ${calibrationDueOn(gauge)}`,
        });
      }
    }
  }
  return findings;
}

function reportsAfterRemoval(register: Register): Finding[] {
  const findings: Finding[] = [];
  for (const assembly of listAssemblies(register.db)) {
    if (assembly.removedOn === undefined) {
      continue;
    }
    for (const stored of reportsForAssembly(register.db, assembly.assemblyId)) {
      if (stored.report.testedOn > assembly.removedOn) {
        findings.push({
          check: 'report against an assembly that had come out',
          severity: 'fault',
          subject: stored.report.reportId,
          detail: `tested ${stored.report.testedOn}, and ${assembly.assemblyId} came out ${assembly.removedOn}`,
        });
      }
    }
  }
  return findings;
}

function longOpenNotices(register: Register, asOf: CivilDate): Finding[] {
  const cutoff = addDays(asOf, -180);
  return openNotices(register.db, asOf)
    .filter((notice) => notice.issuedOn <= cutoff)
    .map((notice) => ({
      check: 'notice open for a long time',
      severity: 'warning' as const,
      subject: notice.noticeId,
      detail: `${notice.stage} notice on ${notice.connectionId} has been open since ${notice.issuedOn}`,
    }));
}

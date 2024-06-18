/**
 * What a connection has to carry, what it does carry, and the gap between.
 *
 * This is the join. Everything up to here answers one question each: the
 * survey says how bad the premise is, the requirement says what that asks for,
 * the variance says what the office will take instead, the approval list says
 * what may be fitted, and the assembly table says what is there. Reading them
 * in the right order is the whole job, and the order is not obvious, so it is
 * written once here and nowhere else.
 */

import type { CivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import { findingByCode, type HazardFinding } from '../domain/hazard';
import { premiseUseByCode } from '../domain/premise';
import { nextSurveyDue, type HazardAssessment } from '../domain/survey';
import {
  containmentRequirement,
  isolationRequirement,
  requiredClassOf,
  type RequiredProtection,
} from '../domain/requirement';
import { compareToRequirement, type Deficiency, type InstalledAssembly, type ProtectionScope, type Urgency } from '../domain/deficiency';
import { applyVariance, varianceStatus, type VarianceStatus } from '../domain/variance';
import type { AssemblyClass } from '../domain/assembly';
import { findConnection, type ConnectionRecord } from '../storage/repositories/connections';
import { currentSurvey, type SurveyRow } from '../storage/repositories/surveys';
import { assemblyAtPoint } from '../storage/repositories/assemblies';
import { listGranted } from '../storage/repositories/variances';
import type { Register } from './register';

export interface ProtectionPoint {
  readonly scope: ProtectionScope;
  /** What the rules ask for before anybody varies anything. */
  readonly required: RequiredProtection;
  /** What the office will actually take on the day. */
  readonly effective: RequiredProtection;
  readonly requiredClass?: AssemblyClass;
  readonly effectiveClass?: AssemblyClass;
  readonly varianceId?: string;
  readonly varianceStatus?: VarianceStatus;
  readonly installed?: InstalledAssembly;
  readonly deficiency: Deficiency;
}

export interface ProtectionStatus {
  readonly connectionId: string;
  readonly asOf: CivilDate;
  readonly survey: SurveyRow;
  readonly assessment: HazardAssessment;
  readonly containment: ProtectionPoint;
  readonly isolation: ProtectionPoint;
  readonly urgency: Urgency;
}

/**
 * Rebuild the assessment the survey row stands for. The degrees are read off
 * the row rather than worked out again, because the row is what the office
 * decided at the time and the rules may have moved since.
 */
export function assessmentFromRow(
  row: SurveyRow,
  connection: ConnectionRecord,
): Result<HazardAssessment, string> {
  const use = premiseUseByCode(row.premiseUseCode);
  if (!use.ok) {
    return err(use.error);
  }
  const findings: HazardFinding[] = [];
  for (const code of row.findingCodes) {
    const finding = findingByCode(code);
    if (!finding.ok) {
      return err(finding.error);
    }
    findings.push(finding.value);
  }
  const degree =
    row.containmentDegree === 'health' || row.isolationDegree === 'health'
      ? 'health'
      : row.containmentDegree === 'nonhealth' || row.isolationDegree === 'nonhealth'
        ? 'nonhealth'
        : 'none';
  return ok({
    connectionId: connection.connectionId,
    surveyedOn: row.surveyedOn,
    use: use.value,
    findings,
    degree,
    containmentDegree: row.containmentDegree,
    isolationDegree: row.isolationDegree,
    airGapRequired: row.airGapRequired,
    backpressure: row.backpressure,
    basis: row.basis,
    drivers: [...row.findingCodes],
    nextSurveyDue: nextSurveyDue(row.surveyedOn, use.value, degree),
  });
}

export function protectionStatus(
  register: Register,
  connectionId: string,
  asOf: CivilDate,
): Result<ProtectionStatus, string> {
  const connection = findConnection(register.db, connectionId);
  if (connection === undefined) {
    return err(`there is no connection with the id ${connectionId}`);
  }
  const survey = currentSurvey(register.db, connectionId, asOf);
  if (survey === undefined) {
    return err(`the connection ${connectionId} has never been surveyed`);
  }
  const assessment = assessmentFromRow(survey, connection);
  if (!assessment.ok) {
    return err(assessment.error);
  }

  const containment = pointFor(register, connection, assessment.value, 'containment', asOf);
  const isolation = pointFor(register, connection, assessment.value, 'isolation', asOf);

  return ok({
    connectionId,
    asOf,
    survey,
    assessment: assessment.value,
    containment,
    isolation,
    urgency: worseUrgency(containment.deficiency.urgency, isolation.deficiency.urgency),
  });
}

function pointFor(
  register: Register,
  connection: ConnectionRecord,
  assessment: HazardAssessment,
  scope: ProtectionScope,
  asOf: CivilDate,
): ProtectionPoint {
  const required =
    scope === 'containment'
      ? containmentRequirement(assessment, {
          fireService: connection.fireService,
          purveyorMetered: connection.purveyorMetered,
          serviceSizeInches: connection.serviceSizeInches,
        })
      : isolationRequirement(assessment, {
          outletElevationInches: connection.outletElevationInches,
          indoorRiser: connection.indoorRiser,
          downstreamShutoff: connection.downstreamShutoff,
          continuousPressureHours: connection.continuousPressureHours,
        });

  const variance = varianceInEffect(register, connection.connectionId, asOf, scope);
  const varied = applyVariance(required, variance, asOf, assessment.containmentDegree);
  const installed = assemblyAtPoint(register.db, connection.connectionId, scope, asOf);
  const deficiency = compareToRequirement(varied.protection, installed, scope);

  return {
    scope,
    required,
    effective: varied.protection,
    ...(requiredClassOf(required) === undefined ? {} : { requiredClass: requiredClassOf(required) }),
    ...(requiredClassOf(varied.protection) === undefined
      ? {}
      : { effectiveClass: requiredClassOf(varied.protection) }),
    ...(varied.variedBy === undefined ? {} : { varianceId: varied.variedBy }),
    ...(varied.status === undefined ? {} : { varianceStatus: varied.status }),
    ...(installed === undefined ? {} : { installed }),
    deficiency,
  };
}

/**
 * A variance is written against a connection rather than against a point, so
 * the one that applies is the one whose accepted class could stand at that
 * point at all. In practice an office writes one at a time.
 */
function varianceInEffect(
  register: Register,
  connectionId: string,
  asOf: CivilDate,
  scope: ProtectionScope,
): ReturnType<typeof listGranted>[number] | undefined {
  const granted = listGranted(register.db, asOf).filter(
    (variance) => variance.connectionId === connectionId,
  );
  if (scope === 'containment') {
    return granted.find((variance) => variance.acceptedClass !== 'PVB' && variance.acceptedClass !== 'SVB' && variance.acceptedClass !== 'AVB');
  }
  return granted[0];
}

export function worseUrgency(left: Urgency, right: Urgency): Urgency {
  const rank: Record<Urgency, number> = { none: 0, cycle: 1, immediate: 2 };
  return rank[left] >= rank[right] ? left : right;
}

/** True where nothing at either point is short of what it should be. */
export function isCompliant(status: ProtectionStatus): boolean {
  return (
    (status.containment.deficiency.kind === 'none' ||
      status.containment.deficiency.kind === 'not_required') &&
    (status.isolation.deficiency.kind === 'none' ||
      status.isolation.deficiency.kind === 'not_required')
  );
}

export function varianceStatusFor(
  register: Register,
  connectionId: string,
  varianceId: string,
  asOf: CivilDate,
): Result<VarianceStatus, string> {
  const status = protectionStatus(register, connectionId, asOf);
  if (!status.ok) {
    return err(status.error);
  }
  const variance = listGranted(register.db, asOf).find(
    (candidate) => candidate.varianceId === varianceId,
  );
  if (variance === undefined) {
    return err(`there is no granted variance with the id ${varianceId} in effect on ${asOf}`);
  }
  return ok(varianceStatus(variance, asOf, status.value.assessment.containmentDegree));
}

/**
 * What the connection has to carry.
 *
 * This is the step that reads an assessment and answers with a class. It is
 * deliberately the only place that answer is made, because everything after it
 * measures against the answer rather than against the survey.
 */

import type { AssemblyClass } from './assembly';
import type { HazardAssessment } from './survey';
import type { HazardDegree } from './hazard';

export interface ServiceFacts {
  /** A dedicated fire line rather than a domestic or commercial service. */
  readonly fireService: boolean;
  /**
   * Whether the purveyor meters the service itself. An unmetered line has to
   * carry a detector assembly so that a leak or an unauthorised tap shows up.
   */
  readonly purveyorMetered: boolean;
  readonly serviceSizeInches: number;
}

export type RequiredProtection =
  | { readonly kind: 'none'; readonly reasons: ReadonlyArray<string> }
  | {
      readonly kind: 'required';
      readonly assemblyClass: AssemblyClass;
      readonly reasons: ReadonlyArray<string>;
    };

export function requiredClassOf(protection: RequiredProtection): AssemblyClass | undefined {
  return protection.kind === 'required' ? protection.assemblyClass : undefined;
}

/** The mechanical class a degree asks for before any other rule touches it. */
export function baseClassForDegree(degree: HazardDegree): AssemblyClass | undefined {
  if (degree === 'health') {
    return 'RP';
  }
  if (degree === 'nonhealth') {
    return 'DC';
  }
  return undefined;
}

/** The detector variant of a class, where there is one. */
export function detectorVariant(assemblyClass: AssemblyClass): AssemblyClass {
  if (assemblyClass === 'RP') {
    return 'RPDA';
  }
  if (assemblyClass === 'DC') {
    return 'DCDA';
  }
  return assemblyClass;
}

/**
 * Containment protection, at the service connection.
 *
 * The order matters and it is not the order a plumber would guess. An air gap
 * finding wins outright. Otherwise the degree picks a mechanical class, and
 * only then does the metering question turn that class into its detector
 * variant. Doing the detector step first would let a fire line requirement
 * suppress an air gap.
 */
export function containmentRequirement(
  assessment: HazardAssessment,
  service: ServiceFacts,
): RequiredProtection {
  const reasons: string[] = [];

  if (assessment.airGapRequired) {
    reasons.push('a finding on this premise is not accepted behind any mechanical assembly');
    return { kind: 'required', assemblyClass: 'AG', reasons };
  }

  const base = baseClassForDegree(assessment.containmentDegree);
  if (base === undefined) {
    reasons.push('nothing at this connection reaches even a pollutional hazard');
    return { kind: 'none', reasons };
  }

  reasons.push(
    assessment.containmentDegree === 'health'
      ? `the containment hazard reads health, set by ${describeDrivers(assessment)}`
      : `the containment hazard reads pollutional, set by ${describeDrivers(assessment)}`,
  );

  if (!service.fireService || service.purveyorMetered) {
    return { kind: 'required', assemblyClass: base, reasons };
  }

  const withDetector = detectorVariant(base);
  reasons.push('the fire line is not metered by the purveyor, so the assembly has to detect');
  return { kind: 'required', assemblyClass: withDetector, reasons };
}

function describeDrivers(assessment: HazardAssessment): string {
  if (assessment.drivers.length === 0) {
    return 'the survey';
  }
  return assessment.drivers.join(', ');
}

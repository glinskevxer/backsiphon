/**
 * Comparing what is on the ground against what the requirement asked for.
 *
 * The comparison is not just equal or not equal. An assembly can be the wrong
 * class, the right class in the wrong place, or absent altogether, and how
 * quickly the customer has to put it right depends on which capability is
 * missing rather than on how far apart the two classes look.
 */

import type { CivilDate } from '../util/dates';
import {
  allowedInScope,
  missingCapabilities,
  satisfies,
  type AssemblyCapabilities,
  type AssemblyClass,
} from './assembly';
import type { RequiredProtection } from './requirement';

export type ProtectionScope = 'containment' | 'isolation';

export interface InstalledAssembly {
  readonly assemblyId: string;
  readonly connectionId: string;
  readonly scope: ProtectionScope;
  readonly assemblyClass: AssemblyClass;
  readonly modelId: string;
  readonly serialNumber: string;
  readonly sizeInches: number;
  readonly installedOn: CivilDate;
  /** Where a fitter would find it, written the way the tester will read it. */
  readonly location: string;
  readonly removedOn?: CivilDate;
}

export type DeficiencyKind =
  | 'none'
  | 'missing'
  | 'wrong_class'
  | 'wrong_scope'
  | 'not_required';

/**
 * How soon the customer has to act. A deficiency that leaves a contaminant
 * one check away from the main is not something to put on next year's list.
 */
export type Urgency = 'immediate' | 'cycle' | 'none';

export interface Deficiency {
  readonly kind: DeficiencyKind;
  readonly urgency: Urgency;
  readonly requiredClass?: AssemblyClass;
  readonly installedClass?: AssemblyClass;
  readonly missing: ReadonlyArray<keyof AssemblyCapabilities>;
  readonly reasons: ReadonlyArray<string>;
}

/** Capabilities whose absence is never allowed to wait for the next cycle. */
const URGENT_CAPABILITIES: ReadonlyArray<keyof AssemblyCapabilities> = [
  'physicalSeparation',
  'stopsHealthHazard',
  'stopsBackpressure',
];

export function isActive(assembly: InstalledAssembly, asOf: CivilDate): boolean {
  if (assembly.installedOn > asOf) {
    return false;
  }
  return assembly.removedOn === undefined || assembly.removedOn > asOf;
}

export function compareToRequirement(
  required: RequiredProtection,
  installed: InstalledAssembly | undefined,
  scope: ProtectionScope,
): Deficiency {
  if (required.kind === 'none') {
    if (installed === undefined) {
      return { kind: 'none', urgency: 'none', missing: [], reasons: ['nothing is required here'] };
    }
    return {
      kind: 'not_required',
      urgency: 'none',
      installedClass: installed.assemblyClass,
      missing: [],
      reasons: [
        `a ${installed.assemblyClass} is fitted where the survey asks for nothing, ` +
          'so it stays on the test list as long as it is there',
      ],
    };
  }

  const requiredClass = required.assemblyClass;

  if (installed === undefined) {
    return {
      kind: 'missing',
      urgency: urgencyFor(requiredClass, undefined),
      requiredClass,
      missing: [],
      reasons: [`a ${requiredClass} is required at the ${scope} point and none is fitted`],
    };
  }

  if (!allowedInScope(installed.assemblyClass, scope)) {
    return {
      kind: 'wrong_scope',
      urgency: 'immediate',
      requiredClass,
      installedClass: installed.assemblyClass,
      missing: [],
      reasons: [`a ${installed.assemblyClass} is not accepted at a ${scope} point at all`],
    };
  }

  if (satisfies(installed.assemblyClass, requiredClass)) {
    return {
      kind: 'none',
      urgency: 'none',
      requiredClass,
      installedClass: installed.assemblyClass,
      missing: [],
      reasons: [`the fitted ${installed.assemblyClass} answers the requirement for a ${requiredClass}`],
    };
  }

  const missing = missingCapabilities(installed.assemblyClass, requiredClass);
  return {
    kind: 'wrong_class',
    urgency: urgencyFor(requiredClass, missing),
    requiredClass,
    installedClass: installed.assemblyClass,
    missing,
    reasons: [
      `the fitted ${installed.assemblyClass} is short of ${missing.join(', ')} ` +
        `against the required ${requiredClass}`,
    ],
  };
}

/**
 * A missing assembly is judged by what was required. A wrong one is judged by
 * what it is short of, which is why an assembly that is only short of a
 * detector can wait and one short of a relief valve cannot.
 */
function urgencyFor(
  requiredClass: AssemblyClass,
  missing: ReadonlyArray<keyof AssemblyCapabilities> | undefined,
): Urgency {
  if (missing === undefined) {
    return requiredClass === 'DC' || requiredClass === 'DCDA' ? 'cycle' : 'immediate';
  }
  return missing.some((capability) => URGENT_CAPABILITIES.includes(capability))
    ? 'immediate'
    : 'cycle';
}

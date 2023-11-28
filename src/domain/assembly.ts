/**
 * Assembly classes and what each one can actually do.
 *
 * The register never compares two assemblies by a single number. A double
 * check is a heavier device than a pressure vacuum breaker and it is still the
 * wrong answer for a health hazard, so "higher protection" is not an ordering
 * on one axis. Each class carries a vector of capabilities and one class
 * satisfies a requirement for another only when it holds every capability the
 * required class holds.
 */

import { err, ok, type Result } from '../util/result';

export type AssemblyClass = 'AG' | 'RP' | 'RPDA' | 'DC' | 'DCDA' | 'PVB' | 'SVB' | 'AVB';

export interface AssemblyCapabilities {
  /** The connection is broken open to atmosphere, not held by a check. */
  readonly physicalSeparation: boolean;
  /** Accepted against a contaminant, not only against a pollutant. */
  readonly stopsHealthHazard: boolean;
  /** Holds when the downstream side is pushing back harder than the main. */
  readonly stopsBackpressure: boolean;
  /** May be left under supply pressure for longer than twelve hours. */
  readonly continuousPressure: boolean;
  /**
   * Will not put water on the floor. Only demanded where a requirement was
   * written for an indoor riser, which is why a double check does not claim
   * it: nobody specifies a double check to keep a floor dry.
   */
  readonly spillResistant: boolean;
  /** Carries a metered bypass so a leak on a fire line shows up on a bill. */
  readonly detector: boolean;
}

export interface AssemblyClassSpec {
  readonly code: AssemblyClass;
  readonly label: string;
  readonly capabilities: AssemblyCapabilities;
  /** False for an air gap and an atmospheric vacuum breaker. */
  readonly fieldTestable: boolean;
  /** Where the class may be installed at all. */
  readonly allowedScopes: ReadonlyArray<'containment' | 'isolation'>;
  readonly note: string;
}

export const ASSEMBLY_CLASSES: readonly AssemblyClassSpec[] = [
  {
    code: 'AG',
    label: 'air gap',
    capabilities: {
      physicalSeparation: true,
      stopsHealthHazard: true,
      stopsBackpressure: true,
      continuousPressure: true,
      spillResistant: true,
      detector: true,
    },
    fieldTestable: false,
    allowedScopes: ['containment', 'isolation'],
    note: 'verified by measuring the separation, never by a gauge',
  },
  {
    code: 'RP',
    label: 'reduced pressure principle assembly',
    capabilities: {
      physicalSeparation: false,
      stopsHealthHazard: true,
      stopsBackpressure: true,
      continuousPressure: true,
      spillResistant: false,
      detector: false,
    },
    fieldTestable: true,
    allowedScopes: ['containment', 'isolation'],
    note: 'the relief valve is what makes it acceptable against a contaminant',
  },
  {
    code: 'RPDA',
    label: 'reduced pressure principle detector assembly',
    capabilities: {
      physicalSeparation: false,
      stopsHealthHazard: true,
      stopsBackpressure: true,
      continuousPressure: true,
      spillResistant: false,
      detector: true,
    },
    fieldTestable: true,
    allowedScopes: ['containment'],
    note: 'an RP with a metered bypass, for a fire line the purveyor cannot meter',
  },
  {
    code: 'DC',
    label: 'double check valve assembly',
    capabilities: {
      physicalSeparation: false,
      stopsHealthHazard: false,
      stopsBackpressure: true,
      continuousPressure: true,
      spillResistant: false,
      detector: false,
    },
    fieldTestable: true,
    allowedScopes: ['containment', 'isolation'],
    note: 'two checks in series, accepted against a pollutant only',
  },
  {
    code: 'DCDA',
    label: 'double check detector assembly',
    capabilities: {
      physicalSeparation: false,
      stopsHealthHazard: false,
      stopsBackpressure: true,
      continuousPressure: true,
      spillResistant: false,
      detector: true,
    },
    fieldTestable: true,
    allowedScopes: ['containment'],
    note: 'the ordinary answer on a fire loop with nothing added to it',
  },
  {
    code: 'PVB',
    label: 'pressure vacuum breaker',
    capabilities: {
      physicalSeparation: false,
      stopsHealthHazard: true,
      stopsBackpressure: false,
      continuousPressure: true,
      spillResistant: false,
      detector: false,
    },
    fieldTestable: true,
    allowedScopes: ['isolation'],
    note: 'good against backsiphonage and nothing else, so it has to sit high',
  },
  {
    code: 'SVB',
    label: 'spill resistant vacuum breaker',
    capabilities: {
      physicalSeparation: false,
      stopsHealthHazard: true,
      stopsBackpressure: false,
      continuousPressure: true,
      spillResistant: true,
      detector: false,
    },
    fieldTestable: true,
    allowedScopes: ['isolation'],
    note: 'a vacuum breaker that will not empty itself over an indoor floor',
  },
  {
    code: 'AVB',
    label: 'atmospheric vacuum breaker',
    capabilities: {
      physicalSeparation: false,
      stopsHealthHazard: true,
      stopsBackpressure: false,
      continuousPressure: false,
      spillResistant: false,
      detector: false,
    },
    fieldTestable: false,
    allowedScopes: ['isolation'],
    note: 'no valve downstream and no standing pressure, which rules out most uses',
  },
];

const BY_CODE = new Map(ASSEMBLY_CLASSES.map((spec) => [spec.code, spec]));

export function assemblyClassByCode(code: string): Result<AssemblyClassSpec, string> {
  const spec = BY_CODE.get(code as AssemblyClass);
  return spec === undefined ? err(`no assembly class with the code ${code}`) : ok(spec);
}

export function specOf(code: AssemblyClass): AssemblyClassSpec {
  const spec = BY_CODE.get(code);
  if (spec === undefined) {
    throw new Error(`the assembly class table is missing ${code}`);
  }
  return spec;
}

export const CAPABILITY_KEYS: ReadonlyArray<keyof AssemblyCapabilities> = [
  'physicalSeparation',
  'stopsHealthHazard',
  'stopsBackpressure',
  'continuousPressure',
  'spillResistant',
  'detector',
];

/**
 * True when `installed` holds every capability `required` holds. This is the
 * whole substitution rule. A class that is heavier in some other respect does
 * not get to stand in for one it cannot replace.
 */
export function satisfies(installed: AssemblyClass, required: AssemblyClass): boolean {
  const held = specOf(installed).capabilities;
  const wanted = specOf(required).capabilities;
  return CAPABILITY_KEYS.every((key) => !wanted[key] || held[key]);
}

/** Every class that could stand in for the required one, in table order. */
export function acceptableSubstitutes(required: AssemblyClass): AssemblyClass[] {
  return ASSEMBLY_CLASSES.filter((spec) => satisfies(spec.code, required)).map((spec) => spec.code);
}

/** The capabilities `installed` is short of, named, for a deficiency notice. */
export function missingCapabilities(
  installed: AssemblyClass,
  required: AssemblyClass,
): Array<keyof AssemblyCapabilities> {
  const held = specOf(installed).capabilities;
  const wanted = specOf(required).capabilities;
  return CAPABILITY_KEYS.filter((key) => wanted[key] && !held[key]);
}

export function isTestable(code: AssemblyClass): boolean {
  return specOf(code).fieldTestable;
}

export function allowedInScope(code: AssemblyClass, scope: 'containment' | 'isolation'): boolean {
  return specOf(code).allowedScopes.includes(scope);
}

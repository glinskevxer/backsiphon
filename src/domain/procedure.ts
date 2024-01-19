/**
 * Field test procedures.
 *
 * Which readings a report has to carry is decided by the class of the assembly
 * on the ground, not by the class the requirement asked for. A tester who
 * finds a double check where the file says reduced pressure runs the double
 * check procedure and files that, and the deficiency is somebody else's job.
 */

import { err, ok, type Result } from '../util/result';
import type { AssemblyClass } from './assembly';

export type StepKind = 'differential' | 'opening' | 'tightness' | 'separation';

export interface ProcedureStep {
  /** The field name on the report form. */
  readonly key: string;
  readonly label: string;
  readonly kind: StepKind;
  /** Minimum acceptable reading, in psid, for a step that carries a number. */
  readonly minimumPsid?: number;
  /**
   * An air gap is measured against the pipe rather than against a constant, so
   * its minimum is worked out from the size instead of written down here.
   */
  readonly minimumFromSize?: 'twice_diameter';
}

/**
 * A rule that reads two steps against each other. The differential across the
 * first check has to sit a margin above the point the relief valve opens, or
 * the assembly will dump every time the supply flutters even though both
 * readings passed on their own.
 */
export interface BufferRule {
  readonly higher: string;
  readonly lower: string;
  readonly marginPsid: number;
  readonly note: string;
}

export interface TestProcedure {
  readonly assemblyClass: AssemblyClass;
  readonly steps: ReadonlyArray<ProcedureStep>;
  readonly bufferRule?: BufferRule;
}

/** The smallest air gap the program accepts however small the pipe is. */
export const MIN_AIR_GAP_INCHES = 1;

const CHECK_MINIMUM_PSID = 1;
const RP_CHECK_MINIMUM_PSID = 5;
const RELIEF_MINIMUM_PSID = 2;
const RELIEF_BUFFER_PSID = 3;
const AIR_INLET_MINIMUM_PSID = 1;

const CHECK_ONE: ProcedureStep = {
  key: 'check1Differential',
  label: 'differential across the first check',
  kind: 'differential',
  minimumPsid: CHECK_MINIMUM_PSID,
};

const CHECK_TWO: ProcedureStep = {
  key: 'check2Differential',
  label: 'differential across the second check',
  kind: 'differential',
  minimumPsid: CHECK_MINIMUM_PSID,
};

const RP_CHECK_ONE: ProcedureStep = {
  key: 'check1Differential',
  label: 'differential across the first check',
  kind: 'differential',
  minimumPsid: RP_CHECK_MINIMUM_PSID,
};

const RELIEF_OPENING: ProcedureStep = {
  key: 'reliefOpening',
  label: 'differential at which the relief valve opens',
  kind: 'opening',
  minimumPsid: RELIEF_MINIMUM_PSID,
};

const AIR_INLET: ProcedureStep = {
  key: 'airInletOpening',
  label: 'differential at which the air inlet opens',
  kind: 'opening',
  minimumPsid: AIR_INLET_MINIMUM_PSID,
};

const VENT_TIGHT: ProcedureStep = {
  key: 'ventTight',
  label: 'vent holds without weeping',
  kind: 'tightness',
};

const BYPASS_TIGHT: ProcedureStep = {
  key: 'bypassTight',
  label: 'bypass meter and its assembly hold',
  kind: 'tightness',
};

const RELIEF_BUFFER: BufferRule = {
  higher: 'check1Differential',
  lower: 'reliefOpening',
  marginPsid: RELIEF_BUFFER_PSID,
  note: 'the first check has to hold a margin above the relief opening point',
};

const PROCEDURES: ReadonlyArray<TestProcedure> = [
  { assemblyClass: 'DC', steps: [CHECK_ONE, CHECK_TWO] },
  { assemblyClass: 'DCDA', steps: [CHECK_ONE, CHECK_TWO, BYPASS_TIGHT] },
  { assemblyClass: 'RP', steps: [RP_CHECK_ONE, RELIEF_OPENING], bufferRule: RELIEF_BUFFER },
  {
    assemblyClass: 'RPDA',
    steps: [RP_CHECK_ONE, RELIEF_OPENING, BYPASS_TIGHT],
    bufferRule: RELIEF_BUFFER,
  },
  { assemblyClass: 'PVB', steps: [AIR_INLET, CHECK_ONE] },
  { assemblyClass: 'SVB', steps: [AIR_INLET, CHECK_ONE, VENT_TIGHT] },
  {
    assemblyClass: 'AG',
    steps: [
      {
        key: 'separationInches',
        label: 'vertical separation from the flood rim',
        kind: 'separation',
        minimumFromSize: 'twice_diameter',
      },
    ],
  },
];

const BY_CLASS = new Map(PROCEDURES.map((procedure) => [procedure.assemblyClass, procedure]));

export function procedureFor(assemblyClass: AssemblyClass): Result<TestProcedure, string> {
  const procedure = BY_CLASS.get(assemblyClass);
  if (procedure === undefined) {
    return err(`there is no field procedure for a ${assemblyClass}`);
  }
  return ok(procedure);
}

export function requiredReadingKeys(assemblyClass: AssemblyClass): string[] {
  const procedure = BY_CLASS.get(assemblyClass);
  return procedure === undefined ? [] : procedure.steps.map((step) => step.key);
}

/**
 * The threshold a step is measured against. Most are constants off the step.
 * An air gap is twice the nominal pipe size, never less than an inch, which is
 * the one place the assembly's own size decides what a passing reading is.
 */
export function minimumFor(step: ProcedureStep, sizeInches: number): number | undefined {
  if (step.minimumFromSize === 'twice_diameter') {
    return Math.max(MIN_AIR_GAP_INCHES, sizeInches * 2);
  }
  return step.minimumPsid;
}

export function stepByKey(
  assemblyClass: AssemblyClass,
  key: string,
): Result<ProcedureStep, string> {
  const procedure = BY_CLASS.get(assemblyClass);
  const step = procedure?.steps.find((candidate) => candidate.key === key);
  if (step === undefined) {
    return err(`a ${assemblyClass} report has no step called ${key}`);
  }
  return ok(step);
}

export function hasProcedure(assemblyClass: AssemblyClass): boolean {
  return BY_CLASS.has(assemblyClass);
}

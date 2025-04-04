/**
 * What the program charges.
 *
 * The annual fee follows the class the connection is required to carry rather
 * than the class fitted, which is the point worth reading twice: a customer
 * who has fitted something heavier than the office asked for does not pay more
 * for it, and a customer sitting on a variance pays the varied band. The
 * office bills the obligation, not the hardware.
 *
 * Money is held in whole cents. Nothing here uses a floating point number for
 * an amount.
 */

import type { AssemblyClass } from './assembly';
import type { NoticeStage } from './delinquency';
import type { HazardDegree } from './hazard';

export interface FeeBand {
  readonly code: string;
  readonly label: string;
  /** Applies to assemblies up to and including this size. */
  readonly maxSizeInches: number;
  readonly annualCents: number;
}

/** The bands the office publishes, smallest first. */
export const FEE_BANDS: readonly FeeBand[] = [
  { code: 'B1', label: 'up to one inch', maxSizeInches: 1, annualCents: 4200 },
  { code: 'B2', label: 'over one up to two inches', maxSizeInches: 2, annualCents: 7800 },
  { code: 'B3', label: 'over two up to four inches', maxSizeInches: 4, annualCents: 14500 },
  { code: 'B4', label: 'over four up to eight inches', maxSizeInches: 8, annualCents: 26000 },
  {
    code: 'B5',
    label: 'over eight inches',
    maxSizeInches: Number.POSITIVE_INFINITY,
    annualCents: 41000,
  },
];

/**
 * What each class costs the office to administer, as a multiplier on the size
 * band. A reduced pressure assembly is inspected harder than a double check
 * and an air gap is looked at rather than tested, so it is the cheapest.
 */
const CLASS_MULTIPLIER: Record<AssemblyClass, number> = {
  AG: 0.5,
  RP: 1.25,
  RPDA: 1.5,
  DC: 1,
  DCDA: 1.25,
  PVB: 0.75,
  SVB: 0.75,
  AVB: 0.5,
};

/** Charged when a tester has to be sent out because nobody else went. */
export const REINSPECTION_CENTS = 9500;

/** Charged once the office has had to open a shutoff file. */
export const SHUTOFF_ADMIN_CENTS = 18500;

export function bandFor(sizeInches: number): FeeBand {
  const band = FEE_BANDS.find((candidate) => sizeInches <= candidate.maxSizeInches);
  if (band === undefined) {
    throw new Error(`no fee band covers ${sizeInches} inches`);
  }
  return band;
}

export function annualFeeCents(assemblyClass: AssemblyClass, sizeInches: number): number {
  const band = bandFor(sizeInches);
  return Math.round(band.annualCents * CLASS_MULTIPLIER[assemblyClass]);
}

export interface PenaltyInput {
  readonly stage: NoticeStage;
  readonly degree: HazardDegree;
  readonly reinspections: number;
}

export interface FeeLine {
  readonly code: string;
  readonly description: string;
  readonly cents: number;
}

/**
 * The penalty ladder runs alongside the notice ladder rather than being part
 * of it. A health hazard carries a surcharge at every rung, because the office
 * is carrying a risk while the letters go out.
 */
export function penaltyLines(input: PenaltyInput): FeeLine[] {
  const lines: FeeLine[] = [];
  if (input.stage === 'second' || input.stage === 'final' || input.stage === 'shutoff') {
    lines.push({
      code: 'LATE1',
      description: 'test not filed after the second notice',
      cents: 4500,
    });
  }
  if (input.stage === 'final' || input.stage === 'shutoff') {
    lines.push({
      code: 'LATE2',
      description: 'test not filed after the final notice',
      cents: 9000,
    });
  }
  if (input.stage === 'shutoff') {
    lines.push({
      code: 'SHUTOFF',
      description: 'shutoff file opened',
      cents: SHUTOFF_ADMIN_CENTS,
    });
  }
  if (input.reinspections > 0) {
    lines.push({
      code: 'REINSP',
      description: `${input.reinspections} reinspection visit${input.reinspections === 1 ? '' : 's'}`,
      cents: REINSPECTION_CENTS * input.reinspections,
    });
  }
  if (input.degree === 'health' && lines.length > 0) {
    const surcharge = Math.round(sumLines(lines) * 0.25);
    lines.push({
      code: 'HEALTH',
      description: 'health hazard surcharge, a quarter of the penalties',
      cents: surcharge,
    });
  }
  return lines;
}

export interface InvoiceInput {
  /** The class the connection is required to carry, after any variance. */
  readonly requiredClass?: AssemblyClass;
  readonly sizeInches: number;
  readonly penalties: PenaltyInput;
}

export interface Invoice {
  readonly lines: ReadonlyArray<FeeLine>;
  readonly totalCents: number;
}

export function buildInvoice(input: InvoiceInput): Invoice {
  const lines: FeeLine[] = [];
  if (input.requiredClass !== undefined) {
    const band = bandFor(input.sizeInches);
    lines.push({
      code: `ANNUAL-${band.code}`,
      description: `annual program fee, ${input.requiredClass} ${band.label}`,
      cents: annualFeeCents(input.requiredClass, input.sizeInches),
    });
  }
  lines.push(...penaltyLines(input.penalties));
  return { lines, totalCents: sumLines(lines) };
}

function sumLines(lines: ReadonlyArray<FeeLine>): number {
  return lines.reduce((total, line) => total + line.cents, 0);
}

/** Cents as an amount a person reads, with no currency symbol on it. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

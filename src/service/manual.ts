/**
 * The office handbook, printed from the tables the program actually reads.
 *
 * The office used to keep a typed handbook, and it was wrong within a year:
 * somebody added a finding to the program and nobody retyped the page. This
 * prints the same tables the rules read, so the handbook cannot drift from the
 * code that decides.
 */

import { ASSEMBLY_CLASSES, acceptableSubstitutes } from '../domain/assembly';
import { HAZARD_FINDINGS } from '../domain/hazard';
import { PREMISE_USES } from '../domain/premise';
import { FEE_BANDS, annualFeeCents, formatCents } from '../domain/fees';
import { minimumFor, procedureFor } from '../domain/procedure';
import { HEALTH_LADDER, STANDARD_LADDER } from '../domain/delinquency';

export interface ManualSection {
  readonly title: string;
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
  readonly headers: ReadonlyArray<string>;
}

export function hazardSection(): ManualSection {
  return {
    title: 'hazard findings',
    headers: ['code', 'what it is', 'degree', 'scopes', 'how it travels', 'air gap only'],
    rows: HAZARD_FINDINGS.map((finding) => [
      finding.code,
      finding.label,
      finding.degree,
      finding.scopes.join(' '),
      finding.modes.join(' '),
      finding.airGapOnly ? 'yes' : 'no',
    ]),
  };
}

export function premiseSection(): ManualSection {
  return {
    title: 'premise uses',
    headers: ['code', 'what it is', 'carries', 'survey every', 'walked'],
    rows: PREMISE_USES.map((use) => [
      use.code,
      use.label,
      use.categoricalDegree,
      `${use.surveyIntervalMonths} months`,
      use.surveyRefused ? 'never' : 'yes',
    ]),
  };
}

export function assemblySection(): ManualSection {
  return {
    title: 'assembly classes',
    headers: [
      'code',
      'what it is',
      'health',
      'backpressure',
      'detector',
      'field tested',
      'stands in for',
    ],
    rows: ASSEMBLY_CLASSES.map((spec) => [
      spec.code,
      spec.label,
      spec.capabilities.stopsHealthHazard ? 'yes' : 'no',
      spec.capabilities.stopsBackpressure ? 'yes' : 'no',
      spec.capabilities.detector ? 'yes' : 'no',
      spec.fieldTestable ? 'yes' : 'no',
      acceptableSubstitutes(spec.code).join(' '),
    ]),
  };
}

export function procedureSection(): ManualSection {
  const rows: string[][] = [];
  for (const spec of ASSEMBLY_CLASSES) {
    const procedure = procedureFor(spec.code);
    if (!procedure.ok) {
      rows.push([spec.code, 'no field procedure', '', '']);
      continue;
    }
    for (const step of procedure.value.steps) {
      const minimum = minimumFor(step, 2);
      rows.push([
        spec.code,
        step.key,
        step.label,
        minimum === undefined ? 'holds or does not' : `at least ${minimum}`,
      ]);
    }
    if (procedure.value.bufferRule !== undefined) {
      rows.push([
        spec.code,
        `${procedure.value.bufferRule.higher} over ${procedure.value.bufferRule.lower}`,
        procedure.value.bufferRule.note,
        `at least ${procedure.value.bufferRule.marginPsid}`,
      ]);
    }
  }
  return {
    title: 'field procedures',
    headers: ['class', 'reading', 'what it is', 'passes at'],
    rows,
  };
}

export function ladderSection(): ManualSection {
  const rows: string[][] = [];
  for (const ladder of [STANDARD_LADDER, HEALTH_LADDER]) {
    for (const rung of ladder.rungs) {
      rows.push([ladder.name, rung.stage, `${rung.afterDays} days past due`]);
    }
  }
  return { title: 'notice ladders', headers: ['ladder', 'notice', 'when'], rows };
}

export function feeSection(): ManualSection {
  const rows: string[][] = [];
  for (const band of FEE_BANDS) {
    const size = band.maxSizeInches === Number.POSITIVE_INFINITY ? 10 : band.maxSizeInches;
    rows.push([
      band.code,
      band.label,
      formatCents(annualFeeCents('DC', size)),
      formatCents(annualFeeCents('RP', size)),
      formatCents(annualFeeCents('AG', size)),
    ]);
  }
  return {
    title: 'annual fees',
    headers: ['band', 'size', 'double check', 'reduced pressure', 'air gap'],
    rows,
  };
}

export function manualSections(): ManualSection[] {
  return [
    hazardSection(),
    premiseSection(),
    assemblySection(),
    procedureSection(),
    ladderSection(),
    feeSection(),
  ];
}

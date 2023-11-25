/**
 * Reading a survey into an assessment.
 *
 * The surveyor writes down a premise use and a list of findings. This turns
 * that into the two degrees the rest of the program measures against: one for
 * the service connection, one for the plumbing inside. Nothing here mentions
 * an assembly. What has to be installed is a separate question and it reads
 * this answer.
 */

import { addMonths, isCivilDate, type CivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import {
  findingByCode,
  hasBackpressure,
  worstDegree,
  type HazardDegree,
  type HazardFinding,
} from './hazard';
import { premiseUseByCode, type PremiseUse } from './premise';

export interface SurveyRecord {
  readonly connectionId: string;
  readonly premiseUseCode: string;
  readonly surveyedOn: CivilDate;
  readonly surveyor: string;
  readonly findingCodes: ReadonlyArray<string>;
  /** False where the surveyor was turned away or could not reach the plant. */
  readonly accessGranted: boolean;
  readonly note?: string;
}

/** Why a degree came out the way it did. */
export type AssessmentBasis = 'survey' | 'category' | 'refused';

export interface HazardAssessment {
  readonly connectionId: string;
  readonly surveyedOn: CivilDate;
  readonly use: PremiseUse;
  readonly findings: ReadonlyArray<HazardFinding>;
  /** The worse of the two scopes, quoted on notices. */
  readonly degree: HazardDegree;
  readonly containmentDegree: HazardDegree;
  readonly isolationDegree: HazardDegree;
  readonly airGapRequired: boolean;
  readonly backpressure: boolean;
  readonly basis: AssessmentBasis;
  /** What set the containment degree, either a finding code or `use:CODE`. */
  readonly drivers: ReadonlyArray<string>;
  readonly nextSurveyDue: CivilDate;
}

/**
 * A survey the purveyor was kept out of is treated as the worst case for the
 * main. There is no equivalent for the inside of the premise, because the
 * purveyor is not protecting that.
 */
const REFUSED_CONTAINMENT_DEGREE: HazardDegree = 'health';

/** A health hazard is re-surveyed yearly whatever the use category says. */
const HEALTH_SURVEY_INTERVAL_MONTHS = 12;

export function assess(record: SurveyRecord): Result<HazardAssessment, string> {
  if (!isCivilDate(record.surveyedOn)) {
    return err(`survey date "${record.surveyedOn}" is not a date of the form YYYY-MM-DD`);
  }
  if (record.surveyor.trim() === '') {
    return err('a survey has to name the surveyor who walked it');
  }
  const use = premiseUseByCode(record.premiseUseCode);
  if (!use.ok) {
    return err(use.error);
  }
  const findings: HazardFinding[] = [];
  const seen = new Set<string>();
  for (const code of record.findingCodes) {
    if (seen.has(code)) {
      return err(`the finding ${code} is listed twice on the same survey`);
    }
    seen.add(code);
    const finding = findingByCode(code);
    if (!finding.ok) {
      return err(finding.error);
    }
    findings.push(finding.value);
  }

  const refused = !record.accessGranted || use.value.surveyRefused;
  const containmentFindings = findings.filter((finding) => finding.scopes.includes('containment'));
  const isolationFindings = findings.filter((finding) => finding.scopes.includes('isolation'));

  const surveyedContainment = worstDegree([
    use.value.categoricalDegree,
    ...containmentFindings.map((finding) => finding.degree),
  ]);
  const containmentDegree = refused
    ? worstDegree([surveyedContainment, REFUSED_CONTAINMENT_DEGREE])
    : surveyedContainment;
  const isolationDegree = worstDegree(isolationFindings.map((finding) => finding.degree));
  const degree = worstDegree([containmentDegree, isolationDegree]);

  return ok({
    connectionId: record.connectionId,
    surveyedOn: record.surveyedOn,
    use: use.value,
    findings,
    degree,
    containmentDegree,
    isolationDegree,
    airGapRequired: containmentFindings.some((finding) => finding.airGapOnly),
    backpressure: hasBackpressure(findings),
    basis: basisOf(refused, containmentFindings, use.value, containmentDegree),
    drivers: driversOf(refused, containmentFindings, use.value, containmentDegree),
    nextSurveyDue: nextSurveyDue(record.surveyedOn, use.value, degree),
  });
}

function basisOf(
  refused: boolean,
  containmentFindings: ReadonlyArray<HazardFinding>,
  use: PremiseUse,
  containmentDegree: HazardDegree,
): AssessmentBasis {
  if (refused) {
    return 'refused';
  }
  const fromFindings = containmentFindings.some((finding) => finding.degree === containmentDegree);
  if (fromFindings) {
    return 'survey';
  }
  return use.categoricalDegree === containmentDegree && containmentDegree !== 'none'
    ? 'category'
    : 'survey';
}

function driversOf(
  refused: boolean,
  containmentFindings: ReadonlyArray<HazardFinding>,
  use: PremiseUse,
  containmentDegree: HazardDegree,
): string[] {
  const drivers: string[] = [];
  if (use.categoricalDegree === containmentDegree && containmentDegree !== 'none') {
    drivers.push(`use:${use.code}`);
  }
  for (const finding of containmentFindings) {
    if (finding.degree === containmentDegree) {
      drivers.push(finding.code);
    }
  }
  if (refused && drivers.length === 0) {
    drivers.push('access:refused');
  }
  return drivers;
}

/**
 * The survey interval is the use category's, tightened to a year whenever the
 * assessment came out at a health hazard. The degree the survey produced
 * decides how soon the next survey is, which is the only place the answer
 * feeds back into the question.
 */
export function nextSurveyDue(
  surveyedOn: CivilDate,
  use: PremiseUse,
  degree: HazardDegree,
): CivilDate {
  const months =
    degree === 'health'
      ? Math.min(use.surveyIntervalMonths, HEALTH_SURVEY_INTERVAL_MONTHS)
      : use.surveyIntervalMonths;
  return addMonths(surveyedOn, months);
}

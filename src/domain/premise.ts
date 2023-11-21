/**
 * Premise use categories.
 *
 * Some premises are a health hazard because of what they are, not because of
 * what the surveyor found on the day. A mortuary is a mortuary whether or not
 * anybody got into the back room during the survey. Those categories carry a
 * degree of their own, and the survey can only make it worse, never better.
 */

import { err, ok, type Result } from '../util/result';
import type { HazardDegree } from './hazard';

export interface PremiseUse {
  readonly code: string;
  readonly label: string;
  /**
   * The degree this use carries on its own, before any finding is read. A use
   * of `none` means the survey decides everything.
   */
  readonly categoricalDegree: HazardDegree;
  /** Months between routine re-surveys for this use. */
  readonly surveyIntervalMonths: number;
  /**
   * True where the purveyor will not accept a survey of the inside of the
   * premise at all and protects the main without asking what is in there.
   */
  readonly surveyRefused: boolean;
  readonly note: string;
}

export const PREMISE_USES: readonly PremiseUse[] = [
  {
    code: 'RES_SINGLE',
    label: 'single family home',
    categoricalDegree: 'none',
    surveyIntervalMonths: 120,
    surveyRefused: false,
    note: 'surveyed on a complaint or a permit, otherwise left alone',
  },
  {
    code: 'RES_MULTI',
    label: 'apartment or condominium block',
    categoricalDegree: 'none',
    surveyIntervalMonths: 60,
    surveyRefused: false,
    note: 'the boiler and the booster pump are the usual findings',
  },
  {
    code: 'OFFICE',
    label: 'office building',
    categoricalDegree: 'none',
    surveyIntervalMonths: 60,
    surveyRefused: false,
    note: 'ordinary until somebody puts a cooling tower on the roof',
  },
  {
    code: 'RETAIL',
    label: 'shop or restaurant',
    categoricalDegree: 'none',
    surveyIntervalMonths: 36,
    surveyRefused: false,
    note: 'carbonators and mop sinks',
  },
  {
    code: 'SCHOOL',
    label: 'school or college',
    categoricalDegree: 'nonhealth',
    surveyIntervalMonths: 36,
    surveyRefused: false,
    note: 'science benches raise it, an elementary school on its own does not',
  },
  {
    code: 'HOSPITAL',
    label: 'hospital or clinic',
    categoricalDegree: 'health',
    surveyIntervalMonths: 12,
    surveyRefused: false,
    note: 'aspirators, dialysis, and a lab, every one of them a health hazard',
  },
  {
    code: 'MORTUARY',
    label: 'mortuary or funeral home',
    categoricalDegree: 'health',
    surveyIntervalMonths: 12,
    surveyRefused: false,
    note: 'categorical, the survey adds nothing to it',
  },
  {
    code: 'LAB',
    label: 'laboratory',
    categoricalDegree: 'health',
    surveyIntervalMonths: 12,
    surveyRefused: false,
    note: 'research or commercial, reagents on a bench either way',
  },
  {
    code: 'PLATING',
    label: 'metal finishing shop',
    categoricalDegree: 'health',
    surveyIntervalMonths: 12,
    surveyRefused: false,
    note: 'plating, anodising and pickling all land here',
  },
  {
    code: 'FOOD_PROC',
    label: 'food or beverage processing plant',
    categoricalDegree: 'health',
    surveyIntervalMonths: 12,
    surveyRefused: false,
    note: 'the clean in place cycle is what carries the degree',
  },
  {
    code: 'CAR_WASH',
    label: 'vehicle wash',
    categoricalDegree: 'health',
    surveyIntervalMonths: 24,
    surveyRefused: false,
    note: 'reclaim on the slab and a pump behind it',
  },
  {
    code: 'AGRI',
    label: 'farm or nursery',
    categoricalDegree: 'health',
    surveyIntervalMonths: 24,
    surveyRefused: false,
    note: 'fertigation is assumed until the survey shows otherwise',
  },
  {
    code: 'WWTP',
    label: 'wastewater treatment works',
    categoricalDegree: 'health',
    surveyIntervalMonths: 12,
    surveyRefused: true,
    note: 'the purveyor does not survey inside one of these',
  },
  {
    code: 'INDUSTRIAL',
    label: 'general industrial premise',
    categoricalDegree: 'nonhealth',
    surveyIntervalMonths: 24,
    surveyRefused: false,
    note: 'a floor to work up from, most of these turn out worse',
  },
  {
    code: 'WAREHOUSE',
    label: 'warehouse or distribution shed',
    categoricalDegree: 'none',
    surveyIntervalMonths: 60,
    surveyRefused: false,
    note: 'the fire loop is usually the only connection worth reading',
  },
  {
    code: 'MARINA',
    label: 'marina or dock',
    categoricalDegree: 'health',
    surveyIntervalMonths: 12,
    surveyRefused: true,
    note: 'a vessel is not a premise the purveyor can survey',
  },
  {
    code: 'MUNICIPAL',
    label: 'municipal yard or depot',
    categoricalDegree: 'nonhealth',
    surveyIntervalMonths: 36,
    surveyRefused: false,
    note: 'jetting trucks and a fuel island move it up quickly',
  },
];

const BY_CODE = new Map(PREMISE_USES.map((use) => [use.code, use]));

export function premiseUseByCode(code: string): Result<PremiseUse, string> {
  const use = BY_CODE.get(code);
  return use === undefined ? err(`no premise use with the code ${code}`) : ok(use);
}

export function usesWithCategoricalDegree(degree: HazardDegree): PremiseUse[] {
  return PREMISE_USES.filter((use) => use.categoricalDegree === degree);
}

/** Uses the purveyor will not enter, which forces containment on its own. */
export function surveyRefusedUses(): PremiseUse[] {
  return PREMISE_USES.filter((use) => use.surveyRefused);
}

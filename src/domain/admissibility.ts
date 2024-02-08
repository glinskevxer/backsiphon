/**
 * Whether the program office can look at the readings at all.
 *
 * This runs before any threshold is read, and it is the rule people get wrong
 * most often. A report the office cannot accept is not a failed test. The
 * assembly is in exactly the state it was in before the tester turned up: it
 * has not been tested this cycle, the due date does not move, and the notice
 * ladder carries on climbing.
 */

import { daysBetween, type CivilDate } from '../util/dates';
import {
  accuracyAccepted,
  certificationStatus,
  endorsedFor,
  gaugeStatus,
  type Gauge,
  type TesterCertification,
} from './tester';
import type { TestReport } from './report';

export type InadmissibilityCode =
  | 'tester_unknown'
  | 'tester_not_certified'
  | 'tester_suspended'
  | 'tester_not_endorsed'
  | 'gauge_unknown'
  | 'gauge_not_registered_to_tester'
  | 'gauge_out_of_calibration'
  | 'gauge_retired'
  | 'gauge_band_too_wide'
  | 'filed_too_late';

export interface AdmissibilityReason {
  readonly code: InadmissibilityCode;
  readonly detail: string;
}

export interface AdmissibilityRuling {
  readonly admissible: boolean;
  readonly reasons: ReadonlyArray<AdmissibilityReason>;
}

export interface AdmissibilityInput {
  readonly report: TestReport;
  readonly tester?: TesterCertification;
  readonly gauge?: Gauge;
  /** Days after the test the office will still take the paperwork. */
  readonly filingWindowDays: number;
}

/** The window the program office publishes on the back of the form. */
export const DEFAULT_FILING_WINDOW_DAYS = 30;

export function ruleOnAdmissibility(input: AdmissibilityInput): AdmissibilityRuling {
  const reasons: AdmissibilityReason[] = [
    ...testerReasons(input),
    ...gaugeReasons(input),
    ...filingReasons(input),
  ];
  return { admissible: reasons.length === 0, reasons };
}

function testerReasons(input: AdmissibilityInput): AdmissibilityReason[] {
  const { report, tester } = input;
  if (tester === undefined) {
    return [
      {
        code: 'tester_unknown',
        detail: `no certificate on file for the tester ${report.testerId}`,
      },
    ];
  }
  const status = certificationStatus(tester, report.testedOn);
  if (status === 'suspended') {
    return [
      {
        code: 'tester_suspended',
        detail: `${tester.name} was suspended on ${tester.suspendedOn ?? 'an earlier date'}`,
      },
    ];
  }
  if (status !== 'valid') {
    return [
      {
        code: 'tester_not_certified',
        detail:
          `the certificate of ${tester.name} reads ${status} on ${report.testedOn}, ` +
          `it runs ${tester.issuedOn} to ${tester.expiresOn}`,
      },
    ];
  }
  if (!endorsedFor(tester, report.assemblyClassTested)) {
    return [
      {
        code: 'tester_not_endorsed',
        detail:
          `${tester.name} is not endorsed for a ${report.assemblyClassTested}, ` +
          `only for ${tester.endorsements.join(', ')}`,
      },
    ];
  }
  return [];
}

function gaugeReasons(input: AdmissibilityInput): AdmissibilityReason[] {
  const { report, gauge } = input;
  if (gauge === undefined) {
    return [{ code: 'gauge_unknown', detail: `no gauge on file with the id ${report.gaugeId}` }];
  }
  const reasons: AdmissibilityReason[] = [];
  if (gauge.testerId !== report.testerId) {
    reasons.push({
      code: 'gauge_not_registered_to_tester',
      detail: `gauge ${gauge.serialNumber} is registered to ${gauge.testerId}, not to ${report.testerId}`,
    });
  }
  const status = gaugeStatus(gauge, report.testedOn);
  if (status === 'retired') {
    reasons.push({
      code: 'gauge_retired',
      detail: `gauge ${gauge.serialNumber} was retired on ${gauge.retiredOn ?? 'an earlier date'}`,
    });
  } else if (status === 'out_of_calibration') {
    reasons.push({
      code: 'gauge_out_of_calibration',
      detail: `gauge ${gauge.serialNumber} was last calibrated on ${gauge.calibratedOn}`,
    });
  }
  if (!accuracyAccepted(gauge)) {
    reasons.push({
      code: 'gauge_band_too_wide',
      detail: `gauge ${gauge.serialNumber} is certified to ${gauge.accuracyPsid} psid`,
    });
  }
  return reasons;
}

function filingReasons(input: AdmissibilityInput): AdmissibilityReason[] {
  const late = daysBetween(input.report.testedOn, input.report.filedOn);
  if (late <= input.filingWindowDays) {
    return [];
  }
  return [
    {
      code: 'filed_too_late',
      detail:
        `filed ${late} days after the test, past the ${input.filingWindowDays} day window`,
    },
  ];
}

export function reasonCodes(ruling: AdmissibilityRuling): InadmissibilityCode[] {
  return ruling.reasons.map((reason) => reason.code);
}

/**
 * The line the office puts on the customer's letter. It says what happened to
 * the paperwork, and it says the test still has not been done, which is the
 * part people ring up about.
 */
export function explainRuling(ruling: AdmissibilityRuling, testedOn: CivilDate): string {
  if (ruling.admissible) {
    return `the test of ${testedOn} was accepted`;
  }
  const details = ruling.reasons.map((reason) => reason.detail).join('; ');
  return `the test of ${testedOn} cannot be accepted (${details}), so the assembly is still untested`;
}

/**
 * Testers and the gauges they carry.
 *
 * The program does not accept a reading because it is a number on a form. It
 * accepts it because a certified tester took it with a gauge that was in
 * calibration on the day. Both of those are facts about a date, so both of
 * them are answered as of a date rather than as of now.
 */

import { addMonths, daysBetween, type CivilDate } from '../util/dates';
import type { AssemblyClass } from './assembly';

export interface TesterCertification {
  readonly testerId: string;
  readonly name: string;
  /** Who issued the certificate. The purveyor accepts more than one body. */
  readonly agency: string;
  readonly certificateNumber: string;
  readonly issuedOn: CivilDate;
  readonly expiresOn: CivilDate;
  /** The classes this certificate covers. Not every certificate covers all. */
  readonly endorsements: ReadonlyArray<AssemblyClass>;
  readonly suspendedOn?: CivilDate;
  readonly suspendedReason?: string;
}

export type CertificationStatus = 'valid' | 'not_yet' | 'expired' | 'suspended';

export interface Gauge {
  readonly gaugeId: string;
  /** The tester the gauge is registered to. Gauges are not shared. */
  readonly testerId: string;
  readonly maker: string;
  readonly serialNumber: string;
  readonly calibratedOn: CivilDate;
  readonly calibrationIntervalMonths: number;
  /** The band either side of a reading the laboratory certified it to. */
  readonly accuracyPsid: number;
  readonly retiredOn?: CivilDate;
}

export type GaugeStatus = 'in_calibration' | 'out_of_calibration' | 'retired';

/** The standard interval, used when a calibration certificate does not say. */
export const DEFAULT_CALIBRATION_MONTHS = 12;

/** The widest band the program will accept on a gauge at all. */
export const MAX_ACCEPTED_ACCURACY_PSID = 0.5;

export function certificationStatus(
  tester: TesterCertification,
  asOf: CivilDate,
): CertificationStatus {
  if (tester.suspendedOn !== undefined && tester.suspendedOn <= asOf) {
    return 'suspended';
  }
  if (asOf < tester.issuedOn) {
    return 'not_yet';
  }
  return asOf > tester.expiresOn ? 'expired' : 'valid';
}

/**
 * A certificate is good through the whole of its last day. Testers work to the
 * last hour of it and the program office has always honoured that.
 */
export function isCertified(tester: TesterCertification, asOf: CivilDate): boolean {
  return certificationStatus(tester, asOf) === 'valid';
}

export function endorsedFor(tester: TesterCertification, assemblyClass: AssemblyClass): boolean {
  return tester.endorsements.includes(assemblyClass);
}

export function calibrationDueOn(gauge: Gauge): CivilDate {
  const months =
    gauge.calibrationIntervalMonths > 0
      ? gauge.calibrationIntervalMonths
      : DEFAULT_CALIBRATION_MONTHS;
  return addMonths(gauge.calibratedOn, months);
}

export function gaugeStatus(gauge: Gauge, asOf: CivilDate): GaugeStatus {
  if (gauge.retiredOn !== undefined && gauge.retiredOn <= asOf) {
    return 'retired';
  }
  if (asOf < gauge.calibratedOn) {
    return 'out_of_calibration';
  }
  return asOf <= calibrationDueOn(gauge) ? 'in_calibration' : 'out_of_calibration';
}

export function isInCalibration(gauge: Gauge, asOf: CivilDate): boolean {
  return gaugeStatus(gauge, asOf) === 'in_calibration';
}

/** A gauge the laboratory could only certify to a wide band is not accepted. */
export function accuracyAccepted(gauge: Gauge): boolean {
  return gauge.accuracyPsid > 0 && gauge.accuracyPsid <= MAX_ACCEPTED_ACCURACY_PSID;
}

/** Certificates that lapse within the given number of days of a date. */
export function certificatesLapsingBy(
  testers: ReadonlyArray<TesterCertification>,
  asOf: CivilDate,
  withinDays: number,
): TesterCertification[] {
  return testers
    .filter((tester) => certificationStatus(tester, asOf) === 'valid')
    .filter((tester) => daysBetween(asOf, tester.expiresOn) <= withinDays)
    .sort((left, right) => left.expiresOn.localeCompare(right.expiresOn));
}

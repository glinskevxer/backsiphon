/**
 * Certified testers and their gauges.
 *
 * A gauge belongs to exactly one tester. That is not a modelling convenience,
 * it is the rule: the calibration certificate names a person, and a report
 * filed on somebody else's gauge is not admissible.
 */

import type { CivilDate } from '../../util/dates';
import { err, ok, type Result } from '../../util/result';
import type { AssemblyClass } from '../../domain/assembly';
import type { Gauge, TesterCertification } from '../../domain/tester';
import { execute, selectAll, selectOne, type Database } from '../db';
import { describeConstraintError, fromList, toList, toNullable } from '../rows';

interface TesterRow {
  tester_id: string;
  name: string;
  agency: string;
  certificate_number: string;
  issued_on: string;
  expires_on: string;
  endorsements: string;
  suspended_on: string | null;
  suspended_reason: string | null;
}

interface GaugeRow {
  gauge_id: string;
  tester_id: string;
  maker: string;
  serial_number: string;
  calibrated_on: string;
  calibration_interval_months: number;
  accuracy_psid: number;
  retired_on: string | null;
}

const TESTER_COLUMNS = `tester_id, name, agency, certificate_number, issued_on, expires_on,
  endorsements, suspended_on, suspended_reason`;
const GAUGE_COLUMNS = `gauge_id, tester_id, maker, serial_number, calibrated_on,
  calibration_interval_months, accuracy_psid, retired_on`;

function toTester(row: TesterRow): TesterCertification {
  return {
    testerId: row.tester_id,
    name: row.name,
    agency: row.agency,
    certificateNumber: row.certificate_number,
    issuedOn: row.issued_on,
    expiresOn: row.expires_on,
    endorsements: fromList(row.endorsements) as AssemblyClass[],
    ...(row.suspended_on === null ? {} : { suspendedOn: row.suspended_on }),
    ...(row.suspended_reason === null ? {} : { suspendedReason: row.suspended_reason }),
  };
}

function toGauge(row: GaugeRow): Gauge {
  return {
    gaugeId: row.gauge_id,
    testerId: row.tester_id,
    maker: row.maker,
    serialNumber: row.serial_number,
    calibratedOn: row.calibrated_on,
    calibrationIntervalMonths: row.calibration_interval_months,
    accuracyPsid: row.accuracy_psid,
    ...(row.retired_on === null ? {} : { retiredOn: row.retired_on }),
  };
}

export function insertTester(
  db: Database,
  tester: TesterCertification,
): Result<TesterCertification, string> {
  try {
    execute(db, `insert into testers (${TESTER_COLUMNS}) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      tester.testerId,
      tester.name,
      tester.agency,
      tester.certificateNumber,
      tester.issuedOn,
      tester.expiresOn,
      toList(tester.endorsements),
      toNullable(tester.suspendedOn),
      toNullable(tester.suspendedReason),
    ]);
    return ok(tester);
  } catch (error) {
    return err(describeConstraintError(error, `the tester ${tester.testerId}`));
  }
}

export function findTester(db: Database, testerId: string): TesterCertification | undefined {
  const row = selectOne<TesterRow>(
    db,
    `select ${TESTER_COLUMNS} from testers where tester_id = ?`,
    [testerId],
  );
  return row === undefined ? undefined : toTester(row);
}

export function listTesters(db: Database): TesterCertification[] {
  return selectAll<TesterRow>(db, `select ${TESTER_COLUMNS} from testers order by name`).map(
    toTester,
  );
}

/** Renew a certificate. The old dates are not kept, the event trail is. */
export function renewCertificate(
  db: Database,
  testerId: string,
  issuedOn: CivilDate,
  expiresOn: CivilDate,
  endorsements: ReadonlyArray<AssemblyClass>,
): Result<TesterCertification, string> {
  const tester = findTester(db, testerId);
  if (tester === undefined) {
    return err(`there is no tester with the id ${testerId}`);
  }
  if (expiresOn <= issuedOn) {
    return err(`a certificate cannot expire on ${expiresOn}, it was issued on ${issuedOn}`);
  }
  if (endorsements.length === 0) {
    return err('a certificate with no endorsements on it covers nothing');
  }
  execute(
    db,
    'update testers set issued_on = ?, expires_on = ?, endorsements = ? where tester_id = ?',
    [issuedOn, expiresOn, toList(endorsements), testerId],
  );
  return ok({ ...tester, issuedOn, expiresOn, endorsements: [...endorsements] });
}

export function suspendTester(
  db: Database,
  testerId: string,
  on: CivilDate,
  reason: string,
): Result<TesterCertification, string> {
  const tester = findTester(db, testerId);
  if (tester === undefined) {
    return err(`there is no tester with the id ${testerId}`);
  }
  if (reason.trim() === '') {
    return err('a suspension has to say why');
  }
  execute(db, 'update testers set suspended_on = ?, suspended_reason = ? where tester_id = ?', [
    on,
    reason,
    testerId,
  ]);
  return ok({ ...tester, suspendedOn: on, suspendedReason: reason });
}

export function insertGauge(db: Database, gauge: Gauge): Result<Gauge, string> {
  try {
    execute(db, `insert into gauges (${GAUGE_COLUMNS}) values (?, ?, ?, ?, ?, ?, ?, ?)`, [
      gauge.gaugeId,
      gauge.testerId,
      gauge.maker,
      gauge.serialNumber,
      gauge.calibratedOn,
      gauge.calibrationIntervalMonths,
      gauge.accuracyPsid,
      toNullable(gauge.retiredOn),
    ]);
    return ok(gauge);
  } catch (error) {
    return err(describeConstraintError(error, `the gauge ${gauge.gaugeId}`));
  }
}

export function findGauge(db: Database, gaugeId: string): Gauge | undefined {
  const row = selectOne<GaugeRow>(db, `select ${GAUGE_COLUMNS} from gauges where gauge_id = ?`, [
    gaugeId,
  ]);
  return row === undefined ? undefined : toGauge(row);
}

export function gaugesOf(db: Database, testerId: string): Gauge[] {
  return selectAll<GaugeRow>(
    db,
    `select ${GAUGE_COLUMNS} from gauges where tester_id = ? order by serial_number`,
    [testerId],
  ).map(toGauge);
}

export function recalibrate(
  db: Database,
  gaugeId: string,
  on: CivilDate,
  accuracyPsid: number,
): Result<Gauge, string> {
  const gauge = findGauge(db, gaugeId);
  if (gauge === undefined) {
    return err(`there is no gauge with the id ${gaugeId}`);
  }
  if (gauge.retiredOn !== undefined) {
    return err(`the gauge ${gaugeId} was retired on ${gauge.retiredOn}`);
  }
  if (on < gauge.calibratedOn) {
    return err(`the gauge ${gaugeId} was calibrated on ${gauge.calibratedOn}, later than ${on}`);
  }
  if (accuracyPsid <= 0) {
    return err('a calibration certificate has to carry a band');
  }
  execute(db, 'update gauges set calibrated_on = ?, accuracy_psid = ? where gauge_id = ?', [
    on,
    accuracyPsid,
    gaugeId,
  ]);
  return ok({ ...gauge, calibratedOn: on, accuracyPsid });
}

export function retireGauge(db: Database, gaugeId: string, on: CivilDate): Result<Gauge, string> {
  const gauge = findGauge(db, gaugeId);
  if (gauge === undefined) {
    return err(`there is no gauge with the id ${gaugeId}`);
  }
  if (gauge.retiredOn !== undefined) {
    return err(`the gauge ${gaugeId} was retired on ${gauge.retiredOn} already`);
  }
  execute(db, 'update gauges set retired_on = ? where gauge_id = ?', [on, gaugeId]);
  return ok({ ...gauge, retiredOn: on });
}

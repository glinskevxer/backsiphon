import { describe, expect, it } from 'vitest';

import {
  accuracyAccepted,
  calibrationDueOn,
  certificatesLapsingBy,
  certificationStatus,
  endorsedFor,
  gaugeStatus,
  isCertified,
  isInCalibration,
  type Gauge,
  type TesterCertification,
} from '../../../src/domain/tester';

function tester(overrides: Partial<TesterCertification> = {}): TesterCertification {
  return {
    testerId: 'T-118',
    name: 'p. adeyemi',
    agency: 'state waterworks board',
    certificateNumber: 'BF-4471',
    issuedOn: '2023-05-01',
    expiresOn: '2026-04-30',
    endorsements: ['RP', 'RPDA', 'DC', 'DCDA'],
    ...overrides,
  };
}

function gauge(overrides: Partial<Gauge> = {}): Gauge {
  return {
    gaugeId: 'G-77',
    testerId: 'T-118',
    maker: 'midwest',
    serialNumber: '845-C',
    calibratedOn: '2024-02-15',
    calibrationIntervalMonths: 12,
    accuracyPsid: 0.2,
    ...overrides,
  };
}

describe('certification', () => {
  it('is valid between the two dates inclusive', () => {
    expect(certificationStatus(tester(), '2023-05-01')).toBe('valid');
    expect(certificationStatus(tester(), '2026-04-30')).toBe('valid');
    expect(isCertified(tester(), '2024-08-08')).toBe(true);
  });

  it('is not yet valid before it was issued', () => {
    expect(certificationStatus(tester(), '2023-04-30')).toBe('not_yet');
    expect(isCertified(tester(), '2023-04-30')).toBe(false);
  });

  it('expires the day after the expiry date', () => {
    expect(certificationStatus(tester(), '2026-05-01')).toBe('expired');
  });

  it('reads suspended from the day of the suspension, over everything else', () => {
    const suspended = tester({ suspendedOn: '2024-06-01', suspendedReason: 'falsified reports' });
    expect(certificationStatus(suspended, '2024-05-31')).toBe('valid');
    expect(certificationStatus(suspended, '2024-06-01')).toBe('suspended');
    expect(certificationStatus(suspended, '2027-01-01')).toBe('suspended');
  });

  it('reads endorsements as the classes the certificate covers', () => {
    expect(endorsedFor(tester(), 'RP')).toBe(true);
    expect(endorsedFor(tester(), 'PVB')).toBe(false);
    expect(endorsedFor(tester({ endorsements: ['PVB', 'SVB'] }), 'PVB')).toBe(true);
  });

  it('lists the certificates about to lapse, soonest first', () => {
    const soon = tester({ testerId: 'T-2', expiresOn: '2024-09-15' });
    const sooner = tester({ testerId: 'T-3', expiresOn: '2024-08-20' });
    const later = tester({ testerId: 'T-4', expiresOn: '2025-06-01' });
    const lapsing = certificatesLapsingBy([soon, later, sooner], '2024-08-01', 60);
    expect(lapsing.map((entry) => entry.testerId)).toEqual(['T-3', 'T-2']);
  });

  it('leaves an already expired certificate off the lapsing list', () => {
    const gone = tester({ testerId: 'T-9', expiresOn: '2024-07-01' });
    expect(certificatesLapsingBy([gone], '2024-08-01', 60)).toEqual([]);
  });
});

describe('gauges', () => {
  it('works the calibration out from the interval', () => {
    expect(calibrationDueOn(gauge())).toBe('2025-02-15');
    expect(calibrationDueOn(gauge({ calibrationIntervalMonths: 6 }))).toBe('2024-08-15');
  });

  it('falls back to a year when the certificate gives no interval', () => {
    expect(calibrationDueOn(gauge({ calibrationIntervalMonths: 0 }))).toBe('2025-02-15');
  });

  it('is in calibration through the due date and not after it', () => {
    expect(gaugeStatus(gauge(), '2025-02-15')).toBe('in_calibration');
    expect(gaugeStatus(gauge(), '2025-02-16')).toBe('out_of_calibration');
    expect(isInCalibration(gauge(), '2024-06-01')).toBe(true);
  });

  it('is out of calibration before the calibration was done', () => {
    expect(gaugeStatus(gauge(), '2024-02-14')).toBe('out_of_calibration');
  });

  it('reads retired over everything else', () => {
    const retired = gauge({ retiredOn: '2024-05-01' });
    expect(gaugeStatus(retired, '2024-04-30')).toBe('in_calibration');
    expect(gaugeStatus(retired, '2024-05-01')).toBe('retired');
  });

  it('will not accept a gauge certified to a wide band', () => {
    expect(accuracyAccepted(gauge())).toBe(true);
    expect(accuracyAccepted(gauge({ accuracyPsid: 0.5 }))).toBe(true);
    expect(accuracyAccepted(gauge({ accuracyPsid: 0.6 }))).toBe(false);
    expect(accuracyAccepted(gauge({ accuracyPsid: 0 }))).toBe(false);
  });
});

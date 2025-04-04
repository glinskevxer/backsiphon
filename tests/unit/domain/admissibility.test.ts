import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FILING_WINDOW_DAYS,
  explainRuling,
  reasonCodes,
  ruleOnAdmissibility,
  type AdmissibilityInput,
} from '../../../src/domain/admissibility';
import type { TestReport } from '../../../src/domain/report';
import type { Gauge, TesterCertification } from '../../../src/domain/tester';

const tester: TesterCertification = {
  testerId: 'T-118',
  name: 'p. adeyemi',
  agency: 'state waterworks board',
  certificateNumber: 'BF-4471',
  issuedOn: '2023-05-01',
  expiresOn: '2026-04-30',
  endorsements: ['RP', 'RPDA', 'DC', 'DCDA'],
};

const gauge: Gauge = {
  gaugeId: 'G-77',
  testerId: 'T-118',
  maker: 'midwest',
  serialNumber: '845-C',
  calibratedOn: '2024-02-15',
  calibrationIntervalMonths: 12,
  accuracyPsid: 0.2,
};

const report: TestReport = {
  reportId: 'TR-7001',
  assemblyId: 'BA-9001',
  testerId: 'T-118',
  gaugeId: 'G-77',
  assemblyClassTested: 'DC',
  testedOn: '2024-06-03',
  filedOn: '2024-06-10',
  asFound: { check1Differential: 2.4, check2Differential: 1.8 },
  repairMade: false,
};

function ruling(
  overrides: Partial<AdmissibilityInput> = {},
): ReturnType<typeof ruleOnAdmissibility> {
  return ruleOnAdmissibility({
    report,
    tester,
    gauge,
    filingWindowDays: DEFAULT_FILING_WINDOW_DAYS,
    ...overrides,
  });
}

describe('a report the office can take', () => {
  it('is admissible with a certified tester and a calibrated gauge', () => {
    const result = ruling();
    expect(result.admissible).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(explainRuling(result, report.testedOn)).toBe('the test of 2024-06-03 was accepted');
  });
});

describe('the tester', () => {
  it('is refused when there is no certificate on file', () => {
    expect(reasonCodes(ruling({ tester: undefined }))).toEqual(['tester_unknown']);
  });

  it('is refused when the certificate had expired on the day of the test', () => {
    const expired = { ...tester, expiresOn: '2024-06-02' };
    expect(reasonCodes(ruling({ tester: expired }))).toEqual(['tester_not_certified']);
  });

  it('is accepted on the last day of the certificate', () => {
    const lastDay = { ...tester, expiresOn: '2024-06-03' };
    expect(ruling({ tester: lastDay }).admissible).toBe(true);
  });

  it('reads a suspension over an otherwise valid certificate', () => {
    const suspended = {
      ...tester,
      suspendedOn: '2024-01-01',
      suspendedReason: 'falsified reports',
    };
    expect(reasonCodes(ruling({ tester: suspended }))).toEqual(['tester_suspended']);
  });

  it('is refused for a class the certificate does not cover', () => {
    const narrow = { ...tester, endorsements: ['PVB' as const, 'SVB' as const] };
    const result = ruling({ tester: narrow });
    expect(reasonCodes(result)).toEqual(['tester_not_endorsed']);
    expect(result.reasons[0]?.detail).toContain('PVB, SVB');
  });

  it('stops at the first thing wrong with the tester', () => {
    const bad = { ...tester, expiresOn: '2024-01-01', endorsements: [] };
    expect(reasonCodes(ruling({ tester: bad }))).toEqual(['tester_not_certified']);
  });
});

describe('the gauge', () => {
  it('is refused when there is no gauge on file', () => {
    expect(reasonCodes(ruling({ gauge: undefined }))).toEqual(['gauge_unknown']);
  });

  it('is refused when the calibration had run out', () => {
    const stale = { ...gauge, calibratedOn: '2023-01-01' };
    expect(reasonCodes(ruling({ gauge: stale }))).toEqual(['gauge_out_of_calibration']);
  });

  it('is accepted on the last day of the calibration interval', () => {
    const edge = { ...gauge, calibratedOn: '2023-06-03' };
    expect(ruling({ gauge: edge }).admissible).toBe(true);
  });

  it('is refused when the gauge belongs to another tester', () => {
    const borrowed = { ...gauge, testerId: 'T-200' };
    expect(reasonCodes(ruling({ gauge: borrowed }))).toEqual(['gauge_not_registered_to_tester']);
  });

  it('is refused when the gauge was retired before the test', () => {
    const retired = { ...gauge, retiredOn: '2024-05-01' };
    expect(reasonCodes(ruling({ gauge: retired }))).toEqual(['gauge_retired']);
  });

  it('is refused when the certified band is too wide to judge a reading', () => {
    const wide = { ...gauge, accuracyPsid: 1.2 };
    expect(reasonCodes(ruling({ gauge: wide }))).toEqual(['gauge_band_too_wide']);
  });

  it('reports every gauge problem at once', () => {
    const bad = { ...gauge, testerId: 'T-9', calibratedOn: '2020-01-01', accuracyPsid: 2 };
    expect(reasonCodes(ruling({ gauge: bad }))).toEqual([
      'gauge_not_registered_to_tester',
      'gauge_out_of_calibration',
      'gauge_band_too_wide',
    ]);
  });
});

describe('the filing window', () => {
  it('takes a report filed inside the window', () => {
    expect(ruling({ report: { ...report, filedOn: '2024-07-03' } }).admissible).toBe(true);
  });

  it('refuses one filed a day past it', () => {
    const late = ruling({ report: { ...report, filedOn: '2024-07-04' } });
    expect(reasonCodes(late)).toEqual(['filed_too_late']);
    expect(late.reasons[0]?.detail).toContain('31 days');
  });

  it('takes a shorter window from the caller', () => {
    const result = ruling({
      report: { ...report, filedOn: '2024-06-10' },
      filingWindowDays: 5,
    });
    expect(reasonCodes(result)).toEqual(['filed_too_late']);
  });
});

describe('what the customer is told', () => {
  it('says the assembly is still untested', () => {
    const line = explainRuling(ruling({ tester: undefined }), report.testedOn);
    expect(line).toContain('still untested');
    expect(line).toContain('T-118');
  });

  it('runs the tester, the gauge and the window together', () => {
    const result = ruling({
      tester: { ...tester, endorsements: [] },
      gauge: { ...gauge, calibratedOn: '2019-01-01' },
      report: { ...report, filedOn: '2024-09-01' },
    });
    expect(reasonCodes(result)).toEqual([
      'tester_not_endorsed',
      'gauge_out_of_calibration',
      'filed_too_late',
    ]);
  });
});

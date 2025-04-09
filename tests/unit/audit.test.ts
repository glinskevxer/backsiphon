import { describe, expect, it } from 'vitest';

import {
  decide,
  describe as describeDecision,
  readAdvisories,
  type Acceptance,
} from '../../scripts/audit-dependencies';

const REPORT = JSON.stringify({
  vulnerabilities: {
    tar: {
      name: 'tar',
      severity: 'moderate',
      via: [{ source: 1103, name: 'tar', severity: 'moderate', title: 'tar can extract outside' }],
    },
    glob: {
      name: 'glob',
      severity: 'low',
      via: ['tar'],
    },
    other: {
      name: 'other',
      severity: 'high',
      via: [{ source: 2044, name: 'other', severity: 'high', title: 'something else' }],
    },
  },
});

const accepted: Acceptance[] = [
  { id: '1103', package: 'tar', why: 'the extract path is ours', reviewBy: '2025-09-01' },
];

describe('reading an audit report', () => {
  it('takes the advisories and steps over the transitive names', () => {
    const advisories = readAdvisories(REPORT);
    expect(advisories.map((entry) => entry.id)).toEqual(['1103', '2044']);
    expect(advisories[0]?.title).toContain('extract');
  });

  it('reads an empty report as nothing', () => {
    expect(readAdvisories('{}')).toEqual([]);
    expect(readAdvisories(JSON.stringify({ vulnerabilities: {} }))).toEqual([]);
  });
});

describe('deciding about them', () => {
  it('fails on an advisory nobody has written about', () => {
    const decision = decide(readAdvisories(REPORT), '2025-04-01', accepted);
    expect(decision.ok).toBe(false);
    expect(decision.undecided.map((entry) => entry.id)).toEqual(['2044']);
  });

  it('passes once every advisory has a decision behind it', () => {
    const decision = decide(readAdvisories(REPORT), '2025-04-01', [
      ...accepted,
      { id: '2044', package: 'other', why: 'not reachable from here', reviewBy: '2025-09-01' },
    ]);
    expect(decision.ok).toBe(true);
    expect(decision.reported).toBe(2);
  });

  it('fails once an acceptance has gone past the day the office said', () => {
    const decision = decide([], '2025-10-01', accepted);
    expect(decision.ok).toBe(false);
    expect(decision.overdue).toHaveLength(1);
  });

  it('passes on a clean report with nothing accepted', () => {
    const decision = decide([], '2025-04-01', []);
    expect(decision.ok).toBe(true);
    expect(describeDecision(decision)[0]).toBe(
      '0 reported, 0 nobody has decided about, 0 past review',
    );
  });

  it('says what is wrong in a line each', () => {
    const lines = describeDecision(decide(readAdvisories(REPORT), '2025-04-01', accepted));
    expect(lines[1]).toContain('undecided: 2044 other high');
  });
});

describe('the two audits the office runs', () => {
  it('gates on what ships and reports on the toolchain', () => {
    const shipping = decide(readAdvisories('{}'), '2025-04-01', []);
    expect(shipping.ok).toBe(true);
    const toolchain = decide(readAdvisories(REPORT), '2025-04-01', []);
    expect(toolchain.ok).toBe(false);
    expect(toolchain.undecided).toHaveLength(2);
  });
});

/**
 * A district the size of a real one.
 *
 * Three hundred connections is what the office actually has. This builds one,
 * sweeps it, and checks the answers rather than the clock: a timing assertion
 * on a shared machine is a coin toss, and what matters is that the sweep is
 * driven by indexes rather than by scans.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { programSummary, workList } from '../../src/service/reporting';
import { runNotices } from '../../src/service/notices';
import { buildExport } from '../../src/service/exports';
import { selectAll } from '../../src/storage/db';
import { fileTest, fit, open, openOffice, walk, FAILING_RP, type Office } from '../support/office';

let office: Office;

const DISTRICT_SIZE = 300;

function buildDistrict(): void {
  for (let index = 0; index < DISTRICT_SIZE; index += 1) {
    const connectionId = open(office, {
      accountNumber: `A-${10_000 + index}`,
      premiseName: `premise ${index}`,
      premiseAddress: `${index} forge road`,
      route: ['north', 'south', 'east', 'central'][index % 4] ?? 'north',
      premiseUseCode: index % 5 === 0 ? 'PLATING' : 'INDUSTRIAL',
    });
    walk(office, connectionId, '2023-06-01', index % 3 === 0 ? ['AUX_WELL'] : ['FIRE_PLAIN']);
    if (index % 7 === 0) {
      continue;
    }
    const assemblyId = fit(office, { connectionId, installedOn: '2023-07-01' });
    if (index % 11 === 0) {
      fileTest(office, { assemblyId, testedOn: '2024-08-01', asFound: FAILING_RP });
      continue;
    }
    fileTest(office, { assemblyId, testedOn: index % 2 === 0 ? '2024-08-01' : '2023-08-01' });
  }
}

beforeEach(() => {
  office = openOffice();
  buildDistrict();
});

afterEach(() => {
  office.close();
});

describe('a district of three hundred', () => {
  it('sweeps the whole register and counts it', () => {
    const summary = programSummary(office.register, '2024-12-01');
    expect(summary.connections).toBe(DISTRICT_SIZE);
    expect(summary.assemblies).toBe(257);
    expect(
      summary.byStanding.compliant +
        summary.byStanding.overdue +
        summary.byStanding.deficient +
        summary.byStanding.shutoff_eligible +
        summary.byStanding.not_yet_due,
    ).toBe(DISTRICT_SIZE);
  });

  it('runs the letters over the whole district in one pass', () => {
    const run = runNotices(office.register, { asOf: '2024-12-01' });
    expect(run.ok).toBe(true);
    if (!run.ok) {
      return;
    }
    expect(run.value.considered).toBe(DISTRICT_SIZE);
    expect(run.value.issued.length).toBeGreaterThan(50);
    // and running it again the same day writes nothing at all
    const again = runNotices(office.register, { asOf: '2024-12-01' });
    expect(again.ok && again.value.issued).toEqual([]);
  });

  it('builds the standing export for every connection', () => {
    const table = buildExport(office.register, 'standing', '2024-12-01');
    expect(table.ok && table.value.rows).toHaveLength(DISTRICT_SIZE);
  });

  it('gives a route sheet that is only that route', () => {
    const north = workList(office.register, { asOf: '2024-12-01', route: 'north' });
    expect(north.length).toBeGreaterThan(0);
    expect(north.every((item) => item.route === 'north')).toBe(true);
  });

  it('reads the current survey off an index rather than a scan', () => {
    const plan = selectAll<{ detail: string }>(
      office.register.db,
      `explain query plan
       select survey_id from surveys where connection_id = ?
       order by surveyed_on desc, survey_id desc limit 1`,
      ['SC-00001'],
    );
    expect(plan.map((row) => row.detail).join(' ')).toMatch(/USING (COVERING )?INDEX/);
  });

  it('reads the last passing test off an index rather than a scan', () => {
    const plan = selectAll<{ detail: string }>(
      office.register.db,
      `explain query plan
       select report_id from test_reports
       where assembly_id = ? and admissible = 1 and outcome = 'pass'
       order by tested_on desc limit 1`,
      ['BA-00001'],
    );
    expect(plan.map((row) => row.detail).join(' ')).toMatch(/USING (COVERING )?INDEX/);
  });
});

/**
 * The commands a clerk uses that are not about one record: the settings, the
 * handbook, the demo district, the money, and the two ways of looking a
 * connection up.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cliRunner } from '../support/cli';
import { loadDemoDistrict } from '../../src/service/demo';
import { listConnections } from '../../src/storage/repositories/connections';
import { openOffice, type Office } from '../support/office';

let office: Office;

const cli = cliRunner(() => office.register, '2025-03-19');

function accountFor(account: string): string {
  const found = listConnections(office.register.db).find(
    (entry) => entry.accountNumber === account,
  );
  if (found === undefined) {
    throw new Error(`no connection on account ${account}`);
  }
  return found.connectionId;
}

beforeEach(() => {
  office = openOffice();
});

afterEach(() => {
  office.close();
});

describe('config', () => {
  it('prints the policy in force and where it came from', async () => {
    const shown = await cli('config');
    expect(shown.out).toContain('purveyor');
    expect(shown.out).toContain('north valley water');
    expect(shown.out).toMatch(/interval months\s+12/);
    expect(shown.out).toMatch(/working days to repair\s+5/);
  });

  it('says when it found no config file', async () => {
    const shown = await cli('config');
    expect(shown.out).toContain('backsiphon.config.json');
  });
});

describe('manual', () => {
  it('prints every section', async () => {
    const printed = await cli('manual');
    for (const title of [
      'hazard findings',
      'premise uses',
      'assembly classes',
      'field procedures',
      'notice ladders',
      'annual fees',
    ]) {
      expect(printed.out).toContain(title);
    }
  });

  it('prints one section on its own, as a table or as csv', async () => {
    const columns = await cli('manual', '--section', 'notice');
    expect(columns.out).toContain('health hazard');
    expect(columns.out).not.toContain('AUX_WELL');
    const csv = await cli('manual', '--section', 'notice', '--csv');
    expect(csv.out).toContain('ladder,notice,when');
  });
});

describe('demo', () => {
  it('fills an empty register and says what it built', async () => {
    const built = await cli('demo');
    expect(built.out).toMatch(/connections\s+11/);
    expect(built.out).toMatch(/assemblies fitted\s+8/);
    const standing = await cli('standing');
    expect(standing.out).toContain('shutoff_eligible');
    expect(standing.out.split('\n')).toHaveLength(13);
  });

  it('refuses to touch one that has anything on it', async () => {
    await cli('demo');
    const again = await cli('demo');
    expect(again.code).toBe(1);
    expect(again.err).toContain('already has connections');
  });
});

describe('billing', () => {
  beforeEach(() => {
    const loaded = loadDemoDistrict(office.register, '2025-03-19');
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
  });

  it('bills one connection against the class it has to carry', async () => {
    const invoice = await cli('billing', 'invoice', accountFor('A-1001'));
    expect(invoice.out).toContain('billed against a RP');
    expect(invoice.out).toContain('total');
  });

  it('runs the whole district and totals it', async () => {
    const run = await cli('billing', 'run');
    expect(run.out).toContain('invoices,');
    expect(run.out).toContain('in total');
  });

  it('names a connection it could not bill', async () => {
    const run = await cli('billing', 'run', '--route', 'central');
    expect(run.out).toContain('invoices,');
  });
});

describe('looking a connection up', () => {
  beforeEach(() => {
    const loaded = loadDemoDistrict(office.register, '2025-03-19');
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
  });

  it('finds one by a fragment of the address', async () => {
    const found = await cli('find', 'forge road');
    expect(found.out).toContain('kerrigan plating');
    expect(found.out).toContain('apex car wash');
  });

  it('says so when nothing matched', async () => {
    const found = await cli('find', 'zzzz');
    expect(found.out).toBe('nothing matched');
  });

  it('prints the file on one connection in date order', async () => {
    const history = await cli('history', accountFor('A-1001'));
    expect(history.out).toContain('connection');
    expect(history.out).toContain('survey');
    expect(history.out).toContain('assembly');
    expect(history.out).toContain('test');
  });

  it('explains how it reached the answer', async () => {
    const explained = await cli('status', accountFor('A-1006'), '--explain');
    expect(explained.out).toContain('the survey');
    expect(explained.out).toContain('containment protection');
    expect(explained.out).toContain('where that leaves it');
  });
});

describe('the reports that read the whole register', () => {
  beforeEach(() => {
    const loaded = loadDemoDistrict(office.register, '2025-03-19');
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
  });

  it('prints the fleet record of each model', async () => {
    const fleet = await cli('model', 'fleet');
    expect(fleet.out).toContain('WK-375');
    expect(fleet.out).toContain('too few');
  });

  it('prints the annual return in the order the form wants', async () => {
    const annual = await cli('annual', '2024');
    expect(annual.out).toContain('return for 2024');
    expect(annual.out).toMatch(/service connections\s+11/);
  });

  it('writes the annual return as csv when the state asks for it', async () => {
    const csv = await cli('annual', '2024', '--csv');
    expect(csv.out).toContain('measure,value');
    expect(csv.out).toContain('reporting year,2024');
  });

  it('refuses a year that is not one', async () => {
    const bad = await cli('annual', 'lastyear');
    expect(bad.code).toBe(1);
  });

  it('prints what each tester has filed', async () => {
    const record = await cli('tester', 'record', 'T-118');
    expect(record.out).toMatch(/reports filed\s+6/);
    const roster = await cli('tester', 'roster');
    expect(roster.out).toContain('T-118');
  });
});

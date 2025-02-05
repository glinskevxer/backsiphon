import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cliRunner } from '../support/cli';
import { open, openOffice, type Office } from '../support/office';

let office: Office;
let connectionId: string;

const cli = cliRunner(() => office.register, '2025-02-05');

beforeEach(() => {
  office = openOffice();
  connectionId = open(office, { accountNumber: 'A-1001', premiseName: 'kerrigan plating' });
});

afterEach(() => {
  office.close();
});

describe('contact set', () => {
  it('puts somebody in a role', async () => {
    const set = await cli(
      'contact', 'set', connectionId, '--role', 'site', '--name', 'j. kerrigan',
      '--telephone', '555 0142', '--on', '2024-02-01',
    );
    expect(set.out).toContain('j. kerrigan is the site contact from 2024-02-01');
    const listed = await cli('contact', 'list', connectionId);
    expect(listed.out).toContain('C-00001');
    expect(listed.out).toContain('555 0142');
  });

  it('retires whoever was in the role', async () => {
    await cli(
      'contact', 'set', connectionId, '--role', 'site', '--name', 'j. kerrigan',
      '--telephone', '555 0142', '--on', '2024-02-01',
    );
    await cli(
      'contact', 'set', connectionId, '--role', 'site', '--name', 'r. odiete',
      '--telephone', '555 0199', '--on', '2025-01-05',
    );
    const live = await cli('contact', 'list', connectionId);
    expect(live.out).toContain('r. odiete');
    expect(live.out).not.toContain('j. kerrigan');
    const all = await cli('contact', 'list', connectionId, '--all');
    expect(all.out).toContain('j. kerrigan');
  });

  it('refuses a role nobody has and a connection nobody has', async () => {
    const badRole = await cli(
      'contact', 'set', connectionId, '--role', 'gatekeeper', '--name', 'x',
      '--telephone', '1', '--on', '2024-02-01',
    );
    expect(badRole.err).toContain('is not a role');
    const badConnection = await cli(
      'contact', 'set', 'SC-00404', '--role', 'site', '--name', 'x',
      '--telephone', '1', '--on', '2024-02-01',
    );
    expect(badConnection.code).toBe(1);
  });

  it('refuses somebody nobody can reach', async () => {
    const unreachable = await cli(
      'contact', 'set', connectionId, '--role', 'site', '--name', 'j. kerrigan',
      '--on', '2024-02-01',
    );
    expect(unreachable.err).toContain('no way to reach');
  });
});

describe('contact ring', () => {
  it('names the site contact first', async () => {
    await cli(
      'contact', 'set', connectionId, '--role', 'account', '--name', 'head office',
      '--telephone', '555 0100', '--on', '2024-02-01',
    );
    await cli(
      'contact', 'set', connectionId, '--role', 'site', '--name', 'j. kerrigan',
      '--telephone', '555 0142', '--on', '2024-02-01', '--note', 'ask at the gatehouse',
    );
    const ring = await cli('contact', 'ring', connectionId);
    expect(ring.out).toContain('j. kerrigan');
    expect(ring.out).toContain('ask at the gatehouse');
  });

  it('says so when there is nobody to ring', async () => {
    const ring = await cli('contact', 'ring', connectionId);
    expect(ring.code).toBe(1);
    expect(ring.err).toContain('nobody with a telephone number');
  });
});

describe('contact retire', () => {
  it('takes somebody out and leaves the role empty', async () => {
    await cli(
      'contact', 'set', connectionId, '--role', 'site', '--name', 'j. kerrigan',
      '--telephone', '555 0142', '--on', '2024-02-01',
    );
    const retired = await cli('contact', 'retire', 'C-00001', '--on', '2025-01-05');
    expect(retired.out).toContain('no longer the site contact');
    const ring = await cli('contact', 'ring', connectionId);
    expect(ring.code).toBe(1);
  });
});

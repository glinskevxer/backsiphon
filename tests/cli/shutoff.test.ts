import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cliRunner } from '../support/cli';
import { fileTest, fit, open, openOffice, walk, type Office } from '../support/office';

let office: Office;
let connectionId: string;
let assemblyId: string;

const cli = cliRunner(() => office.register, '2025-01-02');

beforeEach(() => {
  office = openOffice();
  connectionId = open(office, { accountNumber: 'A-9001' });
  walk(office, connectionId, '2023-01-10', ['AUX_WELL']);
  assemblyId = fit(office, { connectionId, installedOn: '2023-02-01' });
  fileTest(office, { assemblyId, testedOn: '2023-02-05' });
});

afterEach(() => {
  office.close();
});

describe('the shutoff commands', () => {
  it('refuses to raise one on a connection that is in order', async () => {
    const early = await cli(
      'shutoff', 'raise', connectionId, '--on', '2023-06-01', '--reason', 'no test',
    );
    expect(early.code).toBe(1);
    expect(early.err).toContain('not eligible');
  });

  it('raises one and says what it is about', async () => {
    const raised = await cli(
      'shutoff', 'raise', connectionId, '--on', '2024-04-01', '--reason', 'no test since 2023',
    );
    expect(raised.out).toContain('SO-0001 raised against');
    expect(raised.out).toContain('was due 2024-02-05');
  });

  it('walks the whole order through and lists it at each step', async () => {
    await cli('shutoff', 'raise', connectionId, '--on', '2024-04-01', '--reason', 'no test');
    const open1 = await cli('shutoff', 'list');
    expect(open1.out).toContain('SO-0001');

    const done = await cli('shutoff', 'execute', 'SO-0001', '--on', '2024-04-08', '--crew', 'crew 3');
    expect(done.out).toContain('carried out on 2024-04-08');

    const early = await cli('shutoff', 'restore', 'SO-0001', '--on', '2024-04-09', '--crew', 'crew 3');
    expect(early.err).toContain('the water stays off');

    fileTest(office, { assemblyId, testedOn: '2024-04-10' });
    const restored = await cli(
      'shutoff', 'restore', 'SO-0001', '--on', '2024-04-11', '--crew', 'crew 3', '--note', 'meter reseated',
    );
    expect(restored.out).toContain('restored on 2024-04-11');

    const open2 = await cli('shutoff', 'list');
    expect(open2.out).not.toContain('SO-0001');
    const history = await cli('shutoff', 'list', '--connection', connectionId);
    expect(history.out).toContain('SO-0001');
  });

  it('calls one off before the crew goes', async () => {
    await cli('shutoff', 'raise', connectionId, '--on', '2024-04-01', '--reason', 'no test');
    const cancelled = await cli(
      'shutoff', 'cancel', 'SO-0001', '--on', '2024-04-05', '--reason', 'the report was in a tray',
    );
    expect(cancelled.out).toContain('called off on 2024-04-05');
    const done = await cli('shutoff', 'execute', 'SO-0001', '--on', '2024-04-08', '--crew', 'crew 3');
    expect(done.code).toBe(1);
  });
});

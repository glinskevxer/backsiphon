/**
 * The entry point. It is four lines and one of them decides the exit code, so
 * it is worth one test rather than none.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { main } from '../../src/cli/main';
import { VERSION } from '../../src/version';

let logged: string[] = [];
let errored: string[] = [];

beforeEach(() => {
  logged = [];
  errored = [];
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    logged.push(String(line));
  });
  vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
    errored.push(String(line));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('main', () => {
  it('prints the handbook against a store it opens itself', async () => {
    const code = await main(['--store', ':memory:', 'manual', '--section', 'notice ladders']);
    expect(code).toBe(0);
    expect(logged.join('\n')).toContain('health hazard');
  });

  it('comes back non zero and says why when the register refuses', async () => {
    const code = await main(['--store', ':memory:', 'connection', 'show', 'SC-00404']);
    expect(code).toBe(1);
    expect(errored.join('\n')).toContain('SC-00404');
  });

  it('comes back non zero on a line commander cannot parse', async () => {
    const code = await main(['--store', ':memory:', 'connection', 'levitate']);
    expect(code).not.toBe(0);
  });

  it('prints the version the manifest carries', async () => {
    const code = await main(['--version']);
    expect(code).toBe(0);
    expect(logged.join('\n').trim()).toBe(VERSION);
  });
});

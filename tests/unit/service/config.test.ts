import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CONFIG_FILENAME, findConfigFile, loadConfig, parseConfig, toLoaded } from '../../../src/service/config';

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'backsiphon-config-'));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('reading the file', () => {
  it('takes a file with nothing in it', () => {
    expect(parseConfig('{}')).toEqual({ ok: true, value: {} });
  });

  it('takes the settings the office writes', () => {
    const parsed = parseConfig(
      JSON.stringify({
        store: 'register.sqlite',
        purveyorName: 'north valley water',
        filingWindowDays: 20,
        cycle: { repairWorkdays: 10, closeWatchUses: ['HOSPITAL'] },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.purveyorName).toBe('north valley water');
    expect(parsed.value.cycle?.repairWorkdays).toBe(10);
  });

  it('refuses something that is not json', () => {
    expect(parseConfig('store = register.sqlite').ok).toBe(false);
  });

  it('refuses a setting nobody has heard of', () => {
    const parsed = parseConfig(JSON.stringify({ colour: 'blue' }));
    expect(parsed.ok).toBe(false);
  });

  it('refuses a window that could not be true', () => {
    expect(parseConfig(JSON.stringify({ filingWindowDays: 0 })).ok).toBe(false);
    expect(parseConfig(JSON.stringify({ filingWindowDays: 4000 })).ok).toBe(false);
    expect(parseConfig(JSON.stringify({ filingWindowDays: 20.5 })).ok).toBe(false);
  });

  it('turns a file into a policy', () => {
    const loaded = toLoaded({ purveyorName: 'north valley water', filingWindowDays: 20 });
    expect(loaded.policy.purveyorName).toBe('north valley water');
    expect(loaded.policy.filingWindowDays).toBe(20);
    expect(loaded.policy.cycle).toBeUndefined();
  });
});

describe('finding the file', () => {
  it('finds one in the directory it starts from', () => {
    const file = join(scratch, CONFIG_FILENAME);
    writeFileSync(file, '{}');
    expect(findConfigFile(scratch)).toBe(file);
  });

  it('walks up to find one', () => {
    const file = join(scratch, CONFIG_FILENAME);
    writeFileSync(file, '{}');
    const deep = join(scratch, 'one', 'two');
    mkdirSync(deep, { recursive: true });
    expect(findConfigFile(deep)).toBe(file);
  });

  it('gives up quietly when there is none', () => {
    const empty = mkdtempSync(join(tmpdir(), 'backsiphon-empty-'));
    const found = findConfigFile(empty);
    rmSync(empty, { recursive: true, force: true });
    expect(found === undefined || found.startsWith('/tmp') || found.startsWith('/var')).toBe(true);
  });
});

describe('loading it', () => {
  it('reads the store path relative to the file rather than to the caller', () => {
    writeFileSync(join(scratch, CONFIG_FILENAME), JSON.stringify({ store: 'data/register.sqlite' }));
    const deep = join(scratch, 'one');
    mkdirSync(deep, { recursive: true });
    const loaded = loadConfig(deep);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(loaded.value.store).toBe(resolve(scratch, 'data/register.sqlite'));
  });

  it('names the file when the settings in it are wrong', () => {
    writeFileSync(join(scratch, CONFIG_FILENAME), JSON.stringify({ filingWindowDays: -1 }));
    const loaded = loadConfig(scratch);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error).toContain(CONFIG_FILENAME);
    }
  });

  it('carries the policy through', () => {
    writeFileSync(
      join(scratch, CONFIG_FILENAME),
      JSON.stringify({ purveyorName: 'north valley water', cycle: { repairWorkdays: 8 } }),
    );
    const loaded = loadConfig(scratch);
    expect(loaded.ok && loaded.value.policy.purveyorName).toBe('north valley water');
    expect(loaded.ok && loaded.value.policy.cycle?.repairWorkdays).toBe(8);
  });
});

describe('the letter wording', () => {
  it('takes a heading, a footer and the sentence that asks for a test', () => {
    const parsed = parseConfig(
      JSON.stringify({
        letter: {
          heading: 'north valley water, cross connection control',
          footer: 'telephone the program office on 555 0100',
          ask: 'please book a test with any certified tester on our list',
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.letter?.footer).toContain('555 0100');
    expect(toLoaded(parsed.value).policy.letter?.ask).toContain('book a test');
  });

  it('refuses wording nobody could print', () => {
    expect(parseConfig(JSON.stringify({ letter: { heading: '' } })).ok).toBe(false);
    expect(parseConfig(JSON.stringify({ letter: { signature: 'x' } })).ok).toBe(false);
  });
});

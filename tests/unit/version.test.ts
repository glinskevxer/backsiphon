import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { manifestVersion, versionModuleIsCurrent } from '../../scripts/build-version';
import { VERSION } from '../../src/version';

describe('the version', () => {
  it('is the one the manifest carries', () => {
    expect(VERSION).toBe(manifestVersion());
    expect(versionModuleIsCurrent()).toBe(true);
  });

  it('is a release version rather than a pre release one', () => {
    expect(VERSION).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
  });

  it('is generated rather than typed', () => {
    const source = readFileSync(resolve(__dirname, '..', '..', 'src', 'version.ts'), 'utf8');
    expect(source).toContain('Do not edit');
  });
});

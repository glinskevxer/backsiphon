import { describe, expect, it } from 'vitest';

import {
  handbookCheck,
  migrationIdCheck,
  migrationOrderCheck,
  runChecks,
  smokeCheck,
  versionCheck,
} from '../../scripts/release-check';

describe('the release checks', () => {
  it('reads a release version off the manifest', () => {
    const check = versionCheck();
    expect(check.ok).toBe(true);
    expect(check.detail).toMatch(/version \d+\.\d+\.\d+/);
  });

  it('finds the migrations in the order they run', () => {
    expect(migrationOrderCheck().ok).toBe(true);
    expect(migrationIdCheck().ok).toBe(true);
  });

  it('opens a store, fills it and reads it back', () => {
    const check = smokeCheck();
    expect(check.ok).toBe(true);
    expect(check.detail).toContain('connections read back');
  });

  it('checks the handbook against the tables', () => {
    expect(handbookCheck().ok).toBe(true);
  });

  it('runs every check and names each one', () => {
    const checks = runChecks();
    expect(checks.map((check) => check.name)).toEqual([
      'version',
      'migration order',
      'migration ids',
      'handbook',
      'smoke',
    ]);
    expect(checks.every((check) => check.ok)).toBe(true);
  });
});

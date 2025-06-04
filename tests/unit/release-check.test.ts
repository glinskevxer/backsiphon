import { describe, expect, it } from 'vitest';

import {
  commandReferenceCheck,
  handbookCheck,
  migrationIdCheck,
  migrationOrderCheck,
  runChecks,
  smokeCheck,
  versionCheck,
  versionModuleCheck,
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

  it('checks the handbook and the command reference against the program', () => {
    expect(handbookCheck().ok).toBe(true);
    expect(commandReferenceCheck().ok).toBe(true);
  });

  it('checks that the command line reports the version in the manifest', () => {
    const check = versionModuleCheck();
    expect(check.ok).toBe(true);
    expect(check.detail).toContain('reports 1.');
  });

  it('runs every check and names each one', () => {
    const checks = runChecks();
    expect(checks.map((check) => check.name)).toEqual([
      'version',
      'the version the command line reports',
      'migration order',
      'migration ids',
      'handbook',
      'command reference',
      'smoke',
    ]);
    expect(checks.every((check) => check.ok)).toBe(true);
  });
});

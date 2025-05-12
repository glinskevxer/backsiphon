import { describe, expect, it } from 'vitest';

import {
  commandEntries,
  referenceIsCurrent,
  renderReference,
} from '../../scripts/build-command-reference';

describe('the command reference', () => {
  it('walks every command and subcommand', () => {
    const paths = commandEntries().map((entry) => entry.path);
    for (const path of [
      'connection open',
      'survey record',
      'assembly install',
      'test file',
      'notice run',
      'variance grant',
      'shutoff raise',
      'contact set',
      'status',
      'summary',
      'annual',
      'manual',
    ]) {
      expect(paths).toContain(path);
    }
  });

  it('gives every command a description a clerk could read', () => {
    for (const entry of commandEntries()) {
      expect(entry.description.length).toBeGreaterThan(10);
      expect(entry.description).toBe(entry.description.trimEnd());
    }
  });

  it('carries the options of each command', () => {
    const open = commandEntries().find((entry) => entry.path === 'connection open');
    expect(open?.options.map((option) => option.flags)).toContain('--account <number>');
    for (const option of open?.options ?? []) {
      expect(option.description.length).toBeGreaterThan(3);
    }
  });

  it('matches the file that is checked in', () => {
    expect(referenceIsCurrent()).toBe(true);
    expect(renderReference()).toContain('# the commands');
  });
});

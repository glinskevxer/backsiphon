/**
 * The shell scripts are not run here, they are read.
 *
 * Two of them have gone wrong in a way a reader would have caught: a step that
 * did not stop the run when it failed, and a script that ran the tests but not
 * the checks ci runs, which meant a green local run and a red build.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..', '..');

function script(name: string): string {
  return readFileSync(resolve(root, 'scripts', name), 'utf8');
}

function workflow(): string {
  return readFileSync(resolve(root, '.github', 'workflows', 'ci.yml'), 'utf8');
}

const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('the local check', () => {
  it('runs every step ci runs', () => {
    const text = script('check.sh');
    for (const step of [
      'prettier --check',
      'npm run lint',
      'npm run typecheck',
      'npm test',
      'npm run handbook:check',
      'npm run commands:check',
      'npm run release-check',
    ]) {
      expect(text).toContain(step);
    }
  });

  it('comes back non zero when a step failed', () => {
    const text = script('check.sh');
    expect(text).toContain('exit 1');
    expect(text).toContain('failed: %s');
  });

  it('names every failing step rather than stopping at the first', () => {
    expect(script('check.sh')).toContain('failed+=("$name")');
  });
});

describe('the export check', () => {
  it('stops at the first failure', () => {
    expect(script('export-check.sh')).toContain('set -euo pipefail');
  });

  it('reads the tree git would ship rather than the working one', () => {
    const text = script('export-check.sh');
    expect(text).toContain('git -C "$here" archive HEAD');
    expect(text).toContain('npm ci');
  });

  it('checks that a refusal comes back non zero', () => {
    expect(script('export-check.sh')).toContain('a refusal came back zero');
  });
});

describe('the workflow', () => {
  it('runs the jobs the office cares about', () => {
    const text = workflow();
    for (const job of ['lint:', 'test:', 'coverage:', 'handbook:', 'export:', 'audit:']) {
      expect(text).toContain(job);
    }
  });

  it('tests on more than one node', () => {
    expect(workflow()).toContain("node: ['20.18.1', '22.13.1']");
  });

  it('gives every job a timeout and cancels a superseded run', () => {
    expect(workflow()).toContain('timeout-minutes: 15');
    expect(workflow()).toContain('cancel-in-progress: true');
  });

  it('runs a script that is in the manifest', () => {
    for (const name of [
      'lint',
      'typecheck',
      'test',
      'coverage',
      'handbook:check',
      'export-check',
    ]) {
      expect(manifest.scripts[name]).toBeDefined();
    }
  });
});

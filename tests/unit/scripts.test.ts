/**
 * The shell scripts are not run here, they are read.
 *
 * Two of them have gone wrong in a way a reader would have caught: a step that
 * did not stop the run when it failed, and a script that ran the tests but not
 * the checks ci runs, which meant a green local run and a red build.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { generatedFilesMarkedCheck, GENERATED_FILES } from '../../scripts/release-check';

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

describe('the attributes', () => {
  function attributes(): string {
    return readFileSync(resolve(root, '.gitattributes'), 'utf8');
  }

  it('marks every file a script writes as generated', () => {
    for (const file of GENERATED_FILES) {
      expect(attributes()).toContain(`${file} linguist-generated=true`);
    }
  });

  it('marks nothing that a person actually wrote', () => {
    const marked = attributes()
      .split('\n')
      .filter((line) => line.includes('linguist-generated'))
      .map((line) => line.split(' ')[0]);
    expect([...marked].sort()).toEqual([...GENERATED_FILES].sort());
  });

  it('decides the line endings here rather than on whoever cloned it', () => {
    expect(attributes()).toContain('text=auto eol=lf');
  });

  it('leaves the typescript to count as typescript', () => {
    expect(attributes()).not.toContain('linguist-language');
    expect(attributes()).not.toContain('linguist-vendored');
  });

  it('is checked by the release check', () => {
    expect(generatedFilesMarkedCheck().ok).toBe(true);
  });

  it('has left no carriage returns in anything tracked', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((file) => file !== '' && !file.endsWith('.sqlite'));
    const withCarriageReturns = tracked.filter((file) =>
      readFileSync(resolve(root, file), 'utf8').includes('\r'),
    );
    expect(withCarriageReturns).toEqual([]);
    expect(tracked.length).toBeGreaterThan(200);
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

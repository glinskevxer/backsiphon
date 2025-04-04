/**
 * What ships, checked cheaply.
 *
 * The real check unpacks a git archive and installs it, which is too slow for
 * every run. These are the parts of it that can be read off the manifest, and
 * they are the parts that have actually gone wrong: a script that points at a
 * file nobody added, and a bin that points into a directory that is not
 * published.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..', '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  bin: Record<string, string>;
  main: string;
  files: string[];
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  engines: { node: string };
};

describe('the manifest', () => {
  it('publishes the build and nothing else', () => {
    expect(manifest.files).toEqual(['dist', 'README.md']);
    expect(manifest.main.startsWith('dist/')).toBe(true);
    for (const target of Object.values(manifest.bin)) {
      expect(target.startsWith('dist/')).toBe(true);
    }
  });

  it('pins every dependency exactly', () => {
    for (const version of Object.values({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    })) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('points every script at a file that is there', () => {
    for (const command of Object.values(manifest.scripts)) {
      const match = /(?:tsx|bash|node) (\S+)/.exec(command);
      if (match?.[1] === undefined) {
        continue;
      }
      expect(existsSync(resolve(root, match[1]))).toBe(true);
    }
  });

  it('says which node it needs', () => {
    expect(manifest.engines.node).toMatch(/^>=\d+/);
  });

  it('keeps the tests and the scripts out of the package', () => {
    const ignored = readFileSync(resolve(root, '.npmignore'), 'utf8');
    expect(ignored).toContain('tests/');
    expect(ignored).toContain('scripts/');
  });
});

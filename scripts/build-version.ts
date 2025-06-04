#!/usr/bin/env tsx
/**
 * Write the version the command line reports out of the manifest.
 *
 * `backsiphon --version` used to answer 0.1.0 for a year and a half, because
 * the number was typed into the program and the one in the manifest was the
 * one that got raised. Reading the manifest at run time is not an option: it
 * is not in the published package. So it is generated, and ci refuses a
 * release where the two have drifted apart.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const OUTPUT = resolve(root, 'src', 'version.ts');

export function manifestVersion(): string {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    version: string;
  };
  return manifest.version;
}

export function renderVersionModule(): string {
  return [
    '// Written by scripts/build-version.ts out of package.json. Do not edit.',
    '',
    `export const VERSION = '${manifestVersion()}';`,
    '',
  ].join('\n');
}

export function versionModuleIsCurrent(): boolean {
  if (!existsSync(OUTPUT)) {
    return false;
  }
  return readFileSync(OUTPUT, 'utf8') === renderVersionModule();
}

function main(argv: ReadonlyArray<string>): number {
  if (argv.includes('--check')) {
    if (versionModuleIsCurrent()) {
      console.log(`the command line reports ${manifestVersion()}`);
      return 0;
    }
    console.error('src/version.ts does not match package.json, run npm run version:write');
    return 1;
  }
  writeFileSync(OUTPUT, renderVersionModule());
  console.log(`wrote ${OUTPUT} at ${manifestVersion()}`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

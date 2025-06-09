#!/usr/bin/env tsx
/**
 * The things somebody would otherwise find out about after a release.
 *
 * None of it is clever. It is the list of the mistakes this project has
 * actually made: a version that had not been raised, a migration list that had
 * been reordered, a store that would not open under the built code, and a
 * handbook that had drifted from the tables.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MIGRATIONS } from '../src/service/../storage/schema';
import { openRegister, closeRegister } from '../src/service/register';
import { programSummary } from '../src/service/reporting';
import { loadDemoDistrict } from '../src/service/demo';
import { handbookIsCurrent } from './build-handbook';
import { referenceIsCurrent } from './build-command-reference';
import { manifestVersion, versionModuleIsCurrent } from './build-version';

export interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

const root = resolve(__dirname, '..');

export function versionCheck(): Check {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    version: string;
  };
  const ok = /^\d+\.\d+\.\d+$/.test(manifest.version);
  return {
    name: 'version',
    ok,
    detail: ok ? `version ${manifest.version}` : `${manifest.version} is not a release version`,
  };
}

/**
 * Migrations run in id order, so a list that is not in that order applies them
 * in an order no store has ever seen.
 */
export function migrationOrderCheck(): Check {
  const ids = MIGRATIONS.map((migration) => migration.id);
  const sorted = [...ids].sort();
  const ok = ids.join(',') === sorted.join(',');
  return {
    name: 'migration order',
    ok,
    detail: ok ? `${ids.length} migrations in order` : `out of order: ${ids.join(', ')}`,
  };
}

export function migrationIdCheck(): Check {
  const bad = MIGRATIONS.filter((migration) => !/^\d{3}_[a-z_]+$/.test(migration.id));
  return {
    name: 'migration ids',
    ok: bad.length === 0,
    detail:
      bad.length === 0
        ? 'every id is a number and a name'
        : `badly named: ${bad.map((migration) => migration.id).join(', ')}`,
  };
}

/** Open a store, fill it, and read it back, in one process. */
export function smokeCheck(): Check {
  const opened = openRegister({ file: ':memory:', actor: 'release-check' });
  if (!opened.ok) {
    return { name: 'smoke', ok: false, detail: opened.error };
  }
  try {
    const loaded = loadDemoDistrict(opened.value, '2025-04-09');
    if (!loaded.ok) {
      return { name: 'smoke', ok: false, detail: loaded.error };
    }
    const summary = programSummary(opened.value, '2025-04-09');
    const ok = summary.connections === loaded.value.connections && summary.connections > 0;
    return {
      name: 'smoke',
      ok,
      detail: `${summary.connections} connections read back, ${summary.assemblies} assemblies`,
    };
  } finally {
    closeRegister(opened.value);
  }
}

/**
 * Every file a script writes has to be marked as one.
 *
 * An unmarked generated file counts toward the language statistics and shows
 * up in a review as though somebody wrote it. This is the check that catches a
 * fourth generator being added and the attribute being forgotten.
 */
export const GENERATED_FILES: ReadonlyArray<string> = [
  'docs/handbook.md',
  'docs/commands.md',
  'src/version.ts',
];

export function generatedFilesMarkedCheck(): Check {
  const attributes = readFileSync(resolve(root, '.gitattributes'), 'utf8');
  const unmarked = GENERATED_FILES.filter(
    (file) =>
      !new RegExp(`^${file.replace('.', '\\.')} .*linguist-generated=true`, 'm').test(attributes),
  );
  return {
    name: 'generated files are marked',
    ok: unmarked.length === 0,
    detail:
      unmarked.length === 0
        ? `${GENERATED_FILES.length} marked linguist-generated`
        : `not marked in .gitattributes: ${unmarked.join(', ')}`,
  };
}

export function versionModuleCheck(): Check {
  const ok = versionModuleIsCurrent();
  return {
    name: 'the version the command line reports',
    ok,
    detail: ok ? `reports ${manifestVersion()}` : 'run npm run version:write',
  };
}

export function commandReferenceCheck(): Check {
  const ok = referenceIsCurrent();
  return {
    name: 'command reference',
    ok,
    detail: ok ? 'the reference matches the program' : 'run npm run commands',
  };
}

export function handbookCheck(): Check {
  const ok = handbookIsCurrent();
  return {
    name: 'handbook',
    ok,
    detail: ok ? 'the handbook matches the tables' : 'run npm run handbook',
  };
}

export function runChecks(): Check[] {
  return [
    versionCheck(),
    versionModuleCheck(),
    generatedFilesMarkedCheck(),
    migrationOrderCheck(),
    migrationIdCheck(),
    handbookCheck(),
    commandReferenceCheck(),
    smokeCheck(),
  ];
}

function main(): number {
  const checks = runChecks();
  for (const check of checks) {
    console.log(`${check.ok ? 'ok  ' : 'FAIL'} ${check.name}: ${check.detail}`);
  }
  return checks.every((check) => check.ok) ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main();
}

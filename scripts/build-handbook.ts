#!/usr/bin/env tsx
/**
 * Write the office handbook out of the program's own tables.
 *
 * Run it after any change to a catalogue, and the check below in ci refuses a
 * commit where the file on disk and the tables have drifted apart. That is the
 * whole point of generating it: the handbook the clerks read cannot be wrong
 * about what the program does.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { manualSections, type ManualSection } from '../src/service/manual';

const OUTPUT = resolve(__dirname, '..', 'docs', 'handbook.md');

function renderTable(section: ManualSection): string[] {
  const header = `| ${section.headers.join(' | ')} |`;
  const rule = `| ${section.headers.map(() => '---').join(' | ')} |`;
  const rows = section.rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`);
  return [`## ${section.title}`, '', header, rule, ...rows, ''];
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

export function renderHandbook(): string {
  const lines = [
    '# the cross connection control handbook',
    '',
    'This file is written by `npm run handbook` out of the tables the program',
    'reads. Do not edit it. Change the catalogue in `src/domain` and run the',
    'script again.',
    '',
  ];
  for (const section of manualSections()) {
    lines.push(...renderTable(section));
  }
  return `${lines.join('\n')}\n`;
}

export function handbookIsCurrent(): boolean {
  if (!existsSync(OUTPUT)) {
    return false;
  }
  return readFileSync(OUTPUT, 'utf8') === renderHandbook();
}

function main(argv: ReadonlyArray<string>): number {
  const check = argv.includes('--check');
  if (check) {
    if (handbookIsCurrent()) {
      console.log('the handbook matches the tables');
      return 0;
    }
    console.error('the handbook is out of date, run npm run handbook');
    return 1;
  }
  writeFileSync(OUTPUT, renderHandbook());
  console.log(`wrote ${OUTPUT}`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

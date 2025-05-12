#!/usr/bin/env tsx
/**
 * Write the command reference out of the program itself.
 *
 * Commander already knows every command, every argument and every option. A
 * reference typed by hand goes stale the first time somebody adds a flag, so
 * this walks the program instead and the check below refuses a change that
 * leaves the file behind.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Command } from 'commander';

import { buildProgram } from '../src/cli/program';
import { capturingIo } from '../src/cli/output';

const OUTPUT = resolve(__dirname, '..', 'docs', 'commands.md');

export interface CommandEntry {
  readonly path: string;
  readonly description: string;
  readonly usage: string;
  readonly options: ReadonlyArray<{ flags: string; description: string }>;
}

export function walk(command: Command, prefix: string[] = []): CommandEntry[] {
  const entries: CommandEntry[] = [];
  for (const child of command.commands) {
    const path = [...prefix, child.name()];
    const children = walk(child, path);
    entries.push({
      path: path.join(' '),
      description: child.description(),
      usage: `${path.join(' ')} ${child.usage()}`.trim(),
      options: child.options.map((option) => ({
        flags: option.flags,
        description: option.description,
      })),
    });
    entries.push(...children);
  }
  return entries;
}

export function commandEntries(): CommandEntry[] {
  return walk(buildProgram({ io: capturingIo() }));
}

export function renderReference(): string {
  const lines = [
    '# the commands',
    '',
    'This file is written by `npm run commands` out of the program itself. Do',
    'not edit it. Add the command and run the script again.',
    '',
  ];
  for (const entry of commandEntries()) {
    lines.push(`## ${entry.path}`, '', entry.description, '', '```', entry.usage, '```', '');
    if (entry.options.length > 0) {
      for (const option of entry.options) {
        lines.push(`- \`${option.flags}\` ${option.description}`);
      }
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}

export function referenceIsCurrent(): boolean {
  if (!existsSync(OUTPUT)) {
    return false;
  }
  return readFileSync(OUTPUT, 'utf8') === renderReference();
}

function main(argv: ReadonlyArray<string>): number {
  if (argv.includes('--check')) {
    if (referenceIsCurrent()) {
      console.log('the command reference matches the program');
      return 0;
    }
    console.error('the command reference is out of date, run npm run commands');
    return 1;
  }
  writeFileSync(OUTPUT, renderReference());
  console.log(`wrote ${OUTPUT}`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

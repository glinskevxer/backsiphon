/**
 * The two things every command file needs.
 *
 * These were copied into each command module while the command line was being
 * written, which meant `report` lived in the connections module and everything
 * else imported it from there. That is a silly place for it.
 */

import type { Command } from 'commander';

import type { Result } from '../util/result';
import type { CommandContext, GlobalOptions } from './context';
import { writeJson, type CliIo } from './output';

/** The options from this command and every parent of it. */
export function globals(command: Command): GlobalOptions {
  return command.optsWithGlobals() as GlobalOptions;
}

/**
 * Print a refusal on the error channel and hand a success to the caller. Every
 * action ends in one of these, so a command never has to decide for itself
 * what a failure looks like.
 */
export function report<T>(io: CliIo, outcome: Result<T, string>, onOk: (value: T) => void): void {
  if (!outcome.ok) {
    io.err(outcome.error);
    return;
  }
  onOk(outcome.value);
}

/**
 * Write json where the caller asked for json, and columns otherwise. Every
 * command had this three line branch in it, and two of them had it wrong: they
 * printed the columns and then the json underneath.
 */
export function printOr<T>(
  io: CliIo,
  context: Pick<CommandContext, 'json'>,
  value: T,
  printer: (value: T) => void,
): void {
  if (context.json) {
    writeJson(io, value);
    return;
  }
  printer(value);
}

/** Print a list of lines, which is what most of the printers end up doing. */
export function printLines(io: CliIo, lines: ReadonlyArray<string>): void {
  for (const line of lines) {
    io.out(line);
  }
}

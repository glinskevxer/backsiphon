/**
 * The two things every command file needs.
 *
 * These were copied into each command module while the command line was being
 * written, which meant `report` lived in the connections module and everything
 * else imported it from there. That is a silly place for it.
 */

import type { Command } from 'commander';

import type { Result } from '../util/result';
import type { GlobalOptions } from './context';
import type { CliIo } from './output';

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

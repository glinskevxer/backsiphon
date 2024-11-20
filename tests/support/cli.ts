/**
 * Running the command line against a register held open in memory.
 *
 * Every command test wants the same three things: a runner that hands the
 * commands one store rather than opening a file, a way to call the program
 * with an argument list, and the output back as two strings. All nine of them
 * had their own copy of it.
 */

import { contextFor, type CommandContext, type GlobalOptions } from '../../src/cli/context';
import { capturingIo, type CliIo } from '../../src/cli/output';
import { run, type Runner } from '../../src/cli/program';
import type { Register } from '../../src/service/register';
import type { Result } from '../../src/util/result';

export interface CliRun {
  readonly code: number;
  readonly out: string;
  readonly err: string;
  readonly lines: ReadonlyArray<string>;
}

/** A runner that gives every command the register it is handed. */
export function borrow(register: () => Register, defaultAsOf: string): Runner {
  return <T>(
    options: GlobalOptions,
    io: CliIo,
    work: (context: CommandContext) => Result<T, string>,
  ): Result<T, string> =>
    work(contextFor(register(), io, options.asOf ?? defaultAsOf, options.json === true));
}

export function cliRunner(register: () => Register, defaultAsOf: string) {
  return async (...argv: string[]): Promise<CliRun> => {
    const io = capturingIo();
    const code = await run(argv, { io, runner: borrow(register, defaultAsOf) });
    return { code, out: io.lines.join('\n'), err: io.errors.join('\n'), lines: io.lines };
  };
}

/** The parsed json a command wrote, for the tests that ask for `--json`. */
export async function cliJson<T>(
  register: () => Register,
  defaultAsOf: string,
  ...argv: string[]
): Promise<T> {
  const io = capturingIo();
  await run(['--json', ...argv], { io, runner: borrow(register, defaultAsOf) });
  return JSON.parse(io.lines.join('\n')) as T;
}

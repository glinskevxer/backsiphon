/**
 * The command line.
 *
 * Commander does the parsing and nothing else. Every action reads its
 * arguments, calls one service function, and prints. There is no rule in this
 * layer, which is why the runner can be swapped for one that hands the command
 * a store held open in memory.
 */

import { Command } from 'commander';

import type { Result } from '../util/result';
import { withContext, type CommandContext, type GlobalOptions } from './context';
import { capturingIo, type CliIo } from './output';
import { registerConnectionCommands } from './commands/connections';
import { registerSurveyCommands } from './commands/surveys';
import { registerAssemblyCommands } from './commands/assemblies';
import { registerTesterCommands } from './commands/testers';
import { registerTestCommands } from './commands/tests';
import { registerStatusCommands } from './commands/status';
import { registerNoticeCommands } from './commands/notices';
import { registerVarianceCommands } from './commands/variances';
import { registerBillingCommands } from './commands/billing';
import { registerAuditCommands } from './commands/audit';
import { registerExportCommands } from './commands/exports';
import { registerImportCommands } from './commands/imports';

export type Runner = <T>(
  options: GlobalOptions,
  io: CliIo,
  work: (context: CommandContext) => Result<T, string>,
) => Result<T, string>;

export interface ProgramOptions {
  readonly io: CliIo;
  readonly runner?: Runner;
  readonly version?: string;
}

export const PROGRAM_NAME = 'backsiphon';

export function buildProgram(options: ProgramOptions): Command {
  const io = options.io;
  const runner = options.runner ?? withContext;

  const program = new Command();
  program
    .name(PROGRAM_NAME)
    .description('cross connection control register for a drinking water purveyor')
    .version(options.version ?? '0.1.0')
    .option('-s, --store <file>', 'the register file', 'backsiphon.sqlite')
    .option('--as-of <date>', 'answer as at this day rather than today')
    .option('--actor <name>', 'the clerk the trail is written against', 'cli')
    .option('--purveyor <name>', 'the name that goes at the bottom of a notice')
    .option('--json', 'write json rather than columns')
    .exitOverride()
    .configureOutput({
      writeOut: (text) => io.out(text.trimEnd()),
      writeErr: (text) => io.err(text.trimEnd()),
    });

  registerConnectionCommands(program, io, runner);
  registerSurveyCommands(program, io, runner);
  registerAssemblyCommands(program, io, runner);
  registerTesterCommands(program, io, runner);
  registerTestCommands(program, io, runner);
  registerStatusCommands(program, io, runner);
  registerNoticeCommands(program, io, runner);
  registerVarianceCommands(program, io, runner);
  registerBillingCommands(program, io, runner);
  registerAuditCommands(program, io, runner);
  registerExportCommands(program, io, runner);
  registerImportCommands(program, io, runner);

  return program;
}

/**
 * Run one command line and hand back what it printed and what it exited with.
 * The whole program is one function call, which is what makes the command
 * tests readable.
 */
export async function run(
  argv: ReadonlyArray<string>,
  options: ProgramOptions,
): Promise<number> {
  const program = buildProgram(options);
  try {
    await program.parseAsync([...argv], { from: 'user' });
    return 0;
  } catch (error) {
    if (isCommanderExit(error)) {
      return error.exitCode;
    }
    options.io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

interface CommanderExit {
  readonly code: string;
  readonly exitCode: number;
}

function isCommanderExit(error: unknown): error is CommanderExit {
  return (
    typeof error === 'object' &&
    error !== null &&
    'exitCode' in error &&
    typeof (error as { exitCode: unknown }).exitCode === 'number'
  );
}

/** Run a command line and keep everything it printed, for tests and scripts. */
export async function runCaptured(
  argv: ReadonlyArray<string>,
  runner?: Runner,
): Promise<{ code: number; io: ReturnType<typeof capturingIo> }> {
  const io = capturingIo();
  const code = await run(argv, { io, ...(runner === undefined ? {} : { runner }) });
  return { code, io };
}

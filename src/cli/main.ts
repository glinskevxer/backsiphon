#!/usr/bin/env node
/**
 * The entry point. It does two things: build the io that writes to the
 * terminal, and turn a failure into an exit code.
 */

import { consoleIo } from './output';
import { run } from './program';

export async function main(argv: ReadonlyArray<string>): Promise<number> {
  return run(argv, { io: consoleIo() });
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

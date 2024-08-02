/**
 * What a command has when it runs.
 *
 * The store is opened once per invocation and handed to whichever command was
 * asked for. Commands never open one themselves, so a test can hand them a
 * register that lives in memory and read what they wrote.
 */

import { isCivilDate, type CivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import { closeRegister, openRegister, type Register } from '../service/register';
import type { CliIo } from './output';

export interface GlobalOptions {
  readonly store: string;
  /** The day the command is answered as at. Defaults to today. */
  readonly asOf?: string;
  readonly actor?: string;
  readonly json?: boolean;
  readonly purveyor?: string;
}

export interface CommandContext {
  readonly register: Register;
  readonly io: CliIo;
  readonly asOf: CivilDate;
  readonly json: boolean;
}

export function todayIso(): CivilDate {
  return new Date().toISOString().slice(0, 10);
}

export function resolveAsOf(value: string | undefined): Result<CivilDate, string> {
  if (value === undefined) {
    return ok(todayIso());
  }
  return isCivilDate(value) ? ok(value) : err(`"${value}" is not a date of the form YYYY-MM-DD`);
}

export function withContext<T>(
  options: GlobalOptions,
  io: CliIo,
  work: (context: CommandContext) => Result<T, string>,
): Result<T, string> {
  const asOf = resolveAsOf(options.asOf);
  if (!asOf.ok) {
    return err(asOf.error);
  }
  const opened = openRegister({
    file: options.store,
    actor: options.actor ?? 'cli',
    ...(options.purveyor === undefined
      ? {}
      : { policy: { purveyorName: options.purveyor } }),
  });
  if (!opened.ok) {
    return err(opened.error);
  }
  try {
    return work({
      register: opened.value,
      io,
      asOf: asOf.value,
      json: options.json ?? false,
    });
  } finally {
    closeRegister(opened.value);
  }
}

/** A context that borrows a register somebody else opened, for tests. */
export function contextFor(
  register: Register,
  io: CliIo,
  asOf: CivilDate,
  json = false,
): CommandContext {
  return { register, io, asOf, json };
}

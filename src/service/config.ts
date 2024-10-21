/**
 * The office's own settings.
 *
 * A program office runs one register with one policy, and nobody wants to type
 * the windows onto every command. So a config file sits next to the store and
 * carries them, and anything given on the command line beats it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { z } from 'zod';

import { err, ok, type Result } from '../util/result';
import type { ProgramPolicy } from './register';

export const CONFIG_FILENAME = 'backsiphon.config.json';

const configSchema = z
  .object({
    store: z.string().min(1).optional(),
    purveyorName: z.string().min(1).optional(),
    filingWindowDays: z.number().int().positive().max(365).optional(),
    newConnectionSurveyDays: z.number().int().positive().max(365).optional(),
    cycle: z
      .object({
        intervalMonths: z.number().int().positive().max(120).optional(),
        closeWatchIntervalMonths: z.number().int().positive().max(120).optional(),
        closeWatchUses: z.array(z.string().min(1)).optional(),
        newInstallGraceDays: z.number().int().nonnegative().max(365).optional(),
        repairWorkdays: z.number().int().nonnegative().max(60).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type FileConfig = z.infer<typeof configSchema>;

export interface LoadedConfig {
  readonly file?: string;
  readonly store?: string;
  readonly policy: Partial<ProgramPolicy>;
}

export function parseConfig(text: string): Result<FileConfig, string> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return err(`the config file is not json: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = configSchema.safeParse(value);
  if (!parsed.success) {
    return err(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`).join('; '),
    );
  }
  return ok(parsed.data);
}

export function toLoaded(config: FileConfig, file?: string): LoadedConfig {
  const policy: Partial<ProgramPolicy> = {
    ...(config.purveyorName === undefined ? {} : { purveyorName: config.purveyorName }),
    ...(config.filingWindowDays === undefined ? {} : { filingWindowDays: config.filingWindowDays }),
    ...(config.newConnectionSurveyDays === undefined
      ? {}
      : { newConnectionSurveyDays: config.newConnectionSurveyDays }),
  };
  if (config.cycle !== undefined) {
    return {
      ...(file === undefined ? {} : { file }),
      ...(config.store === undefined ? {} : { store: config.store }),
      policy: { ...policy, cycle: config.cycle as ProgramPolicy['cycle'] },
    };
  }
  return {
    ...(file === undefined ? {} : { file }),
    ...(config.store === undefined ? {} : { store: config.store }),
    policy,
  };
}

/**
 * Walk up from a directory looking for the config file, the way every other
 * command line tool does. It stops at the root rather than at a repository,
 * because a program office is not a repository.
 */
export function findConfigFile(from: string): string | undefined {
  let directory = resolve(from);
  for (;;) {
    const candidate = join(directory, CONFIG_FILENAME);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

export function loadConfig(from: string): Result<LoadedConfig, string> {
  const file = findConfigFile(from);
  if (file === undefined) {
    return ok({ policy: {} });
  }
  const parsed = parseConfig(readFileSync(file, 'utf8'));
  if (!parsed.ok) {
    return err(`${file}: ${parsed.error}`);
  }
  const loaded = toLoaded(parsed.value, file);
  if (loaded.store === undefined) {
    return ok(loaded);
  }
  // a relative store path in the file is relative to the file, not to wherever
  // the clerk happened to be standing when they ran the command
  return ok({ ...loaded, store: resolve(dirname(file), loaded.store) });
}

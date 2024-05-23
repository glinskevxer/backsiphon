/**
 * Identifiers.
 *
 * Every id in the register is meant to be said out loud down a telephone, so
 * they are a short prefix and a number rather than anything random. The number
 * comes from what is already in the table, which means an id is only unique
 * inside one store and that is exactly what is wanted: two offices never share
 * a file.
 */

import { err, ok, type Result } from './result';

export interface IdShape {
  readonly prefix: string;
  readonly width: number;
}

export const CONNECTION_ID: IdShape = { prefix: 'SC', width: 5 };
export const SURVEY_ID: IdShape = { prefix: 'SV', width: 5 };
export const ASSEMBLY_ID: IdShape = { prefix: 'BA', width: 5 };
export const REPORT_ID: IdShape = { prefix: 'TR', width: 6 };
export const NOTICE_ID: IdShape = { prefix: 'N', width: 6 };
export const VARIANCE_ID: IdShape = { prefix: 'V', width: 4 };

export function formatId(shape: IdShape, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`${sequence} is not a sequence number`);
  }
  return `${shape.prefix}-${String(sequence).padStart(shape.width, '0')}`;
}

export function parseId(shape: IdShape, id: string): Result<number, string> {
  const pattern = new RegExp(`^${shape.prefix}-(\\d{1,${Math.max(shape.width, 9)}})$`);
  const match = pattern.exec(id);
  if (match === null) {
    return err(`${id} is not a ${shape.prefix} id`);
  }
  const sequence = Number(match[1]);
  return sequence > 0 ? ok(sequence) : err(`${id} carries no sequence number`);
}

/**
 * The next id after a set of existing ones. Anything that does not parse is
 * ignored rather than refused, because an office that has imported a file from
 * a previous system will have some, and they must not stop new work.
 */
export function nextId(shape: IdShape, existing: ReadonlyArray<string>): string {
  let highest = 0;
  for (const id of existing) {
    const parsed = parseId(shape, id);
    if (parsed.ok && parsed.value > highest) {
      highest = parsed.value;
    }
  }
  return formatId(shape, highest + 1);
}

/** A run of ids, for a batch of assemblies going in on the same day. */
export function nextIds(shape: IdShape, existing: ReadonlyArray<string>, count: number): string[] {
  const first = parseId(shape, nextId(shape, existing));
  if (!first.ok) {
    throw new Error(first.error);
  }
  const ids: string[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    ids.push(formatId(shape, first.value + offset));
  }
  return ids;
}

/** Tidy something a clerk typed into the shape the register stores. */
export function normaliseId(shape: IdShape, typed: string): Result<string, string> {
  const trimmed = typed.trim().toUpperCase();
  const withPrefix = trimmed.startsWith(`${shape.prefix}-`) ? trimmed : `${shape.prefix}-${trimmed}`;
  const parsed = parseId(shape, withPrefix);
  return parsed.ok ? ok(formatId(shape, parsed.value)) : err(parsed.error);
}

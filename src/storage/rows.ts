/**
 * Turning rows into values and back.
 *
 * SQLite has no boolean and no list, so the register writes flags as 0 and 1
 * and lists as comma separated text. Both conversions live here rather than in
 * each repository, because a flag that is read back as the string "0" is
 * truthy and the bug that follows is very hard to see.
 */

export function toFlag(value: boolean): number {
  return value ? 1 : 0;
}

export function fromFlag(value: unknown): boolean {
  return value === 1 || value === true;
}

export function toList(values: ReadonlyArray<string>): string {
  return values.join(',');
}

export function fromList(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

export function toNumberList(values: ReadonlyArray<number>): string {
  return values.join(',');
}

export function fromNumberList(value: unknown): number[] {
  return fromList(value)
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
}

/** Undefined means "no value" everywhere in the domain, null means it in a row. */
export function toNullable<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

export function fromNullable<T>(value: T | null | undefined): T | undefined {
  return value === null || value === undefined ? undefined : value;
}

/** Drop the keys whose value is undefined, so spreads stay type correct. */
export function withoutUndefined<T extends object>(value: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      out[key] = entry;
    }
  }
  return out as Partial<T>;
}

/** Turn a constraint failure into something a clerk can act on. */
export function describeConstraintError(error: unknown, subject: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('UNIQUE constraint failed')) {
    return `${subject} is already on file`;
  }
  if (message.includes('FOREIGN KEY constraint failed')) {
    return `${subject} points at something that is not on file`;
  }
  if (message.includes('CHECK constraint failed')) {
    return `${subject} breaks a rule the store enforces: ${message}`;
  }
  return `${subject} could not be written: ${message}`;
}

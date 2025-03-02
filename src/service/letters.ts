/**
 * What every letter run has in common.
 *
 * There are two runs now and there will be a third when the office starts
 * writing about surveys that were refused. They all count the same three
 * things and they all have to be safe to run twice in a morning, so the shape
 * lives here rather than being copied a third time.
 */

export interface LetterRunSummary {
  readonly considered: number;
  readonly written: number;
  readonly skipped: number;
  /** How many of each kind went out, for the line the clerk reads. */
  readonly byKind: ReadonlyArray<readonly [string, number]>;
}

export function summarise(
  considered: number,
  kinds: ReadonlyArray<string>,
  skipped: number,
): LetterRunSummary {
  const counts = new Map<string, number>();
  for (const kind of kinds) {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return {
    considered,
    written: kinds.length,
    skipped,
    byKind: [...counts.entries()],
  };
}

/** The one line a clerk reads after a run. */
export function describeLetterRun(summary: LetterRunSummary, noun = 'letters'): string {
  const parts = summary.byKind.map(([kind, count]) => `${count} ${kind}`);
  return (
    `${summary.considered} connections, ${summary.written} ${noun} ` +
    `(${parts.join(', ') || 'none'}), ${summary.skipped} skipped`
  );
}

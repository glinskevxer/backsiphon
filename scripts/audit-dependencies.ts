#!/usr/bin/env tsx
/**
 * Read what npm audit found and decide what to do about it.
 *
 * A build that goes red because somebody published an advisory overnight gets
 * switched off within a month, and then nobody reads any of them. So a
 * reported advisory does not fail this. What fails it is an advisory nobody
 * has written a line about, and an acceptance that has gone past the date the
 * office said it would look at it again.
 *
 * The gate reads the production dependencies only, because those are the ones
 * that go out on the register. The development advisories are printed in the
 * same run and are not allowed to stop a build: a linter with a slow regular
 * expression in it is not a thing that reaches a water district.
 */

import { readFileSync } from 'node:fs';

export interface Acceptance {
  readonly id: string;
  readonly package: string;
  readonly why: string;
  /** The day the office said it would look at this again. */
  readonly reviewBy: string;
}

/**
 * Advisories the office has read and decided to carry for now. Every one of
 * them is a decision with a name and a date on it, not a suppression.
 */
export const ACCEPTED: ReadonlyArray<Acceptance> = [];

export interface Advisory {
  readonly id: string;
  readonly package: string;
  readonly severity: string;
  readonly title: string;
}

interface AuditReport {
  vulnerabilities?: Record<
    string,
    {
      name?: string;
      severity?: string;
      via?: Array<string | { source?: number; title?: string; severity?: string; name?: string }>;
    }
  >;
}

export function readAdvisories(json: string): Advisory[] {
  const report = JSON.parse(json) as AuditReport;
  const advisories: Advisory[] = [];
  for (const entry of Object.values(report.vulnerabilities ?? {})) {
    for (const via of entry.via ?? []) {
      if (typeof via === 'string') {
        continue;
      }
      advisories.push({
        id: String(via.source ?? 'unknown'),
        package: via.name ?? entry.name ?? 'unknown',
        severity: via.severity ?? entry.severity ?? 'unknown',
        title: via.title ?? 'no title',
      });
    }
  }
  return advisories;
}

export interface AuditDecision {
  readonly reported: number;
  readonly undecided: ReadonlyArray<Advisory>;
  readonly overdue: ReadonlyArray<Acceptance>;
  readonly ok: boolean;
}

export function decide(
  advisories: ReadonlyArray<Advisory>,
  today: string,
  accepted: ReadonlyArray<Acceptance> = ACCEPTED,
): AuditDecision {
  const known = new Set(accepted.map((entry) => entry.id));
  const undecided = advisories.filter((advisory) => !known.has(advisory.id));
  const overdue = accepted.filter((entry) => entry.reviewBy < today);
  return {
    reported: advisories.length,
    undecided,
    overdue,
    ok: undecided.length === 0 && overdue.length === 0,
  };
}

export function describe(decision: AuditDecision): string[] {
  const lines = [
    `${decision.reported} reported, ${decision.undecided.length} nobody has decided about, ` +
      `${decision.overdue.length} past review`,
  ];
  for (const advisory of decision.undecided) {
    lines.push(
      `undecided: ${advisory.id} ${advisory.package} ${advisory.severity}, ${advisory.title}`,
    );
  }
  for (const entry of decision.overdue) {
    lines.push(`past review: ${entry.id} ${entry.package}, due back on ${entry.reviewBy}`);
  }
  return lines;
}

function main(argv: ReadonlyArray<string>): number {
  const index = argv.indexOf('--from-audit');
  if (index < 0 || argv[index + 1] === undefined) {
    console.error('usage: audit-dependencies --from-audit <file written by npm audit --json>');
    return 2;
  }
  const reportOnly = argv.includes('--report-only');
  const decision = decide(
    readAdvisories(readFileSync(String(argv[index + 1]), 'utf8')),
    new Date().toISOString().slice(0, 10),
  );
  for (const line of describe(decision)) {
    console.log(line);
  }
  if (reportOnly) {
    console.log('report only, nothing here fails the build');
    return 0;
  }
  return decision.ok ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

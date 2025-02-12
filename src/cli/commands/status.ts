/**
 * Where a connection stands, printed for somebody about to telephone a
 * customer about it.
 */

import type { Command } from 'commander';

import { ok } from '../../util/result';
import { complianceFor, noticeRank, type ComplianceStatus, type PointCompliance } from '../../service/compliance';
import { explainStatus, explanationLines } from '../../service/explain';
import { timelineFor, type TimelineEntry } from '../../service/timeline';
import { search, type SearchHit } from '../../service/search';
import { listConnections } from '../../storage/repositories/connections';
import { bullet, describe, heading, table, writeJson, type CliIo } from '../output';
import type { Runner } from '../program';
import { globals, report } from '../shared';

function pointLines(point: PointCompliance): string[] {
  const lines = describe([
    ['required', point.point.requiredClass ?? 'nothing'],
    ['after variance', point.point.effectiveClass ?? 'nothing'],
    ['fitted', point.assembly?.assemblyClass],
    ['assembly', point.assembly?.assemblyId],
    ['deficiency', point.point.deficiency.kind],
    ['urgency', point.point.deficiency.urgency],
    ['test due', point.due?.due],
    ['due because', point.due?.basis],
    ['notice stage', point.delinquency?.stage],
    ['last passing test', point.lastPassing?.report.testedOn],
  ]);
  return [...lines, ...bullet(point.point.deficiency.reasons.map((reason) => reason))];
}

export function registerStatusCommands(program: Command, io: CliIo, runner: Runner): void {
  program
    .command('status')
    .description('where one connection stands today')
    .argument('<connection>', 'the connection id')
    .option('--explain', 'say how every part of the answer was reached')
    .action((connectionId: string, options: Record<string, boolean | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const status = complianceFor(context.register, connectionId, context.asOf);
        return status.ok ? ok({ context, status: status.value }) : status;
      });
      report(io, outcome, ({ context, status }) => {
        if (context.json) {
          writeJson(
            io,
            options['explain'] === true ? { ...status, explanation: explainStatus(status) } : status,
          );
          return;
        }
        if (options['explain'] === true) {
          for (const line of explanationLines(explainStatus(status))) {
            io.out(line);
          }
          return;
        }
        for (const line of heading(`${status.connectionId} as at ${status.asOf}`)) {
          io.out(line);
        }
        for (const line of describe([
          ['standing', status.standing],
          ['urgency', status.urgency],
          ['shutoff eligible', status.shutoffEligible],
          [
            'survey',
            `${status.protection.survey.surveyId} walked ${status.protection.survey.surveyedOn}`,
          ],
          ['containment hazard', status.protection.survey.containmentDegree],
          ['isolation hazard', status.protection.survey.isolationDegree],
        ])) {
          io.out(line);
        }
        for (const line of bullet(status.reasons.map((reason) => reason))) {
          io.out(line);
        }
        io.out('');
        for (const line of heading('containment')) {
          io.out(line);
        }
        for (const line of pointLines(status.containment)) {
          io.out(line);
        }
        io.out('');
        for (const line of heading('isolation')) {
          io.out(line);
        }
        for (const line of pointLines(status.isolation)) {
          io.out(line);
        }
      });
    });

  program
    .command('find')
    .description('find a connection by an account, a name, an address or a serial number')
    .argument('<term>', 'whatever the caller has')
    .option('--limit <count>', 'how many to print', '20')
    .option('--all', 'include the connections that have been taken off')
    .action((term: string, options: Record<string, string | boolean | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) =>
        ok({
          context,
          hits: search(context.register, term, {
            limit: Number(options['limit'] ?? 20),
            ...(options['all'] === true ? { includeClosed: true } : {}),
          }),
        }),
      );
      report(io, outcome, ({ context, hits }) => {
        if (context.json) {
          writeJson(io, hits);
          return;
        }
        if (hits.length === 0) {
          io.out('nothing matched');
          return;
        }
        for (const line of table(hits, [
          { header: 'connection', value: (row: SearchHit) => row.connectionId },
          { header: 'account', value: (row: SearchHit) => row.accountNumber },
          { header: 'premise', value: (row: SearchHit) => row.premiseName },
          { header: 'address', value: (row: SearchHit) => row.premiseAddress },
          { header: 'matched', value: (row: SearchHit) => row.matchedOn },
          { header: 'on', value: (row: SearchHit) => row.matchedValue },
        ])) {
          io.out(line);
        }
      });
    });

  program
    .command('history')
    .description('everything that has happened at one connection, in one column')
    .argument('<connection>', 'the connection id')
    .action((connectionId: string, _options: unknown, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const timeline = timelineFor(context.register, connectionId);
        return timeline.ok ? ok({ context, entries: timeline.value }) : timeline;
      });
      report(io, outcome, ({ context, entries }) => {
        if (context.json) {
          writeJson(io, entries);
          return;
        }
        for (const line of table(entries, [
          { header: 'when', value: (row: TimelineEntry) => row.on },
          { header: 'what', value: (row: TimelineEntry) => row.kind },
          { header: 'reference', value: (row: TimelineEntry) => row.reference },
          { header: 'summary', value: (row: TimelineEntry) => row.summary },
        ])) {
          io.out(line);
        }
      });
    });

  program
    .command('standing')
    .description('where the whole register stands, worst first')
    .option('--route <route>', 'only this route')
    .option('--only <standing>', 'only connections at this standing')
    .action((options: Record<string, string | undefined>, command: Command) => {
      const outcome = runner(globals(command), io, (context) => {
        const rows: ComplianceStatus[] = [];
        const skipped: Array<{ connectionId: string; reason: string }> = [];
        for (const connection of listConnections(context.register.db, {
          activeOn: context.asOf,
          ...(options['route'] === undefined ? {} : { route: String(options['route']) }),
        })) {
          const status = complianceFor(context.register, connection.connectionId, context.asOf);
          if (status.ok) {
            rows.push(status.value);
          } else {
            skipped.push({ connectionId: connection.connectionId, reason: status.error });
          }
        }
        const only = options['only'];
        const filtered = only === undefined ? rows : rows.filter((row) => row.standing === only);
        filtered.sort((left, right) => noticeRank(right) - noticeRank(left));
        return ok({ context, rows: filtered, skipped });
      });
      report(io, outcome, ({ context, rows, skipped }) => {
        if (context.json) {
          writeJson(io, { standing: rows, skipped });
          return;
        }
        for (const line of table(rows, [
          { header: 'connection', value: (row: ComplianceStatus) => row.connectionId },
          { header: 'standing', value: (row: ComplianceStatus) => row.standing },
          { header: 'urgency', value: (row: ComplianceStatus) => row.urgency },
          {
            header: 'containment',
            value: (row: ComplianceStatus) => row.containment.point.effectiveClass ?? 'none',
          },
          {
            header: 'fitted',
            value: (row: ComplianceStatus) => row.containment.assembly?.assemblyClass ?? 'none',
          },
          { header: 'test due', value: (row: ComplianceStatus) => row.containment.due?.due },
          {
            header: 'notice',
            value: (row: ComplianceStatus) => row.containment.delinquency?.stage,
          },
        ])) {
          io.out(line);
        }
        if (skipped.length > 0) {
          io.out('');
          for (const line of heading('not read')) {
            io.out(line);
          }
          for (const line of bullet(
            skipped.map((entry) => `${entry.connectionId}: ${entry.reason}`),
          )) {
            io.out(line);
          }
        }
      });
    });
}

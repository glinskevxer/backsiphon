import type { Migration } from '../migrations';

/**
 * Indexes the standing sweep turned out to need.
 *
 * The sweep asks the same three questions of every connection: the newest
 * survey, the assembly in the ground at each point, and the last passing test.
 * On a district of a few hundred that is a thousand queries, and two of them
 * were scanning. These are the covering indexes for exactly those, and nothing
 * speculative: an index that is not on a query somebody runs is a write cost
 * with no reader.
 */
export const m005Indexes: Migration = {
  id: '005_indexes',
  description: 'covering indexes for the standing sweep',
  statements: [
    `create index if not exists idx_surveys_current
       on surveys (connection_id, surveyed_on desc, survey_id desc)`,
    `create index if not exists idx_assemblies_point
       on assemblies (connection_id, scope, installed_on desc, removed_on)`,
    `create index if not exists idx_reports_outcome
       on test_reports (assembly_id, admissible, outcome, tested_on desc)`,
    `create index if not exists idx_variances_effect
       on variances (connection_id, decision, effective_from, expires_on, revoked_on)`,
  ],
};

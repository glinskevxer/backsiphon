import type { Migration } from '../migrations';

/**
 * Test reports, the letters that go out when they do not arrive, and the
 * append only trail underneath both.
 *
 * A report keeps the ruling on whether it could be accepted next to the
 * outcome of the readings, because those two answers are made by different
 * rules and the office is asked about them separately. Readings live one to a
 * row so that a form with an extra reading on it can still be stored and
 * argued about afterwards.
 */
export const m003Testing: Migration = {
  id: '003_testing',
  description: 'test reports, readings, notices, variances and the event trail',
  statements: [
    `create table test_reports (
      report_id text primary key,
      assembly_id text not null references assemblies (assembly_id) on delete cascade,
      tester_id text not null references testers (tester_id) on delete restrict,
      gauge_id text not null references gauges (gauge_id) on delete restrict,
      assembly_class_tested text not null,
      tested_on text not null,
      filed_on text not null,
      repair_made integer not null check (repair_made in (0, 1)),
      repair_note text,
      remarks text,
      admissible integer not null check (admissible in (0, 1)),
      inadmissible_codes text not null default '',
      outcome text not null check (outcome in ('pass', 'marginal', 'fail', 'incomplete')),
      as_found_outcome text not null check (
        as_found_outcome in ('pass', 'marginal', 'fail', 'incomplete')
      ),
      recorded_at text not null,
      check (filed_on >= tested_on)
    )`,
    `create index idx_reports_assembly on test_reports (assembly_id, tested_on desc)`,
    `create index idx_reports_tester on test_reports (tester_id, tested_on desc)`,
    `create table report_readings (
      report_id text not null references test_reports (report_id) on delete cascade,
      phase text not null check (phase in ('as_found', 'as_left')),
      reading_key text not null,
      numeric_value real,
      flag_value integer check (flag_value is null or flag_value in (0, 1)),
      primary key (report_id, phase, reading_key),
      check (
        (numeric_value is null and flag_value is not null)
        or (numeric_value is not null and flag_value is null)
      )
    )`,
    `create table notices (
      notice_id text primary key,
      connection_id text not null references service_connections (connection_id) on delete cascade,
      assembly_id text references assemblies (assembly_id) on delete set null,
      stage text not null check (stage in ('first', 'second', 'final', 'shutoff')),
      due_date text not null,
      issued_on text not null,
      ladder text not null,
      days_past_due integer not null check (days_past_due >= 0),
      cleared_on text,
      body text not null,
      check (cleared_on is null or cleared_on >= issued_on)
    )`,
    `create unique index idx_notices_stage on notices (connection_id, due_date, stage)`,
    `create index idx_notices_open on notices (cleared_on, issued_on)`,
    `create table variances (
      variance_id text primary key,
      connection_id text not null references service_connections (connection_id) on delete cascade,
      applied_on text not null,
      decision text check (decision is null or decision in ('granted', 'denied')),
      decided_on text,
      accepted_class text not null,
      granted_against_degree text not null check (
        granted_against_degree in ('none', 'nonhealth', 'health')
      ),
      effective_from text,
      expires_on text,
      conditions text not null default '',
      revoked_on text,
      note text,
      check (decision is null or decided_on is not null),
      check (expires_on is null or effective_from is null or expires_on > effective_from)
    )`,
    `create index idx_variances_connection on variances (connection_id, applied_on desc)`,
    `create table events (
      event_id integer primary key autoincrement,
      happened_at text not null,
      actor text not null,
      kind text not null,
      subject_kind text not null,
      subject_id text not null,
      detail text not null default ''
    )`,
    `create index idx_events_subject on events (subject_kind, subject_id, event_id)`,
    `create index idx_events_kind on events (kind, event_id)`,
  ],
};

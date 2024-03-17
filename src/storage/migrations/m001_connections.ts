import type { Migration } from '../migrations';

/**
 * The service connections and the surveys walked against them.
 *
 * A survey is kept as the surveyor wrote it and as the register read it. The
 * findings stay in their own table because a survey has any number of them and
 * because the notices quote them by code.
 */
export const m001Connections: Migration = {
  id: '001_connections',
  description: 'service connections, premises and hazard surveys',
  statements: [
    `create table service_connections (
      connection_id text primary key,
      account_number text not null unique,
      premise_name text not null,
      premise_address text not null,
      premise_use_code text not null,
      service_size_inches real not null check (service_size_inches > 0),
      fire_service integer not null check (fire_service in (0, 1)),
      purveyor_metered integer not null check (purveyor_metered in (0, 1)),
      connected_on text not null,
      disconnected_on text,
      route text not null default 'unassigned',
      note text,
      check (disconnected_on is null or disconnected_on >= connected_on)
    )`,
    `create index idx_connections_route on service_connections (route, account_number)`,
    `create index idx_connections_use on service_connections (premise_use_code)`,
    `create table surveys (
      survey_id text primary key,
      connection_id text not null references service_connections (connection_id) on delete cascade,
      surveyed_on text not null,
      surveyor text not null,
      access_granted integer not null check (access_granted in (0, 1)),
      premise_use_code text not null,
      containment_degree text not null check (containment_degree in ('none', 'nonhealth', 'health')),
      isolation_degree text not null check (isolation_degree in ('none', 'nonhealth', 'health')),
      air_gap_required integer not null check (air_gap_required in (0, 1)),
      backpressure integer not null check (backpressure in (0, 1)),
      basis text not null check (basis in ('survey', 'category', 'refused')),
      next_survey_due text not null,
      note text,
      recorded_at text not null
    )`,
    `create index idx_surveys_connection on surveys (connection_id, surveyed_on desc)`,
    `create table survey_findings (
      survey_id text not null references surveys (survey_id) on delete cascade,
      finding_code text not null,
      primary key (survey_id, finding_code)
    )`,
    `create index idx_findings_code on survey_findings (finding_code)`,
  ],
};

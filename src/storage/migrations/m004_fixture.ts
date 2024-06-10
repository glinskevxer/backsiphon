import type { Migration } from '../migrations';

/**
 * The facts about the inside of the premise that decide which class an
 * isolation requirement asks for.
 *
 * They sit on the connection rather than on a table of their own. That is a
 * simplification and it is worth naming: a premise with two very different
 * risers is described by the worse of them. The office has never had one where
 * that mattered, and the survey note carries the detail when it does.
 */
export const m004Fixture: Migration = {
  id: '004_fixture',
  description: 'fixture geometry for the isolation requirement',
  statements: [
    `alter table service_connections
       add column outlet_elevation_inches real not null default 12
       check (outlet_elevation_inches >= 0)`,
    `alter table service_connections
       add column indoor_riser integer not null default 0
       check (indoor_riser in (0, 1))`,
    `alter table service_connections
       add column downstream_shutoff integer not null default 1
       check (downstream_shutoff in (0, 1))`,
    `alter table service_connections
       add column continuous_pressure_hours integer not null default 24
       check (continuous_pressure_hours between 0 and 24)`,
  ],
};

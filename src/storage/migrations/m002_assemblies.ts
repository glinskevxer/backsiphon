import type { Migration } from '../migrations';

/**
 * The hardware and the people allowed to touch it.
 *
 * An assembly points at a model on the approval list rather than carrying the
 * maker and the model number itself, because whether a model is still listed
 * is a fact about the model and it changes under the assemblies fitted to it.
 */
export const m002Assemblies: Migration = {
  id: '002_assemblies',
  description: 'approved models, fitted assemblies, testers and gauges',
  statements: [
    `create table approved_models (
      model_id text primary key,
      maker text not null,
      model text not null,
      assembly_class text not null check (
        assembly_class in ('AG', 'RP', 'RPDA', 'DC', 'DCDA', 'PVB', 'SVB', 'AVB')
      ),
      sizes text not null,
      listed_on text not null,
      delisted_on text,
      note text not null default '',
      check (delisted_on is null or delisted_on > listed_on)
    )`,
    `create index idx_models_class on approved_models (assembly_class, model_id)`,
    `create table assemblies (
      assembly_id text primary key,
      connection_id text not null references service_connections (connection_id) on delete cascade,
      scope text not null check (scope in ('containment', 'isolation')),
      assembly_class text not null check (
        assembly_class in ('AG', 'RP', 'RPDA', 'DC', 'DCDA', 'PVB', 'SVB', 'AVB')
      ),
      model_id text not null references approved_models (model_id),
      serial_number text not null,
      size_inches real not null check (size_inches > 0),
      installed_on text not null,
      removed_on text,
      location text not null,
      note text,
      check (removed_on is null or removed_on > installed_on)
    )`,
    `create unique index idx_assemblies_serial on assemblies (model_id, serial_number)`,
    `create index idx_assemblies_connection on assemblies (connection_id, scope, installed_on)`,
    `create table testers (
      tester_id text primary key,
      name text not null,
      agency text not null,
      certificate_number text not null,
      issued_on text not null,
      expires_on text not null,
      endorsements text not null,
      suspended_on text,
      suspended_reason text,
      check (expires_on > issued_on)
    )`,
    `create unique index idx_testers_certificate on testers (agency, certificate_number)`,
    `create table gauges (
      gauge_id text primary key,
      tester_id text not null references testers (tester_id) on delete restrict,
      maker text not null,
      serial_number text not null,
      calibrated_on text not null,
      calibration_interval_months integer not null check (calibration_interval_months >= 0),
      accuracy_psid real not null check (accuracy_psid > 0),
      retired_on text
    )`,
    `create unique index idx_gauges_serial on gauges (maker, serial_number)`,
  ],
};

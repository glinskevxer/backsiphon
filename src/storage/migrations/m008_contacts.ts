import type { Migration } from '../migrations';

/**
 * Who to ring about a premise.
 *
 * The account holder is not always the person who can let a tester in, and on
 * an industrial site they are usually not even in the same county. A contact
 * carries a role so that a letter goes to the account and a telephone call
 * goes to the site.
 */
export const m008Contacts: Migration = {
  id: '008_contacts',
  description: 'premise contacts and their roles',
  statements: [
    `create table contacts (
      contact_id text primary key,
      connection_id text not null references service_connections (connection_id) on delete cascade,
      role text not null check (role in ('account', 'site', 'plumber', 'emergency')),
      name text not null,
      telephone text,
      email text,
      note text,
      added_on text not null,
      retired_on text,
      check (retired_on is null or retired_on >= added_on)
    )`,
    `create index idx_contacts_connection on contacts (connection_id, role, retired_on)`,
    `create unique index idx_contacts_role_live
       on contacts (connection_id, role)
       where retired_on is null`,
  ],
};

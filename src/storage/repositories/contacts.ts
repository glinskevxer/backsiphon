/**
 * Contacts against a premise.
 *
 * One live contact per role, because a clerk with two site telephone numbers
 * rings the wrong one. Replacing a contact retires the old row rather than
 * writing over it, so the file still shows who the office was ringing in 2019.
 */

import type { CivilDate } from '../../util/dates';
import { err, ok, type Result } from '../../util/result';
import { execute, selectAll, selectOne, withTransaction, type Database } from '../db';
import { describeConstraintError, toNullable } from '../rows';

export type ContactRole = 'account' | 'site' | 'plumber' | 'emergency';

export const CONTACT_ROLES: ReadonlyArray<ContactRole> = [
  'account',
  'site',
  'plumber',
  'emergency',
];

export interface Contact {
  readonly contactId: string;
  readonly connectionId: string;
  readonly role: ContactRole;
  readonly name: string;
  readonly telephone?: string;
  readonly email?: string;
  readonly note?: string;
  readonly addedOn: CivilDate;
  readonly retiredOn?: CivilDate;
}

interface ContactRow {
  contact_id: string;
  connection_id: string;
  role: ContactRole;
  name: string;
  telephone: string | null;
  email: string | null;
  note: string | null;
  added_on: string;
  retired_on: string | null;
}

const COLUMNS =
  'contact_id, connection_id, role, name, telephone, email, note, added_on, retired_on';

function toContact(row: ContactRow): Contact {
  return {
    contactId: row.contact_id,
    connectionId: row.connection_id,
    role: row.role,
    name: row.name,
    ...(row.telephone === null ? {} : { telephone: row.telephone }),
    ...(row.email === null ? {} : { email: row.email }),
    ...(row.note === null ? {} : { note: row.note }),
    addedOn: row.added_on,
    ...(row.retired_on === null ? {} : { retiredOn: row.retired_on }),
  };
}

export function insertContact(db: Database, contact: Contact): Result<Contact, string> {
  if (contact.name.trim() === '') {
    return err('a contact has to have a name on it');
  }
  if (contact.telephone === undefined && contact.email === undefined) {
    return err(
      `there is no way to reach ${contact.name}, put a telephone number or an email on it`,
    );
  }
  try {
    execute(db, `insert into contacts (${COLUMNS}) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      contact.contactId,
      contact.connectionId,
      contact.role,
      contact.name.trim(),
      toNullable(contact.telephone),
      toNullable(contact.email),
      toNullable(contact.note),
      contact.addedOn,
      toNullable(contact.retiredOn),
    ]);
    return ok(contact);
  } catch (error) {
    return err(describeConstraintError(error, `the contact ${contact.contactId}`));
  }
}

export function findContact(db: Database, contactId: string): Contact | undefined {
  const row = selectOne<ContactRow>(db, `select ${COLUMNS} from contacts where contact_id = ?`, [
    contactId,
  ]);
  return row === undefined ? undefined : toContact(row);
}

export function contactsFor(db: Database, connectionId: string, includeRetired = false): Contact[] {
  const clause = includeRetired ? '' : 'and retired_on is null';
  return selectAll<ContactRow>(
    db,
    `select ${COLUMNS} from contacts where connection_id = ? ${clause} order by role, added_on desc`,
    [connectionId],
  ).map(toContact);
}

export function contactInRole(
  db: Database,
  connectionId: string,
  role: ContactRole,
): Contact | undefined {
  const row = selectOne<ContactRow>(
    db,
    `select ${COLUMNS} from contacts
     where connection_id = ? and role = ? and retired_on is null`,
    [connectionId, role],
  );
  return row === undefined ? undefined : toContact(row);
}

export function retireContact(
  db: Database,
  contactId: string,
  on: CivilDate,
): Result<Contact, string> {
  const contact = findContact(db, contactId);
  if (contact === undefined) {
    return err(`there is no contact with the id ${contactId}`);
  }
  if (contact.retiredOn !== undefined) {
    return err(`the contact ${contactId} was retired on ${contact.retiredOn}`);
  }
  if (on < contact.addedOn) {
    return err(`the contact ${contactId} was added on ${contact.addedOn}, later than ${on}`);
  }
  execute(db, 'update contacts set retired_on = ? where contact_id = ?', [on, contactId]);
  return ok({ ...contact, retiredOn: on });
}

/** Put a new contact in a role, retiring whoever was in it. */
export function replaceContact(db: Database, contact: Contact): Result<Contact, string> {
  return withTransaction(db, () => {
    const standing = contactInRole(db, contact.connectionId, contact.role);
    if (standing !== undefined) {
      const retired = retireContact(db, standing.contactId, contact.addedOn);
      if (!retired.ok) {
        return retired;
      }
    }
    return insertContact(db, contact);
  });
}

/** The person to telephone, in the order the office actually tries them. */
export function whoToRing(db: Database, connectionId: string): Contact | undefined {
  for (const role of ['site', 'account', 'plumber', 'emergency'] as ContactRole[]) {
    const contact = contactInRole(db, connectionId, role);
    if (contact?.telephone !== undefined) {
      return contact;
    }
  }
  return undefined;
}

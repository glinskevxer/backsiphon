/**
 * Finding a connection when the caller has half of something.
 *
 * People telephone with an account number they have read badly, a street name,
 * a premise that has been renamed twice, or the serial number stamped on the
 * assembly in front of them. All four go through the same door.
 */

import { selectAll } from '../storage/db';
import type { Register } from './register';

export type MatchedOn = 'account' | 'premise' | 'address' | 'serial' | 'contact';

export interface SearchHit {
  readonly connectionId: string;
  readonly accountNumber: string;
  readonly premiseName: string;
  readonly premiseAddress: string;
  readonly matchedOn: MatchedOn;
  readonly matchedValue: string;
}

export interface SearchOptions {
  readonly limit?: number;
  /** Include connections that have been taken off the register. */
  readonly includeClosed?: boolean;
}

interface HitRow {
  connection_id: string;
  account_number: string;
  premise_name: string;
  premise_address: string;
  matched_on: MatchedOn;
  matched_value: string;
}

export const DEFAULT_SEARCH_LIMIT = 20;

/**
 * A plain substring search, case insensitive, over the four places a caller's
 * fragment could be. It is not clever and it does not need to be: a program
 * office register is a few thousand rows and the clerk is on the telephone.
 */
export function search(register: Register, term: string, options: SearchOptions = {}): SearchHit[] {
  const trimmed = term.trim();
  if (trimmed === '') {
    return [];
  }
  const like = `%${trimmed.toLowerCase()}%`;
  const closed = options.includeClosed === true ? '' : 'and c.disconnected_on is null';

  const rows = selectAll<HitRow>(
    register.db,
    `select c.connection_id, c.account_number, c.premise_name, c.premise_address,
            'account' as matched_on, c.account_number as matched_value
       from service_connections c
      where lower(c.account_number) like ? ${closed}
     union all
     select c.connection_id, c.account_number, c.premise_name, c.premise_address,
            'premise', c.premise_name
       from service_connections c
      where lower(c.premise_name) like ? ${closed}
     union all
     select c.connection_id, c.account_number, c.premise_name, c.premise_address,
            'address', c.premise_address
       from service_connections c
      where lower(c.premise_address) like ? ${closed}
     union all
     select c.connection_id, c.account_number, c.premise_name, c.premise_address,
            'serial', a.serial_number
       from service_connections c
       join assemblies a on a.connection_id = c.connection_id
      where lower(a.serial_number) like ? ${closed}
     union all
     select c.connection_id, c.account_number, c.premise_name, c.premise_address,
            'contact', t.name
       from service_connections c
       join contacts t on t.connection_id = c.connection_id
      where lower(t.name) like ? and t.retired_on is null ${closed}
     order by matched_on, account_number`,
    [like, like, like, like, like],
  );

  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const row of rows) {
    const key = `${row.connection_id}/${row.matched_on}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    hits.push({
      connectionId: row.connection_id,
      accountNumber: row.account_number,
      premiseName: row.premise_name,
      premiseAddress: row.premise_address,
      matchedOn: row.matched_on,
      matchedValue: row.matched_value,
    });
  }
  return hits.slice(0, options.limit ?? DEFAULT_SEARCH_LIMIT);
}

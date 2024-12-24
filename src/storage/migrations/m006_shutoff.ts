import type { Migration } from '../migrations';

/**
 * Shutoff orders.
 *
 * Being eligible for a shutoff and being shut off are different things, and
 * the office kept the second one on paper until a valve was closed on a
 * hospital by mistake. An order names who signed it, when the crew went, and
 * what had to be true before the water came back.
 */
export const m006Shutoff: Migration = {
  id: '006_shutoff',
  description: 'shutoff orders and restorations',
  statements: [
    `create table shutoff_orders (
      order_id text primary key,
      connection_id text not null references service_connections (connection_id) on delete cascade,
      raised_on text not null,
      raised_by text not null,
      reason text not null,
      due_date text not null,
      notice_id text references notices (notice_id) on delete set null,
      executed_on text,
      executed_by text,
      restored_on text,
      restored_by text,
      restoration_note text,
      cancelled_on text,
      cancelled_reason text,
      check (executed_on is null or executed_on >= raised_on),
      check (restored_on is null or executed_on is not null),
      check (restored_on is null or restored_on >= executed_on),
      check (cancelled_on is null or executed_on is null)
    )`,
    `create index idx_shutoff_connection on shutoff_orders (connection_id, raised_on desc)`,
    `create index idx_shutoff_open on shutoff_orders (executed_on, restored_on, cancelled_on)`,
  ],
};

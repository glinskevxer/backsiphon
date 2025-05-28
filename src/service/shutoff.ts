/**
 * Turning the water off, and turning it back on.
 *
 * Three steps on purpose. An order is raised, a crew executes it, and a
 * restoration closes it. The office will not raise one on a connection that is
 * not eligible today, and it will not restore one until the thing the order
 * was about has actually been put right, which it works out rather than takes
 * on trust.
 */

import type { CivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import { execute, selectAll, selectOne, withTransaction } from '../storage/db';
import { appendEvent } from '../storage/repositories/events';
import { SHUTOFF_ID } from '../util/ids';
import { complianceFor } from './compliance';
import { mintId, type Register } from './register';

export interface ShutoffOrder {
  readonly orderId: string;
  readonly connectionId: string;
  readonly raisedOn: CivilDate;
  readonly raisedBy: string;
  readonly reason: string;
  readonly dueDate: CivilDate;
  readonly executedOn?: CivilDate;
  readonly executedBy?: string;
  readonly restoredOn?: CivilDate;
  readonly restoredBy?: string;
  readonly cancelledOn?: CivilDate;
  readonly cancelledReason?: string;
}

interface OrderRow {
  order_id: string;
  connection_id: string;
  raised_on: string;
  raised_by: string;
  reason: string;
  due_date: string;
  executed_on: string | null;
  executed_by: string | null;
  restored_on: string | null;
  restored_by: string | null;
  cancelled_on: string | null;
  cancelled_reason: string | null;
}

const COLUMNS = `order_id, connection_id, raised_on, raised_by, reason, due_date,
  executed_on, executed_by, restored_on, restored_by, cancelled_on, cancelled_reason`;

function toOrder(row: OrderRow): ShutoffOrder {
  return {
    orderId: row.order_id,
    connectionId: row.connection_id,
    raisedOn: row.raised_on,
    raisedBy: row.raised_by,
    reason: row.reason,
    dueDate: row.due_date,
    ...(row.executed_on === null ? {} : { executedOn: row.executed_on }),
    ...(row.executed_by === null ? {} : { executedBy: row.executed_by }),
    ...(row.restored_on === null ? {} : { restoredOn: row.restored_on }),
    ...(row.restored_by === null ? {} : { restoredBy: row.restored_by }),
    ...(row.cancelled_on === null ? {} : { cancelledOn: row.cancelled_on }),
    ...(row.cancelled_reason === null ? {} : { cancelledReason: row.cancelled_reason }),
  };
}

export function findOrder(register: Register, orderId: string): ShutoffOrder | undefined {
  const row = selectOne<OrderRow>(
    register.db,
    `select ${COLUMNS} from shutoff_orders where order_id = ?`,
    [orderId],
  );
  return row === undefined ? undefined : toOrder(row);
}

export function ordersFor(register: Register, connectionId: string): ShutoffOrder[] {
  return selectAll<OrderRow>(
    register.db,
    `select ${COLUMNS} from shutoff_orders where connection_id = ? order by raised_on desc`,
    [connectionId],
  ).map(toOrder);
}

/** Orders raised and not yet executed, cancelled or restored. */
export function openOrders(register: Register): ShutoffOrder[] {
  return selectAll<OrderRow>(
    register.db,
    `select ${COLUMNS} from shutoff_orders
     where cancelled_on is null and restored_on is null
     order by raised_on`,
  ).map(toOrder);
}

export function raiseOrder(
  register: Register,
  connectionId: string,
  raisedOn: CivilDate,
  reason: string,
): Result<ShutoffOrder, string> {
  if (reason.trim() === '') {
    return err('a shutoff order has to say what it is for');
  }
  const status = complianceFor(register, connectionId, raisedOn);
  if (!status.ok) {
    return err(status.error);
  }
  if (!status.value.shutoffEligible) {
    return err(
      `the connection ${connectionId} is not eligible for shutoff on ${raisedOn}, it reads ${status.value.standing}`,
    );
  }
  if (openOrders(register).some((order) => order.connectionId === connectionId)) {
    return err(`the connection ${connectionId} already has an order open on it`);
  }

  const order: ShutoffOrder = {
    orderId: mintId(register, SHUTOFF_ID, 'shutoff_orders', 'order_id'),
    connectionId,
    raisedOn,
    raisedBy: register.actor,
    reason,
    dueDate: status.value.containment.due?.due ?? raisedOn,
  };

  return withTransaction(register.db, () => {
    execute(
      register.db,
      `insert into shutoff_orders (order_id, connection_id, raised_on, raised_by, reason, due_date)
       values (?, ?, ?, ?, ?, ?)`,
      [order.orderId, connectionId, raisedOn, order.raisedBy, reason, order.dueDate],
    );
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'shutoff_ordered',
      subjectKind: 'connection',
      subjectId: connectionId,
      detail: `${order.orderId}: ${reason}`,
    });
    return ok(order);
  });
}

export function executeOrder(
  register: Register,
  orderId: string,
  on: CivilDate,
  crew: string,
): Result<ShutoffOrder, string> {
  const order = findOrder(register, orderId);
  if (order === undefined) {
    return err(`there is no shutoff order with the id ${orderId}`);
  }
  if (order.cancelledOn !== undefined) {
    return err(`the order ${orderId} was cancelled on ${order.cancelledOn}`);
  }
  if (order.executedOn !== undefined) {
    return err(`the order ${orderId} was carried out on ${order.executedOn}`);
  }
  if (crew.trim() === '') {
    return err('a shutoff has to name the crew that went');
  }
  return withTransaction(register.db, () => {
    execute(
      register.db,
      'update shutoff_orders set executed_on = ?, executed_by = ? where order_id = ?',
      [on, crew, orderId],
    );
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'shutoff_executed',
      subjectKind: 'connection',
      subjectId: order.connectionId,
      detail: `${orderId} carried out by ${crew} on ${on}`,
    });
    return ok({ ...order, executedOn: on, executedBy: crew });
  });
}

export function cancelOrder(
  register: Register,
  orderId: string,
  on: CivilDate,
  reason: string,
): Result<ShutoffOrder, string> {
  const order = findOrder(register, orderId);
  if (order === undefined) {
    return err(`there is no shutoff order with the id ${orderId}`);
  }
  if (order.executedOn !== undefined) {
    return err(`the order ${orderId} has already been carried out, so it is a restoration now`);
  }
  if (reason.trim() === '') {
    return err('cancelling an order has to say why');
  }
  return withTransaction(register.db, () => {
    execute(
      register.db,
      'update shutoff_orders set cancelled_on = ?, cancelled_reason = ? where order_id = ?',
      [on, reason, orderId],
    );
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'shutoff_cancelled',
      subjectKind: 'connection',
      subjectId: order.connectionId,
      detail: `${orderId}: ${reason}`,
    });
    return ok({ ...order, cancelledOn: on, cancelledReason: reason });
  });
}

/**
 * Put the water back. The register works out for itself whether the thing the
 * order was raised about has been put right, and refuses otherwise, because a
 * crew standing at a stop tap is not the place to be reading a file.
 */
export function restoreOrder(
  register: Register,
  orderId: string,
  on: CivilDate,
  crew: string,
  note?: string,
): Result<ShutoffOrder, string> {
  const order = findOrder(register, orderId);
  if (order === undefined) {
    return err(`there is no shutoff order with the id ${orderId}`);
  }
  if (order.executedOn === undefined) {
    return err(`the order ${orderId} was never carried out, so there is nothing to restore`);
  }
  if (order.restoredOn !== undefined) {
    return err(`the order ${orderId} was restored on ${order.restoredOn}`);
  }
  const status = complianceFor(register, order.connectionId, on);
  if (!status.ok) {
    return err(status.error);
  }
  if (status.value.shutoffEligible) {
    return err(
      `the connection ${order.connectionId} still reads ${status.value.standing} on ${on}, ` +
        'so the water stays off',
    );
  }
  return withTransaction(register.db, () => {
    execute(
      register.db,
      `update shutoff_orders set restored_on = ?, restored_by = ?, restoration_note = ?
       where order_id = ?`,
      [on, crew, note ?? null, orderId],
    );
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'service_restored',
      subjectKind: 'connection',
      subjectId: order.connectionId,
      detail: `${orderId} restored by ${crew} on ${on}`,
    });
    return ok({ ...order, restoredOn: on, restoredBy: crew });
  });
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cancelOrder,
  executeOrder,
  findOrder,
  openOrders,
  ordersFor,
  raiseOrder,
  restoreOrder,
} from '../../../src/service/shutoff';
import { eventsFor } from '../../../src/storage/repositories/events';
import { fileTest, fit, open, openOffice, walk, type Office } from '../../support/office';

let office: Office;
let connectionId: string;
let assemblyId: string;

beforeEach(() => {
  office = openOffice();
  connectionId = open(office, { accountNumber: 'A-9001' });
  walk(office, connectionId, '2023-01-10', ['AUX_WELL']);
  assemblyId = fit(office, { connectionId, installedOn: '2023-02-01' });
  fileTest(office, { assemblyId, testedOn: '2023-02-05' });
});

afterEach(() => {
  office.close();
});

describe('raising one', () => {
  it('refuses a connection that is not eligible today', () => {
    const early = raiseOrder(office.register, connectionId, '2023-06-01', 'no test on file');
    expect(early.ok).toBe(false);
    if (!early.ok) {
      expect(early.error).toContain('not eligible');
    }
  });

  it('takes one once the ladder has run out', () => {
    const raised = raiseOrder(office.register, connectionId, '2024-04-01', 'no test since 2023');
    expect(raised.ok).toBe(true);
    if (!raised.ok) {
      return;
    }
    expect(raised.value.orderId).toBe('SO-0001');
    expect(raised.value.raisedBy).toBe('clerk.hines');
    expect(raised.value.dueDate).toBe('2024-02-05');
    expect(eventsFor(office.register.db, 'connection', connectionId).map((entry) => entry.kind)).toContain(
      'shutoff_ordered',
    );
  });

  it('refuses a second order while one is open', () => {
    raiseOrder(office.register, connectionId, '2024-04-01', 'no test');
    const again = raiseOrder(office.register, connectionId, '2024-04-02', 'still no test');
    expect(again.ok).toBe(false);
  });

  it('refuses one with nothing written on it', () => {
    expect(raiseOrder(office.register, connectionId, '2024-04-01', '  ').ok).toBe(false);
  });
});

describe('carrying one out', () => {
  beforeEach(() => {
    raiseOrder(office.register, connectionId, '2024-04-01', 'no test since 2023');
  });

  it('records the crew and the day', () => {
    const done = executeOrder(office.register, 'SO-0001', '2024-04-08', 'crew 3');
    expect(done.ok).toBe(true);
    expect(findOrder(office.register, 'SO-0001')?.executedOn).toBe('2024-04-08');
    expect(findOrder(office.register, 'SO-0001')?.executedBy).toBe('crew 3');
  });

  it('will not do it twice, or without a crew', () => {
    expect(executeOrder(office.register, 'SO-0001', '2024-04-08', '  ').ok).toBe(false);
    executeOrder(office.register, 'SO-0001', '2024-04-08', 'crew 3');
    expect(executeOrder(office.register, 'SO-0001', '2024-04-09', 'crew 4').ok).toBe(false);
  });

  it('can be cancelled before the crew goes and not after', () => {
    expect(cancelOrder(office.register, 'SO-0001', '2024-04-05', 'customer filed on time').ok).toBe(true);
    expect(findOrder(office.register, 'SO-0001')?.cancelledOn).toBe('2024-04-05');
    expect(executeOrder(office.register, 'SO-0001', '2024-04-08', 'crew 3').ok).toBe(false);
  });

  it('will not cancel one that has already been carried out', () => {
    executeOrder(office.register, 'SO-0001', '2024-04-08', 'crew 3');
    const late = cancelOrder(office.register, 'SO-0001', '2024-04-09', 'too late');
    expect(late.ok).toBe(false);
    if (!late.ok) {
      expect(late.error).toContain('restoration now');
    }
  });
});

describe('putting the water back', () => {
  beforeEach(() => {
    raiseOrder(office.register, connectionId, '2024-04-01', 'no test since 2023');
    executeOrder(office.register, 'SO-0001', '2024-04-08', 'crew 3');
  });

  it('refuses while the thing the order was about is still true', () => {
    const early = restoreOrder(office.register, 'SO-0001', '2024-04-09', 'crew 3');
    expect(early.ok).toBe(false);
    if (!early.ok) {
      expect(early.error).toContain('the water stays off');
    }
  });

  it('goes through once a passing test lands', () => {
    fileTest(office, { assemblyId, testedOn: '2024-04-10' });
    const restored = restoreOrder(office.register, 'SO-0001', '2024-04-11', 'crew 3', 'meter reseated');
    expect(restored.ok).toBe(true);
    expect(findOrder(office.register, 'SO-0001')?.restoredOn).toBe('2024-04-11');
    expect(openOrders(office.register)).toEqual([]);
  });

  it('will not restore one nobody carried out', () => {
    const other = open(office, { accountNumber: 'A-9002' });
    walk(office, other, '2023-01-10', ['AUX_WELL']);
    const otherAssembly = fit(office, { connectionId: other, installedOn: '2023-02-01' });
    fileTest(office, { assemblyId: otherAssembly, testedOn: '2023-02-05' });
    raiseOrder(office.register, other, '2024-04-01', 'no test');
    expect(restoreOrder(office.register, 'SO-0002', '2024-04-11', 'crew 3').ok).toBe(false);
  });

  it('says so when there is no such order at all', () => {
    expect(restoreOrder(office.register, 'SO-9999', '2024-04-11', 'crew 3').ok).toBe(false);
    expect(executeOrder(office.register, 'SO-9999', '2024-04-11', 'crew 3').ok).toBe(false);
    expect(cancelOrder(office.register, 'SO-9999', '2024-04-11', 'x').ok).toBe(false);
  });

  it('keeps the whole history on the connection', () => {
    fileTest(office, { assemblyId, testedOn: '2024-04-10' });
    restoreOrder(office.register, 'SO-0001', '2024-04-11', 'crew 3');
    const orders = ordersFor(office.register, connectionId);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.restoredBy).toBe('crew 3');
    const kinds = eventsFor(office.register.db, 'connection', connectionId).map((entry) => entry.kind);
    expect(kinds).toContain('shutoff_executed');
    expect(kinds).toContain('service_restored');
  });
});

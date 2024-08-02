import { describe, expect, it } from 'vitest';

import { contextFor, resolveAsOf, todayIso, withContext } from '../../../src/cli/context';
import { capturingIo } from '../../../src/cli/output';
import { closeRegister, openRegister } from '../../../src/service/register';
import { ok } from '../../../src/util/result';
import { tableNames } from '../../../src/storage/db';

describe('the as of date', () => {
  it('defaults to today', () => {
    const resolved = resolveAsOf(undefined);
    expect(resolved.ok && resolved.value).toBe(todayIso());
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('takes a date the register can read', () => {
    expect(resolveAsOf('2024-08-02')).toEqual({ ok: true, value: '2024-08-02' });
  });

  it('refuses anything else', () => {
    expect(resolveAsOf('yesterday').ok).toBe(false);
    expect(resolveAsOf('2024-13-01').ok).toBe(false);
  });
});

describe('running with a context', () => {
  it('opens a migrated store and closes it again', () => {
    const io = capturingIo();
    let seen: string[] = [];
    const result = withContext({ store: ':memory:' }, io, (context) => {
      seen = tableNames(context.register.db);
      expect(context.register.db.open).toBe(true);
      return ok(context.register);
    });
    expect(result.ok).toBe(true);
    expect(seen).toContain('service_connections');
    if (result.ok) {
      expect(result.value.db.open).toBe(false);
    }
  });

  it('closes the store even when the command fails', () => {
    const io = capturingIo();
    let register: ReturnType<typeof openRegister> | undefined;
    expect(() =>
      withContext({ store: ':memory:' }, io, (context) => {
        register = ok(context.register);
        throw new Error('the command gave up');
      }),
    ).toThrow('the command gave up');
    expect(register?.ok === true && register.value.db.open).toBe(false);
  });

  it('carries the clerk and the purveyor name through', () => {
    const io = capturingIo();
    withContext(
      { store: ':memory:', actor: 'clerk.owusu', purveyor: 'north valley water' },
      io,
      (context) => {
        expect(context.register.actor).toBe('clerk.owusu');
        expect(context.register.policy.purveyorName).toBe('north valley water');
        return ok(true);
      },
    );
  });

  it('refuses a bad as of date before opening anything', () => {
    const io = capturingIo();
    const result = withContext({ store: ':memory:', asOf: 'sometime' }, io, () => ok(true));
    expect(result.ok).toBe(false);
  });
});

describe('borrowing a register', () => {
  it('builds a context round one somebody else opened', () => {
    const opened = openRegister({ file: ':memory:' });
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const context = contextFor(opened.value, capturingIo(), '2024-08-02', true);
    expect(context.asOf).toBe('2024-08-02');
    expect(context.json).toBe(true);
    closeRegister(opened.value);
  });
});

import { describe, expect as vitestExpect, it } from 'vitest';

import {
  all,
  andThen,
  err,
  expect as expectValue,
  isErr,
  isOk,
  mapErr,
  mapOk,
  ok,
  partition,
  unwrapOr,
  type Result,
} from '../../../src/util/result';

describe('result', () => {
  it('holds a value on the ok side', () => {
    const result = ok(12);
    vitestExpect(result.ok).toBe(true);
    vitestExpect(isOk(result)).toBe(true);
    vitestExpect(isErr(result)).toBe(false);
    vitestExpect(result.value).toBe(12);
  });

  it('holds a reason on the error side', () => {
    const result = err('gauge out of calibration');
    vitestExpect(result.ok).toBe(false);
    vitestExpect(isErr(result)).toBe(true);
    vitestExpect(result.error).toBe('gauge out of calibration');
  });

  it('maps the ok side only', () => {
    vitestExpect(mapOk(ok(2), (n) => n * 3)).toEqual(ok(6));
    vitestExpect(mapOk(err<string>('no'), (n: number) => n * 3)).toEqual(err('no'));
  });

  it('maps the error side only', () => {
    vitestExpect(mapErr(err('no'), (e) => `${e}!`)).toEqual(err('no!'));
    vitestExpect(mapErr(ok<number>(2), (e) => `${e}!`)).toEqual(ok(2));
  });

  it('chains a second fallible step', () => {
    const half = (n: number): Result<number, string> => (n % 2 === 0 ? ok(n / 2) : err('odd'));
    vitestExpect(andThen(ok(8), half)).toEqual(ok(4));
    vitestExpect(andThen(ok(7), half)).toEqual(err('odd'));
    vitestExpect(andThen(err<string>('earlier'), half)).toEqual(err('earlier'));
  });

  it('falls back rather than throwing', () => {
    vitestExpect(unwrapOr(ok(1), 9)).toBe(1);
    vitestExpect(unwrapOr(err('x'), 9)).toBe(9);
  });

  it('throws with context when a value was demanded', () => {
    vitestExpect(expectValue(ok('here'), 'wanted')).toBe('here');
    vitestExpect(() => expectValue(err('missing gauge'), 'wanted')).toThrow(
      'wanted: missing gauge',
    );
    vitestExpect(() => expectValue(err(new Error('boom')), 'wanted')).toThrow('wanted: boom');
    vitestExpect(() => expectValue(err({ code: 7 }), 'wanted')).toThrow('{"code":7}');
  });

  it('collects a list and stops at the first error', () => {
    vitestExpect(all([ok(1), ok(2), ok(3)])).toEqual(ok([1, 2, 3]));
    vitestExpect(all([ok(1), err('second'), err('third')])).toEqual(err('second'));
    vitestExpect(all([])).toEqual(ok([]));
  });

  it('partitions a list without losing either side', () => {
    const split = partition([ok(1), err('a'), ok(2), err('b')]);
    vitestExpect(split.values).toEqual([1, 2]);
    vitestExpect(split.errors).toEqual(['a', 'b']);
  });
});

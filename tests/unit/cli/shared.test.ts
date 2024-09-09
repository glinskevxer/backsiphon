import { describe, expect, it } from 'vitest';

import { capturingIo } from '../../../src/cli/output';
import { report } from '../../../src/cli/shared';
import { err, ok } from '../../../src/util/result';

describe('report', () => {
  it('hands a value to the caller and prints nothing itself', () => {
    const io = capturingIo();
    let seen: string | undefined;
    report(io, ok('BA-00001'), (value) => {
      seen = value;
    });
    expect(seen).toBe('BA-00001');
    expect(io.lines).toEqual([]);
    expect(io.errors).toEqual([]);
  });

  it('prints a refusal on the error channel and calls nothing', () => {
    const io = capturingIo();
    let called = false;
    report(io, err('there is no connection with the id SC-00404'), () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(io.errors).toEqual(['there is no connection with the id SC-00404']);
    expect(io.lines).toEqual([]);
  });
});

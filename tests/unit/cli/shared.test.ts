import { describe, expect, it } from 'vitest';

import { capturingIo } from '../../../src/cli/output';
import { printLines, printOr, report } from '../../../src/cli/shared';
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

describe('printOr', () => {
  it('writes json where the caller asked for it', () => {
    const io = capturingIo();
    let printed = false;
    printOr(io, { json: true }, { id: 'SC-00001' }, () => {
      printed = true;
    });
    expect(printed).toBe(false);
    expect(JSON.parse(io.text())).toEqual({ id: 'SC-00001' });
  });

  it('hands the value to the printer otherwise, and writes nothing itself', () => {
    const io = capturingIo();
    printOr(io, { json: false }, { id: 'SC-00001' }, (value) => {
      io.out(`the connection is ${value.id}`);
    });
    expect(io.lines).toEqual(['the connection is SC-00001']);
  });
});

describe('printLines', () => {
  it('writes each line in order', () => {
    const io = capturingIo();
    printLines(io, ['one', 'two', 'three']);
    expect(io.lines).toEqual(['one', 'two', 'three']);
  });

  it('writes nothing for an empty list', () => {
    const io = capturingIo();
    printLines(io, []);
    expect(io.lines).toEqual([]);
  });
});

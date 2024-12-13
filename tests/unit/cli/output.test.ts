import { describe, expect, it } from 'vitest';

import {
  bullet,
  capturingIo,
  countingIo,
  describe as describePairs,
  heading,
  pluralise,
  table,
  writeJson,
} from '../../../src/cli/output';

interface Row {
  id: string;
  size: number;
  fitted: boolean;
  note?: string;
}

const rows: Row[] = [
  { id: 'BA-00001', size: 2, fitted: true, note: 'vault' },
  { id: 'BA-00002', size: 0.75, fitted: false },
];

describe('capturing io', () => {
  it('keeps what it was given, apart', () => {
    const io = capturingIo();
    io.out('first');
    io.out('second');
    io.err('trouble');
    expect(io.lines).toEqual(['first', 'second']);
    expect(io.errors).toEqual(['trouble']);
    expect(io.text()).toBe('first\nsecond');
  });

  it('writes json a script can read', () => {
    const io = capturingIo();
    writeJson(io, { id: 'BA-00001', sizes: [1, 2] });
    expect(JSON.parse(io.text())).toEqual({ id: 'BA-00001', sizes: [1, 2] });
  });
});

describe('a table', () => {
  it('lines the columns up on the widest cell', () => {
    const lines = table(rows, [
      { header: 'assembly', value: (row) => row.id },
      { header: 'size', value: (row) => row.size, align: 'right' },
    ]);
    expect(lines[0]).toBe('assembly  size');
    expect(lines[1]).toBe('--------  ----');
    expect(lines[2]).toBe('BA-00001     2');
    expect(lines[3]).toBe('BA-00002  0.75');
  });

  it('writes a flag as a word and a missing value as nothing', () => {
    const lines = table(rows, [
      { header: 'fitted', value: (row) => row.fitted },
      { header: 'note', value: (row) => row.note },
    ]);
    expect(lines[2]).toBe('yes     vault');
    expect(lines[3]).toBe('no');
  });

  it('keeps the header row when there is nothing in it', () => {
    const lines = table([], [{ header: 'assembly', value: (row: Row) => row.id }]);
    expect(lines).toEqual(['assembly', '--------']);
  });
});

describe('the other shapes', () => {
  it('lines a label and value pair up', () => {
    expect(describePairs([['id', 'BA-1'], ['location', 'meter vault']])).toEqual([
      'id        BA-1',
      'location  meter vault',
    ]);
  });

  it('underlines a heading to its own width', () => {
    expect(heading('assemblies')).toEqual(['assemblies', '==========']);
  });

  it('indents a list', () => {
    expect(bullet(['one', 'two'])).toEqual(['  - one', '  - two']);
  });

  it('counts things in words', () => {
    expect(pluralise(1, 'letter')).toBe('1 letter');
    expect(pluralise(2, 'letter')).toBe('2 letters');
    expect(pluralise(0, 'letter')).toBe('0 letters');
    expect(pluralise(2, 'premise', 'premises')).toBe('2 premises');
  });
});

describe('counting io', () => {
  it('passes everything through to the io underneath', () => {
    const inner = capturingIo();
    const counting = countingIo(inner);
    counting.out('a line');
    counting.err('a refusal');
    expect(inner.lines).toEqual(['a line']);
    expect(inner.errors).toEqual(['a refusal']);
  });

  it('counts only what went to the error channel', () => {
    const counting = countingIo(capturingIo());
    expect(counting.problems()).toBe(0);
    counting.out('a line');
    expect(counting.problems()).toBe(0);
    counting.err('one');
    counting.err('two');
    expect(counting.problems()).toBe(2);
  });
});

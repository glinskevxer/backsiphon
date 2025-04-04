import { describe, expect, it } from 'vitest';

import {
  parseCsv,
  parseRow,
  quoteCell,
  toRecords,
  writeCsv,
  writeRow,
} from '../../../src/util/csv';

describe('writing', () => {
  it('leaves a plain value alone', () => {
    expect(quoteCell('BA-00001')).toBe('BA-00001');
    expect(quoteCell('')).toBe('');
  });

  it('quotes anything with a comma, a quote or a newline in it', () => {
    expect(quoteCell('vault, north side')).toBe('"vault, north side"');
    expect(quoteCell('the "back" room')).toBe('"the ""back"" room"');
    expect(quoteCell('one\ntwo')).toBe('"one\ntwo"');
  });

  it('writes a row and a whole table', () => {
    expect(writeRow(['a', 'b, c'])).toBe('a,"b, c"');
    expect(
      writeCsv(
        ['id', 'note'],
        [
          ['BA-1', 'vault'],
          ['BA-2', 'a, b'],
        ],
      ),
    ).toBe('id,note\nBA-1,vault\nBA-2,"a, b"');
  });
});

describe('reading a row', () => {
  it('splits on commas', () => {
    expect(parseRow('a,b,c')).toEqual({ ok: true, value: ['a', 'b', 'c'] });
  });

  it('keeps a quoted comma inside its value', () => {
    const parsed = parseRow('a,"b, c",d');
    expect(parsed.ok && parsed.value).toEqual(['a', 'b, c', 'd']);
  });

  it('reads a doubled quote as one', () => {
    const parsed = parseRow('"the ""back"" room",x');
    expect(parsed.ok && parsed.value).toEqual(['the "back" room', 'x']);
  });

  it('keeps an empty value', () => {
    const parsed = parseRow('a,,c');
    expect(parsed.ok && parsed.value).toEqual(['a', '', 'c']);
  });

  it('refuses a quote that never closes', () => {
    expect(parseRow('a,"b').ok).toBe(false);
  });

  it('refuses a quote in the middle of a value', () => {
    expect(parseRow('ab"c').ok).toBe(false);
  });
});

describe('reading a table', () => {
  it('reads the header and the rows', () => {
    const parsed = parseCsv('id,note\nBA-1,vault\nBA-2,"a, b"');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.headers).toEqual(['id', 'note']);
    expect(parsed.value.rows).toHaveLength(2);
  });

  it('steps over a byte order mark from a spreadsheet', () => {
    const parsed = parseCsv('﻿id,note\nBA-1,vault');
    expect(parsed.ok && parsed.value.headers[0]).toBe('id');
  });

  it('steps over blank lines at the end', () => {
    const parsed = parseCsv('id\nBA-1\n\n');
    expect(parsed.ok && parsed.value.rows).toHaveLength(1);
  });

  it('reads windows line endings', () => {
    const parsed = parseCsv('id,note\r\nBA-1,vault\r\n');
    expect(parsed.ok && parsed.value.rows[0]).toEqual(['BA-1', 'vault']);
  });

  it('refuses a row with the wrong number of values', () => {
    const parsed = parseCsv('id,note\nBA-1');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain('line 2');
    }
  });

  it('refuses a file with no header at all', () => {
    expect(parseCsv('').ok).toBe(false);
    expect(parseCsv('   ').ok).toBe(false);
  });

  it('turns a table into records', () => {
    const parsed = parseCsv('id, note\nBA-1,vault');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(toRecords(parsed.value)).toEqual([{ id: 'BA-1', note: 'vault' }]);
  });

  it('round trips what it wrote', () => {
    const text = writeCsv(
      ['id', 'note'],
      [
        ['BA-1', 'vault, north'],
        ['BA-2', 'the "back" room'],
      ],
    );
    const parsed = parseCsv(text);
    expect(parsed.ok && parsed.value.rows[1]?.[1]).toBe('the "back" room');
  });
});

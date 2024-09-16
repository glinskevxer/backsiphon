/**
 * Comma separated values, written and read the way the contractors send them.
 *
 * There is no library here on purpose. What arrives is one of two things: a
 * file this program wrote, or a file somebody exported out of a spreadsheet,
 * and the only awkward parts of that are quoting and the byte order mark the
 * spreadsheet leaves at the front.
 */

import { err, ok, type Result } from './result';

const BOM = '﻿';

export function quoteCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function writeRow(cells: ReadonlyArray<string>): string {
  return cells.map(quoteCell).join(',');
}

export function writeCsv(
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): string {
  return [writeRow(headers), ...rows.map(writeRow)].join('\n');
}

/** Split one line into cells, honouring quotes and doubled quotes inside them. */
export function parseRow(line: string): Result<string[], string> {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  let index = 0;
  while (index < line.length) {
    const character = line[index];
    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      cell += character ?? '';
      index += 1;
      continue;
    }
    if (character === '"') {
      if (cell !== '') {
        return err(`a quote in the middle of a value: ${line}`);
      }
      quoted = true;
      index += 1;
      continue;
    }
    if (character === ',') {
      cells.push(cell);
      cell = '';
      index += 1;
      continue;
    }
    cell += character ?? '';
    index += 1;
  }
  if (quoted) {
    return err(`a value that opens a quote and never closes it: ${line}`);
  }
  cells.push(cell);
  return ok(cells);
}

export interface CsvTable {
  readonly headers: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
}

export function parseCsv(text: string): Result<CsvTable, string> {
  const cleaned = text.startsWith(BOM) ? text.slice(BOM.length) : text;
  const lines = cleaned
    .split(/\r?\n/)
    .filter((line, index) => line.trim() !== '' || index === 0);
  const first = lines[0];
  if (first === undefined || first.trim() === '') {
    return err('the file has no header row on it');
  }
  const headers = parseRow(first);
  if (!headers.ok) {
    return err(headers.error);
  }
  const rows: string[][] = [];
  for (const [offset, line] of lines.slice(1).entries()) {
    const row = parseRow(line);
    if (!row.ok) {
      return err(`line ${offset + 2}: ${row.error}`);
    }
    if (row.value.length !== headers.value.length) {
      return err(
        `line ${offset + 2} has ${row.value.length} values where the header has ${headers.value.length}`,
      );
    }
    rows.push(row.value);
  }
  return ok({ headers: headers.value, rows });
}

/** Turn a parsed table into records keyed by the header row. */
export function toRecords(table: CsvTable): Array<Record<string, string>> {
  return table.rows.map((row) => {
    const record: Record<string, string> = {};
    for (const [index, header] of table.headers.entries()) {
      record[header.trim()] = row[index] ?? '';
    }
    return record;
  });
}

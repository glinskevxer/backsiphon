/**
 * Writing things out.
 *
 * Everything the command line prints goes through here, for two reasons. A
 * clerk reads columns, and a script reads json, and neither should be told to
 * put up with the other. And nothing anywhere else in the program is allowed
 * to call console.log, so the tests can hold the output and read it.
 */

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

export function consoleIo(): CliIo {
  return {
    out: (line: string): void => {
      console.log(line);
    },
    err: (line: string): void => {
      console.error(line);
    },
  };
}

/** An io that keeps what it was given, for tests and for a dry run. */
export interface CapturingIo extends CliIo {
  readonly lines: string[];
  readonly errors: string[];
  text(): string;
}

export function capturingIo(): CapturingIo {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    out: (line: string): void => {
      lines.push(line);
    },
    err: (line: string): void => {
      errors.push(line);
    },
    text: (): string => lines.join('\n'),
  };
}

export type CellValue = string | number | boolean | undefined;

export interface Column<T> {
  readonly header: string;
  readonly value: (row: T) => CellValue;
  readonly align?: 'left' | 'right';
}

function render(value: CellValue): string {
  if (value === undefined) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  return String(value);
}

/** A plain column layout. No borders, because people paste these into email. */
export function table<T>(rows: ReadonlyArray<T>, columns: ReadonlyArray<Column<T>>): string[] {
  const body = rows.map((row) => columns.map((column) => render(column.value(row))));
  const widths = columns.map((column, index) =>
    Math.max(column.header.length, ...body.map((cells) => (cells[index] ?? '').length)),
  );
  const line = (cells: ReadonlyArray<string>): string =>
    cells
      .map((cell, index) => {
        const width = widths[index] ?? cell.length;
        return columns[index]?.align === 'right' ? cell.padStart(width) : cell.padEnd(width);
      })
      .join('  ')
      .trimEnd();

  return [
    line(columns.map((column) => column.header)),
    line(widths.map((width) => '-'.repeat(width))),
    ...body.map(line),
  ];
}

/** Two columns of label and value, for showing one record. */
export function describe(pairs: ReadonlyArray<[string, CellValue]>): string[] {
  const width = Math.max(...pairs.map(([label]) => label.length));
  return pairs.map(([label, value]) => `${label.padEnd(width)}  ${render(value)}`);
}

export function heading(text: string): string[] {
  return [text, '='.repeat(text.length)];
}

export function bullet(lines: ReadonlyArray<string>): string[] {
  return lines.map((line) => `  - ${line}`);
}

export function writeJson(io: CliIo, value: unknown): void {
  io.out(JSON.stringify(value, undefined, 2));
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

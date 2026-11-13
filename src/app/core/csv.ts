/**
 * Minimal RFC 4180 CSV reader - quoted fields, "" escapes, commas and newlines
 * inside quotes, CRLF, and a leading byte-order mark.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch !== '"') {
        field += ch;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
      continue;
    }

    switch (ch) {
      case '"':
        quoted = true;
        break;
      case ',':
        row.push(field);
        field = '';
        break;
      case '\r':
        // Swallowed; the \n of a CRLF pair ends the record.
        break;
      case '\n':
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        break;
      default:
        field += ch;
    }
  }

  row.push(field);
  rows.push(row);

  while (rows.length > 0 && isBlankRow(rows[rows.length - 1])) {
    rows.pop();
  }
  return rows;
}

export function isBlankRow(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim() === '');
}

/** Serialises rows back to CSV, quoting only where it is required. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(','),
    )
    .join('\r\n');
}

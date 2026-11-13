/**
 * Everything about *interpreting* a spreadsheet: which URLs to try, whether a
 * response is really CSV, where the names live, and how rows become tickets.
 *
 * Deliberately free of Angular and of I/O, so it can be reasoned about and
 * exercised on its own. Fetching lives in `sheet-loader.ts`.
 */
import { isBlankRow, parseCsv } from './csv';
import type { Candidate, ColumnMap, SheetTable } from './models';
import { joinName, tidyDetail, toDisplayCase } from './names';

/** A load failure with a message that is safe (and useful) to show on screen. */
export class SheetLoadError extends Error {
  constructor(
    message: string,
    readonly hint = '',
  ) {
    super(message);
    this.name = 'SheetLoadError';
  }
}

export type Failure = 'denied' | 'not-found' | 'blocked' | 'empty';

/**
 * Anchored labels, used only to decide whether row 0 is a header at all.
 *
 * Deliberately strict: the loose hints below are fine for *choosing* a column
 * once a header is known to exist, but using them to detect the header would
 * mean a sheet with no header whose first entrant is called something like
 * "Nameer" loses that person from the draw entirely.
 */
const HEADER_LABELS = [
  /^(first|last|given|family|sur)\s*names?$/i,
  /^(f|l)\s*names?$/i,
  /^full\s*names?$/i,
  /^names?$/i,
  /^(candidate|participant|attendee|employee|member|guest|staff)s?(\s*name)?$/i,
  /^(department|dept\.?|team|division|designation|title|role|company|branch|office|location)$/i,
  /^(city|town|suburb|area|region|district|village|address|state|country)$/i,
  /^(e-?mail|email\s*address)$/i,
  /^(id|no\.?|number|ticket(\s*(no\.?|number|id))?)$/i,
  /^(phone|mobile|contact)(\s*(no\.?|number))?$/i,
];

const FIRST_NAME_HINTS = [/^first\s*name$/i, /^firstname$/i, /^given\s*name$/i, /^f\s*name$/i, /first/i];

const LAST_NAME_HINTS = [
  /^last\s*name$/i,
  /^lastname$/i,
  /^surname$/i,
  /^family\s*name$/i,
  /^l\s*name$/i,
  /^sur\s*name$/i,
  /last/i,
];

/** Single-column name headers, used when there is no first/last pair. */
const WHOLE_NAME_HINTS = [
  /^full\s*name$/i,
  /^name$/i,
  /name/i,
  /candidate/i,
  /participant/i,
  /attendee/i,
  /employee/i,
  /member/i,
  /guest/i,
  /staff/i,
];

const DETAIL_HINTS = [
  /department/i,
  /^dept/i,
  /team/i,
  /division/i,
  /designation/i,
  /^title$/i,
  /company/i,
  /branch/i,
  /office/i,
  /location/i,
  /city/i,
  /town/i,
  /suburb/i,
  /area/i,
  /region/i,
  /district/i,
  /village/i,
  /address/i,
  /ticket/i,
  /^e-?mail$/i,
  /email/i,
  /^id$/i,
];

/**
 * Turns anything the user might paste into an ordered list of CSV endpoints.
 *
 * Accepted: a normal /spreadsheets/d/<id>/edit link, a File > Share > Publish
 * to web /d/e/<token>/pub link, an already-CSV export link, a bare sheet id,
 * or any other absolute URL that serves CSV.
 */
export function resolveEndpoints(raw: string): string[] {
  const input = raw.trim();
  if (input === '') {
    return [];
  }

  const gid = extractGid(input);
  const gidParam = gid === null ? '' : `&gid=${gid}`;
  const alreadyCsv = /output=csv|format=csv|out:csv/i.test(input);

  // "Publish to web" documents live under /d/e/<token>/ and ignore sharing.
  const published = /\/spreadsheets\/d\/e\/([\w-]+)/.exec(input);
  if (published) {
    const base = `https://docs.google.com/spreadsheets/d/e/${published[1]}/pub`;
    return unique([
      ...(alreadyCsv ? [input] : []),
      ...(gid === null ? [] : [`${base}?output=csv&gid=${gid}`]),
      `${base}?output=csv`,
    ]);
  }

  const id =
    /\/spreadsheets\/d\/([\w-]{20,})/.exec(input)?.[1] ?? (/^[\w-]{20,}$/.test(input) ? input : null);
  if (id !== null) {
    return unique([
      ...(alreadyCsv ? [input] : []),
      // `export` is first on purpose: it is the only one of the two that
      // answers with `Access-Control-Allow-Origin: *`, so it is the one a
      // browser can actually read cross-origin. gviz replies 200 text/csv but
      // without CORS headers, so it is kept only as a fallback for the odd
      // sheet where export is unavailable.
      `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gidParam}`,
      `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${gidParam}`,
    ]);
  }

  return /^https?:\/\//i.test(input) ? [input] : [];
}

/** True when the body is a sign-in or error page rather than CSV. */
export function looksLikeHtml(body: string): boolean {
  const head = body.slice(0, 400).trimStart().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml');
}

export function describeFailure(failures: readonly Failure[]): SheetLoadError {
  if (failures.includes('denied') || failures.includes('not-found')) {
    return new SheetLoadError(
      'The sheet is not readable without signing in.',
      'In Google Sheets open Share > General access and pick "Anyone with the link" (Viewer). ' +
        'Or use File > Share > Publish to web, choose Comma-separated values (.csv), and paste that link.',
    );
  }
  if (failures.includes('empty')) {
    return new SheetLoadError(
      'The sheet loaded but has no rows.',
      'Add the entrant names to the first tab, then load again.',
    );
  }
  return new SheetLoadError(
    'The browser could not reach the sheet.',
    'This is usually a sharing or network block. File > Share > Publish to web as CSV gives the ' +
      'most reliable link. You can also paste the names in directly.',
  );
}

/** Parses a CSV body into a table, detecting the header and best columns. */
export function interpretCsv(body: string, sourceUrl: string): SheetTable | null {
  return interpretRows(parseCsv(body), sourceUrl);
}

/**
 * Same as `interpretCsv` but starting from rows that are already parsed - the
 * Apps Script read endpoint hands back a 2D array rather than CSV text.
 */
export function interpretRows(
  input: readonly (readonly string[])[],
  sourceUrl: string,
): SheetTable | null {
  const rows = input.filter((row) => !isBlankRow(row));
  if (rows.length === 0) {
    return null;
  }

  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const firstRow = rows[0];
  const hasHeader = looksLikeHeader(firstRow, rows[1]);
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const columns = Array.from({ length: width }, (_, index) => {
    const label = (firstRow[index] ?? '').trim();
    return hasHeader && label !== '' ? label : `Column ${columnLetter(index)}`;
  });

  return {
    columns,
    rows: dataRows,
    hasHeader,
    sourceUrl,
    suggested: suggestColumns(columns, dataRows, hasHeader),
  };
}

/**
 * Builds the ticket list from a loaded table and the chosen columns. Names are
 * normalised to display casing, so whatever casing the sheet uses, the stage
 * reads "Angelo Fernando".
 */
export function buildCandidates(table: SheetTable, columns: ColumnMap): Candidate[] {
  const candidates: Candidate[] = [];

  table.rows.forEach((row, index) => {
    const name = joinName(cell(row, columns.firstName), cell(row, columns.lastName));
    if (name === '') {
      return;
    }
    const detail = tidyDetail(cell(row, columns.detail));
    candidates.push({ id: `r${index}-${name}-${detail}`.toLowerCase(), name, detail });
  });

  return candidates;
}

/**
 * Fallback for a sheet that cannot be reached: one entry per pasted line, as
 * `First Last` or `First Last, Detail`.
 */
export function parsePastedList(text: string): Candidate[] {
  const candidates: Candidate[] = [];

  text.split(/\r?\n/).forEach((line, index) => {
    const cells = parseCsv(line)[0] ?? [];
    const name = toDisplayCase(cells[0] ?? '');
    if (name === '') {
      return;
    }
    const detail = tidyDetail(cells[1] ?? '');
    candidates.push({ id: `p${index}-${name}-${detail}`.toLowerCase(), name, detail });
  });

  return candidates;
}

function cell(row: readonly string[], index: number): string {
  return index < 0 ? '' : (row[index] ?? '').trim();
}

function extractGid(url: string): string | null {
  return /[#&?]gid=(\d+)/.exec(url)?.[1] ?? null;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * A first row is a header when one of its cells is exactly a known column
 * label and there is at least one row beneath it. The second condition guards
 * against a one-row sheet whose only entrant happens to be called "Name".
 */
function looksLikeHeader(
  firstRow: readonly string[],
  secondRow: readonly string[] | undefined,
): boolean {
  const labelled = firstRow.some((cell) => {
    const value = cell.trim();
    return value !== '' && HEADER_LABELS.some((label) => label.test(value));
  });
  return labelled && secondRow !== undefined;
}

/**
 * Prefers an explicit First name / Last name pair, falls back to a single
 * whole-name column, and failing that to the first column holding any text.
 */
function suggestColumns(
  columns: readonly string[],
  rows: readonly (readonly string[])[],
  hasHeader: boolean,
): ColumnMap {
  if (hasHeader) {
    const firstName = matchColumn(columns, FIRST_NAME_HINTS, -1);
    const lastName = matchColumn(columns, LAST_NAME_HINTS, firstName);

    if (firstName >= 0 && lastName >= 0) {
      return { firstName, lastName, detail: detailFor(columns, rows, firstName, lastName) };
    }

    const whole = matchColumn(columns, WHOLE_NAME_HINTS, -1);
    if (whole >= 0) {
      return { firstName: whole, lastName: -1, detail: detailFor(columns, rows, whole) };
    }
  }

  // No usable header: first populated column is the name, the next is detail.
  const firstName = Math.max(0, firstPopulatedColumn(columns, rows, -1));
  return { firstName, lastName: -1, detail: firstPopulatedColumn(columns, rows, firstName) };
}

/**
 * The detail column: a labelled one if the header names it, otherwise any
 * other column that actually holds text.
 */
function detailFor(
  columns: readonly string[],
  rows: readonly (readonly string[])[],
  ...nameColumns: readonly number[]
): number {
  const labelled = matchColumn(columns, DETAIL_HINTS, ...nameColumns);
  if (labelled >= 0) {
    return labelled;
  }
  return columns.findIndex(
    (_, index) =>
      !nameColumns.includes(index) && rows.some((row) => (row[index] ?? '').trim() !== ''),
  );
}

function matchColumn(
  columns: readonly string[],
  hints: readonly RegExp[],
  ...exclude: readonly number[]
): number {
  for (const hint of hints) {
    const index = columns.findIndex((label, i) => !exclude.includes(i) && hint.test(label));
    if (index >= 0) {
      return index;
    }
  }
  return -1;
}

function firstPopulatedColumn(
  columns: readonly string[],
  rows: readonly (readonly string[])[],
  exclude: number,
): number {
  return columns.findIndex(
    (_, index) => index !== exclude && rows.some((row) => (row[index] ?? '').trim() !== ''),
  );
}

function columnLetter(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

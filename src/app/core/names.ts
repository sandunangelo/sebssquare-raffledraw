/**
 * Display casing for entrant names: each part starts with a capital and the
 * rest is lower case, so "angelo", "ANGELO" and "aNgElO" all read "Angelo" on
 * the stage no matter how they were typed into the sheet.
 */

/**
 * Word boundaries are whitespace, hyphens and apostrophes, so "mary-jane" and
 * "o'brien" capitalise correctly. A single letter after an apostrophe is left
 * alone, which keeps a possessive like "tony's" from becoming "Tony'S".
 */
const WORD_START = /(^|[\s\-'])(\p{L})(\p{L}*)/gu;

export function toDisplayCase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(WORD_START, (_match, separator: string, head: string, tail: string) =>
      separator === "'" && tail === '' ? separator + head : separator + head.toUpperCase() + tail,
    );
}

/** Joins the name fields read from the sheet into one display name. */
export function joinName(first: string, last: string): string {
  return [toDisplayCase(first), toDisplayCase(last)].filter((part) => part !== '').join(' ');
}

/**
 * Tidies the secondary line - a city, team or department.
 *
 * Only re-cases values that carry no capital at all, i.e. ones that were
 * clearly typed in a hurry ("panadura" becomes "Panadura"). Anything already
 * capitalised is left exactly as written, so deliberate forms like "IT", "HR"
 * and "People & Culture" survive untouched.
 */
export function tidyDetail(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return /\p{Lu}/u.test(trimmed) ? trimmed : toDisplayCase(trimmed);
}

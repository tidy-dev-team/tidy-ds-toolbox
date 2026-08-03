/**
 * Which day a note's timestamp belongs to.
 *
 * Three places ask that question - the CSV's `Date` column, the tag + author +
 * day grouping key, and the date the card prints - and they have to agree, or
 * an exported row and the card above it disagree about the same note. One
 * module owns the rule, and the day is always the UTC day: notes are stored
 * with UTC timestamps and read in whatever timezone the reader sits in, so
 * anything local would move a note between days by who opened the file.
 */

/** ISO day, so a spreadsheet sorts and parses it as a date. */
export function toIsoDay(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/** "Jul 28, 2026" - the human form of the same day the CSV spells in ISO. */
export function formatCardDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

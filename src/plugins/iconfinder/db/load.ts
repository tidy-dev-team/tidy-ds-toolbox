// Parse the committed icon database once and expose it as typed IconEntry[].
//
// The generated module ships the database as gzip+base64-compressed JSON (see
// decode.ts); we decompress and JSON.parse it once on first use and convert
// each hex hash to a bigint.

import { decodeIconDbJson } from "./decode";
import { buildTextSearchIndex } from "../hash/search";
import type { IndexedEntry } from "../hash/search";
import type { IconEntry } from "../hash/query";

interface RawEntry {
  name: string;
  source: string;
  hash: string;
  svg: string;
  terms?: string;
}

interface RawDatabase {
  generatedAt: string;
  count: number;
  entries: RawEntry[];
}

let cache: IconEntry[] | null = null;
let textIndex: IndexedEntry[] | null = null;

/** The parsed icon database. Parsed lazily and memoized for the session. */
export function getIconDatabase(): IconEntry[] {
  if (cache) {
    return cache;
  }
  const parsed = JSON.parse(decodeIconDbJson()) as RawDatabase;
  cache = parsed.entries.map((entry) => ({
    name: entry.name,
    source: entry.source,
    hash: BigInt(entry.hash),
    svg: entry.svg,
    terms: entry.terms,
  }));
  return cache;
}

/**
 * The text-search index over the database. Derived once and memoized for the
 * session, for the same reason the database itself is.
 *
 * Kept here rather than at the call site so that warming it also warms the
 * parse, and so that no caller can accidentally rebuild a 22k-entry index per
 * keystroke. The UI calls it once from an effect on mount; see `ui.tsx`.
 */
export function getIconTextIndex(): IndexedEntry[] {
  if (!textIndex) {
    textIndex = buildTextSearchIndex(getIconDatabase());
  }
  return textIndex;
}

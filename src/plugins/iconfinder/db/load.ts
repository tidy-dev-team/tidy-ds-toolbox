// Parse the committed icon database once and expose it as typed IconEntry[].
//
// The generated module ships the database as gzip+base64-compressed JSON (see
// decode.ts); we decompress and JSON.parse it once on first use and convert
// each hex hash to a bigint.

import { decodeIconDbJson } from "./decode";
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

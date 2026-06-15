// Parse the committed icon database once and expose it as typed IconEntry[].
//
// The generated module ships the database as a JSON string (not a JSON import)
// to keep the type checker fast on the multi-MB payload; we JSON.parse it once
// on first use and convert each hex hash to a bigint.

import { ICON_DB_JSON } from "./generated";
import type { IconEntry } from "../hash/query";

interface RawEntry {
  name: string;
  source: string;
  hash: string;
  svg: string;
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
  const parsed = JSON.parse(ICON_DB_JSON) as RawDatabase;
  cache = parsed.entries.map((entry) => ({
    name: entry.name,
    source: entry.source,
    hash: BigInt(entry.hash),
    svg: entry.svg,
  }));
  return cache;
}

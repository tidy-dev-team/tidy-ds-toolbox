// Text search over the icon database — the fallback for when the perceptual
// hash finds no confident visual match (or when the user simply knows the name
// of the icon they want).
//
// Each entry carries a `terms` string: lowercased, space-joined name tokens
// plus any tags/aliases harvested from the source library (e.g. the bell glyph
// carries "bell alarm sound notification notifications ringer …"). We score a
// query against name and terms with a small ranked heuristic — no fuzzy-match
// dependency.

import type { IconEntry } from "./query";

export interface TextMatch {
  entry: IconEntry;
  score: number;
}

/**
 * One database entry with the two things a query compares against already
 * derived: the lowercased name, and the term string split into tokens.
 *
 * Both used to be recomputed per entry per query. That is 22k `toLowerCase`
 * calls and 22k `split` allocations on every keystroke, and it was the bulk of
 * a search's cost - the comparison work itself is trivial by contrast. Neither
 * derived value depends on the query, so both are computed once when the
 * database is loaded.
 */
export interface IndexedEntry {
  entry: IconEntry;
  /** `entry.name`, lowercased. */
  name: string;
  /** `entry.terms`, split on spaces. Empty when the entry carries no terms. */
  termTokens: string[];
}

/**
 * Derives the search index for a database.
 *
 * Call once per database load and keep the result; see `db/load.ts`, which
 * memoizes it beside the database itself. The entry is kept by reference rather
 * than copied: this index is held for the whole session next to 22k entries
 * whose `svg` fields dominate their size, and copying them would double the
 * cost of the thing being optimised.
 */
export function buildTextSearchIndex(
  database: readonly IconEntry[],
): IndexedEntry[] {
  return database.map((entry) => ({
    entry,
    name: entry.name.toLowerCase(),
    termTokens: entry.terms ? entry.terms.split(" ") : [],
  }));
}

// Score tiers, highest first. The exact-name tier dominates so that querying a
// glyph's real name always floats it to the top above tag-only hits.
const SCORE_NAME_EXACT = 1000;
const SCORE_NAME_PREFIX = 200;
const SCORE_NAME_SUBSTRING = 80;
const SCORE_TERM_EXACT = 60;
const SCORE_TERM_PREFIX = 20;
const SCORE_TERM_SUBSTRING = 8;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter(Boolean);
}

/**
 * Score one entry against one already-lowercased query token. Returns 0 when
 * the token does not appear in the name or terms at all.
 */
function scoreToken(name: string, termTokens: string[], token: string): number {
  let score = 0;

  if (name === token) {
    score += SCORE_NAME_EXACT;
  } else if (name.startsWith(token)) {
    score += SCORE_NAME_PREFIX;
  } else if (name.includes(token)) {
    score += SCORE_NAME_SUBSTRING;
  }

  // Best single term contribution (don't reward an icon for having many terms).
  let termScore = 0;
  for (const t of termTokens) {
    if (t === token) {
      termScore = Math.max(termScore, SCORE_TERM_EXACT);
    } else if (t.startsWith(token)) {
      termScore = Math.max(termScore, SCORE_TERM_PREFIX);
    } else if (t.includes(token)) {
      termScore = Math.max(termScore, SCORE_TERM_SUBSTRING);
    }
  }
  return score + termScore;
}

/**
 * Rank the database against a free-text query, via the index built by
 * `buildTextSearchIndex`. Every query token must hit an
 * entry (AND semantics) for it to be included, so "bell off" narrows rather
 * than widens. Results are sorted by descending score, then by shorter name
 * (more specific) as a stable tiebreak, and limited to `n`.
 */
export function searchByText(
  query: string,
  index: readonly IndexedEntry[],
  n: number,
): TextMatch[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const matches: TextMatch[] = [];
  for (const { entry, name, termTokens } of index) {
    let total = 0;
    let everyTokenHit = true;
    for (const token of tokens) {
      const s = scoreToken(name, termTokens, token);
      if (s === 0) {
        everyTokenHit = false;
        break;
      }
      total += s;
    }
    if (!everyTokenHit) continue;

    matches.push({ entry, score: total });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.entry.name.length !== b.entry.name.length) {
      return a.entry.name.length - b.entry.name.length;
    }
    return a.entry.name.localeCompare(b.entry.name);
  });
  return matches.slice(0, n);
}

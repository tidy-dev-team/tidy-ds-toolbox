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
 * Rank the database against a free-text query. Every query token must hit an
 * entry (AND semantics) for it to be included, so "bell off" narrows rather
 * than widens. Results are sorted by descending score, then by shorter name
 * (more specific) as a stable tiebreak, and limited to `n`.
 */
export function searchByText(
  query: string,
  database: IconEntry[],
  n: number,
): TextMatch[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const matches: TextMatch[] = [];
  for (const entry of database) {
    const name = entry.name.toLowerCase();
    const termTokens = entry.terms ? entry.terms.split(" ") : [];

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

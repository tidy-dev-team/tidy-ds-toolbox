// Icon-database query and ranking logic.
//
// Constants:
// - MAX_DIST = 10: maximum Hamming distance that is still considered a match.
//   pHash distances below this are visually similar; above it we treat the
//   result as unreliable.
// - confidence(distance): linear fall-off from 1.0 at distance 0 to 0.0 at
//   MAX_DIST. Values above MAX_DIST clamp to 0.

import { hammingDistance } from "./core";

export const MAX_DIST = 10;

export interface IconEntry {
  name: string;
  source: string;
  hash: bigint;
  /** Normalized SVG markup for rendering the matched glyph. Optional so the
   * pure query logic and its tests need not carry display data. */
  svg?: string;
  /** Lowercased, space-joined search terms (name tokens + harvested tags).
   * Optional so the pure pHash query logic and its tests need not carry it. */
  terms?: string;
}

export interface MatchResult {
  entry: IconEntry;
  distance: number;
  confidence: number;
}

/**
 * Map a Hamming distance to a confidence score in [0, 1].
 * Linear fall-off: 1.0 at distance 0, 0.0 at MAX_DIST.
 */
export function confidence(distance: number): number {
  if (distance >= MAX_DIST) return 0;
  return Math.max(0, 1 - distance / MAX_DIST);
}

/**
 * Find the top-N matching icons in the database for the given query hash.
 *
 * Only entries with distance < maxDist are returned. Results are sorted by
 * ascending distance (best match first) and limited to n entries.
 */
export function findTopN(
  query: bigint,
  database: IconEntry[],
  n: number,
  maxDist: number = MAX_DIST,
): MatchResult[] {
  const matches: MatchResult[] = [];

  for (const entry of database) {
    const distance = hammingDistance(query, entry.hash);
    if (distance < maxDist) {
      matches.push({
        entry,
        distance,
        confidence: confidence(distance),
      });
    }
  }

  matches.sort((a, b) => a.distance - b.distance);
  return matches.slice(0, n);
}

/**
 * Return the N nearest entries by Hamming distance with NO distance threshold.
 *
 * Used only as a fallback when findTopN returns nothing: a simple/generic glyph
 * (an X, a plus, a bare arrow) has no confident match because its shape isn't
 * distinctive — measured, truly-unmatchable shapes land at the same distance as
 * a generic glyph's "real" match, so we cannot auto-decide quality. Instead we
 * surface the closest shapes verbatim and let the user judge. Callers MUST label
 * these as uncertain and MUST NOT show a confidence percentage (confidence() is
 * 0 for everything here).
 */
export function findNearest(
  query: bigint,
  database: IconEntry[],
  n: number,
): MatchResult[] {
  const matches: MatchResult[] = database.map((entry) => {
    const distance = hammingDistance(query, entry.hash);
    return { entry, distance, confidence: confidence(distance) };
  });
  matches.sort((a, b) => a.distance - b.distance);
  return matches.slice(0, n);
}

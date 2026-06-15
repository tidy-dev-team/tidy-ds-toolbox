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

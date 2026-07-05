// Pure nearest-match hint over a candidate list, used by resolveReferences
// to help an author fix an unresolved reference (ADR-0008).

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(
        dist[i - 1][j] + 1,
        dist[i][j - 1] + 1,
        dist[i - 1][j - 1] + cost,
      );
    }
  }
  return dist[rows - 1][cols - 1];
}

/**
 * Returns the closest candidate to `value`, or undefined if none is close
 * enough to be a useful hint (distance must be at most a third of the
 * longer string's length, and always at most 4 edits).
 */
export function didYouMean(
  value: string,
  candidates: string[],
): string | undefined {
  if (candidates.length === 0) return undefined;

  let best: { candidate: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = levenshtein(value.toLowerCase(), candidate.toLowerCase());
    if (!best || distance < best.distance) {
      best = { candidate, distance };
    }
  }
  if (!best) return undefined;

  const threshold = Math.min(
    4,
    Math.ceil(Math.max(value.length, best.candidate.length) / 3),
  );
  return best.distance <= threshold ? best.candidate : undefined;
}

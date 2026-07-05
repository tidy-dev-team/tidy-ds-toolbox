// Pure candidate-ranking core for the Related Components Section
// (CONTEXT.md "Related-component candidates…"). No Figma types — operates on
// plain name strings so it can be unit tested without a Figma runtime
// (mirrors categorizeAxes.ts). The Figma-touching file-wide scan +
// exclusion-set assembly lives in findRelatedCandidates.ts.
//
// Matching is by *distinctive-token containment*: a candidate name shares at
// least one whitespace/case/punctuation-delimited token with the source name
// (source "Button" -> "Icon Button", "Link Button", "Severity Button"), not
// substring/prefix (so "Buttonish" does not match "Button").

export interface RelatedCandidate {
  name: string;
  matchedTokens: string[];
}

export const DEFAULT_RELATED_CANDIDATES_CAP = 12;

function tokenize(name: string): string[] {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .flatMap((chunk) => chunk.split(/(?<=[a-z0-9])(?=[A-Z])/))
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

/**
 * Rank candidate names by distinctive-token containment against
 * `sourceName`, excluding `sourceName` itself and every name in
 * `excludeNames`, capped at `cap`. Ties break alphabetically for
 * deterministic output.
 */
export function rankRelatedCandidates(
  sourceName: string,
  allComponentNames: string[],
  excludeNames: ReadonlySet<string>,
  cap: number = DEFAULT_RELATED_CANDIDATES_CAP,
): RelatedCandidate[] {
  const sourceTokens = new Set(tokenize(sourceName));
  const seen = new Set<string>();
  const candidates: RelatedCandidate[] = [];

  for (const name of allComponentNames) {
    if (name === sourceName) continue;
    if (excludeNames.has(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);

    const matchedTokens = [
      ...new Set(tokenize(name).filter((token) => sourceTokens.has(token))),
    ];
    if (matchedTokens.length === 0) continue;

    candidates.push({ name, matchedTokens });
  }

  candidates.sort((a, b) => {
    if (b.matchedTokens.length !== a.matchedTokens.length) {
      return b.matchedTokens.length - a.matchedTokens.length;
    }
    return a.name.localeCompare(b.name);
  });

  return candidates.slice(0, cap);
}

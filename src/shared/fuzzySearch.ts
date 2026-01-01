/**
 * Fuzzy search utility for matching search queries against text
 */

export interface FuzzyMatch {
  score: number;
  positions: number[]; // Array of matched character indices
}

/**
 * Perform fuzzy matching of a query against a target string
 * Returns null if no match, otherwise returns score and match positions
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (!query) return { score: 0, positions: [] };

  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  // Check if all query characters exist in order
  let queryIndex = 0;
  let targetIndex = 0;
  const positions: number[] = [];
  let score = 0;
  let consecutiveBonus = 0;

  while (queryIndex < queryLower.length && targetIndex < targetLower.length) {
    if (queryLower[queryIndex] === targetLower[targetIndex]) {
      positions.push(targetIndex);

      // Bonus for consecutive matches
      if (
        positions.length > 1 &&
        positions[positions.length - 1] === positions[positions.length - 2] + 1
      ) {
        consecutiveBonus += 2;
      } else {
        consecutiveBonus = 0;
      }
      score += 1 + consecutiveBonus;

      // Bonus for matching at word start
      if (targetIndex === 0 || /\s/.test(target[targetIndex - 1])) {
        score += 10;
      }

      // Bonus for exact case match
      if (query[queryIndex] === target[targetIndex]) {
        score += 1;
      }

      queryIndex++;
    }
    targetIndex++;
  }

  // If we didn't match all query characters, no match
  if (queryIndex < queryLower.length) {
    return null;
  }

  // Bonus for shorter targets (more precise matches)
  score += Math.max(0, 50 - target.length);

  // Bonus for match starting at beginning
  if (positions.length > 0 && positions[0] === 0) {
    score += 20;
  }

  return { score, positions };
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Highlight matched portions of text with <mark> tags
 * This version takes the query and re-runs fuzzy match to get positions
 */
export function highlightMatches(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text);

  const match = fuzzyMatch(query, text);
  if (!match || match.positions.length === 0) return escapeHtml(text);

  let result = "";
  let lastIndex = 0;

  for (const pos of match.positions) {
    // Add text before match
    result += escapeHtml(text.slice(lastIndex, pos));
    // Add highlighted match
    result += `<mark>${escapeHtml(text[pos])}</mark>`;
    lastIndex = pos + 1;
  }
  // Add remaining text
  result += escapeHtml(text.slice(lastIndex));

  return result;
}

/**
 * Search multiple fields and return best match score
 */
export function fuzzyMatchMultiple(
  query: string,
  fields: string[],
): FuzzyMatch | null {
  let bestMatch: FuzzyMatch | null = null;

  for (const field of fields) {
    const match = fuzzyMatch(query, field);
    if (match && (!bestMatch || match.score > bestMatch.score)) {
      bestMatch = match;
    }
  }

  return bestMatch;
}

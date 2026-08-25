// The one glob dialect the agent-facing Operations speak.
//
// Deliberately tiny: `*` is the only wildcard, everything else is literal, and
// both ends are anchored, so a pattern with no `*` is an exact-match test.
// Kept in one place because `tidy_misprint_find_components`, `tidy_qa_run` and
// `tidy_ds_explorer_list_components` all advertise the same semantics to the
// agent, and three private copies is three chances for them to drift apart.
//
// Matched by scanning, not by a RegExp. The RegExp this replaced joined the
// literal segments with `.*`, which backtracks: `*a*a*a*...*b` against a name
// that ends in something else takes one nested loop per `*`, and a pattern an
// agent can plausibly type froze the plugin thread for nearly two minutes on a
// single 67-character name - then did it again for every other candidate, since
// the caller tests one name per component in the file. The plugin thread is the
// one that draws the UI and answers the Bridge, so there was no way out of it.
// A `*`-only glob does not need a backtracking engine: the segments between the
// wildcards are literals, and leftmost-first `indexOf` is both linear and
// exactly as correct, because a segment matched earlier never rules out a match
// that a later position would have allowed.

/**
 * A compiled glob. Shaped as `{ test }` so it reads at the call sites the way
 * the RegExp it replaced did.
 */
export interface GlobMatcher {
  /** Whether `value` matches the whole pattern, case-sensitively. */
  test(value: string): boolean;
}

/** Compile a `*`-only glob into an anchored, linear-time matcher. */
export function globToMatcher(glob: string): GlobMatcher {
  const segments = glob.split("*");

  // No wildcard at all: the pattern is an exact-match test, and saying so here
  // keeps the general path below from having to treat it as a special case.
  if (segments.length === 1) {
    const literal = segments[0];
    return { test: (value) => value === literal };
  }

  const first = segments[0];
  const last = segments[segments.length - 1];
  // Empty segments come from `**` or from a `*` at either end. They match
  // nothing and constrain nothing, so they are dropped rather than searched for.
  const middle = segments.slice(1, -1).filter((s) => s.length > 0);

  return {
    test(value) {
      // Both ends are anchored, so the fixed ends are checked before anything
      // is searched for: a mismatch there is the common case and costs one
      // comparison each.
      if (!value.startsWith(first)) return false;
      if (!value.endsWith(last)) return false;
      // The window the middle segments must fit inside. It closes when the
      // prefix and the suffix would have to overlap to both match, which is a
      // real rejection: `a*b` does not match `ab` by reusing one character.
      let from = first.length;
      const end = value.length - last.length;
      if (end < from) return false;
      for (const segment of middle) {
        const at = value.indexOf(segment, from);
        if (at < 0 || at + segment.length > end) return false;
        from = at + segment.length;
      }
      return true;
    },
  };
}

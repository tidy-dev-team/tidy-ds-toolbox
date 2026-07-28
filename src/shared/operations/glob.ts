// The one glob dialect the agent-facing Operations speak.
//
// Deliberately tiny: `*` is the only wildcard, everything else is literal, and
// both ends are anchored, so a pattern with no `*` is an exact-match test.
// Kept in one place because `tidy_misprint_find_components`, `tidy_qa_run` and
// `tidy_ds_explorer_list_components` all advertise the same semantics to the
// agent, and three private copies is three chances for them to drift apart.

/** Compile a `*`-only glob into an anchored RegExp. */
export function globToRegex(glob: string): RegExp {
  const escaped = glob
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp("^" + escaped.join(".*") + "$");
}

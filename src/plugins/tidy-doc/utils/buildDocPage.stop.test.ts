// The documentation build's stop behaviour (#185).
//
// The build has one load-bearing invariant: a run must never leave the target
// with its previous documentation page deleted and no new one in its place.
// The stop boundaries are therefore all in the read-and-plan half - after
// facts, after reference resolution, after the scan for existing pages - and
// once the first existing page is removed the run is committed: it is never
// asked about the token again, because a half-built page with the old page
// gone is exactly the "worse than not having run" outcome the ticket rules
// out. The refusal is structural: nothing past the boundary receives the
// token. What is under test here is the sentence a stopped run leaves behind,
// which is the only account of the stop that reaches anybody.

import { describe, it, expect } from "vitest";
import { describeStoppedDocBuild } from "./buildDocPage";

describe("describeStoppedDocBuild", () => {
  it("says the existing page is untouched", () => {
    const message = describeStoppedDocBuild();

    // The guarantee the boundaries exist to keep: the removal only ever
    // happens after the last checkpoint, so a stop always finds the old page
    // standing.
    expect(message).toMatch(/untouched|unchanged/i);
  });

  it("says re-running replaces the old page as usual", () => {
    const message = describeStoppedDocBuild();

    // The Operation is replace-wholesale by design, so the instinctive
    // re-run is correct and safe - the message should say so.
    expect(message).toMatch(/again|re-run/i);
    expect(message).toMatch(/replaces/i);
  });
});

// The QA checklist build's stop behaviour (#185).
//
// The boundary decision, in one sentence: the run stops anywhere in its
// read-and-check half, and nowhere in its draw half. Every prior block is
// removed only immediately before (or instead of) its replacement is drawn,
// so a stop that arrived before drawing leaves the canvas exactly as it was;
// a stop observed part way through drawing could leave a target with its old
// blocks cleared and the new ones half-drawn, which is the one outcome worse
// than not having run. That is why the composer takes no token at all - the
// signature is the guarantee. What is testable without Figma is the sentence
// the stopped run leaves behind, and the shape of the stopped result.

import { describe, it, expect } from "vitest";
import { describeStoppedChecklistRun } from "./stopMessages";

describe("describeStoppedChecklistRun", () => {
  it("names the target when the run got far enough to know it", () => {
    const message = describeStoppedChecklistRun("Buttons");

    expect(message).toContain("Buttons");
  });

  it("says nothing on the canvas changed, whichever half stopped", () => {
    // Both stop points sit before the first removal, so both promise the
    // same thing - and the promise is the invariant the boundaries exist
    // for: a cancelled run never leaves a target with its prior blocks
    // cleared and no new ones drawn.
    expect(describeStoppedChecklistRun("Buttons")).toMatch(
      /nothing on the canvas changed|canvas is unchanged/i,
    );
    expect(describeStoppedChecklistRun(null)).toMatch(
      /nothing on the canvas changed|canvas is unchanged/i,
    );
  });

  it("does not claim the checks were drawn", () => {
    // The run stopped before drawing, so there is no frame to point at -
    // the message must not suggest a partial checklist exists.
    const message = describeStoppedChecklistRun("Buttons");

    expect(message).toMatch(/before drawing|before anything was drawn/i);
  });

  it("says re-running is safe and replaces the prior checklist as usual", () => {
    const message = describeStoppedChecklistRun("Buttons");

    expect(message).toMatch(/again|re-run/i);
    expect(message).toMatch(/replaces/i);
  });
});

// The place-set Operation's stop behaviour (#185).
//
// The Operation has exactly one safe stop boundary: after the component is
// imported from the library and before it is cloned onto the page. Stopping
// there changes nothing - `importComponentByKeyAsync` places no node in the
// document. Once the clone exists, the run does not stop again: a clone whose
// localization stopped part way is the exact silent-relinking hazard this
// module exists to prevent (#14-#18), and it is worse than not having run.
// The refusal is structural - `localizeClone` takes no token - and what is
// under test here is the sentence the stopped run leaves behind, which is the
// only account of the stop that reaches anybody.

import { describe, it, expect } from "vitest";
import { describeStoppedPlaceSet } from "./stopMessages";

describe("describeStoppedPlaceSet", () => {
  it("names the component and says the canvas is unchanged", () => {
    const message = describeStoppedPlaceSet("Buttons");

    expect(message).toContain("Buttons");
    expect(message).toMatch(/nothing was placed|canvas is unchanged/i);
  });

  it("says re-running is the way to get the set", () => {
    // Nothing was placed, so the instinctive re-run is correct and safe -
    // the message should say so rather than leave it guessed.
    const message = describeStoppedPlaceSet("Buttons");

    expect(message).toMatch(/again/i);
  });

  it("does not claim anything was half-placed", () => {
    // The boundary sits before the clone exists, so there is no partial set
    // to describe - and the message must not suggest there is.
    const message = describeStoppedPlaceSet("Buttons");

    expect(message).toMatch(/before/i);
  });
});

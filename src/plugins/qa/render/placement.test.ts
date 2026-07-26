import { describe, it, expect } from "vitest";
import { decidePlacement } from "./placement";

describe("decidePlacement", () => {
  it("places beside the anchor on a first build", () => {
    expect(decidePlacement({ relocate: false, hasPrior: false })).toEqual({
      kind: "anchor",
    });
  });

  it("places beside the anchor whenever the call carried placement intent", () => {
    // A selected instance, or an explicit anchorNodeId — this is how a
    // checklist is deliberately moved, so a prior frame doesn't pin it.
    expect(
      decidePlacement({
        relocate: true,
        hasPrior: true,
        rememberedAnchorId: "1:99",
      }),
    ).toEqual({ kind: "anchor" });
  });

  it("re-anchors to the remembered node when no intent was expressed", () => {
    // The regression: an agent targeting the component set must not drag the
    // frame to the set — it goes back beside the instance it was built against.
    expect(
      decidePlacement({
        relocate: false,
        hasPrior: true,
        rememberedAnchorId: "1:99",
      }),
    ).toEqual({ kind: "remembered", anchorId: "1:99" });
  });

  it("rebuilds in place for a pre-v2 stamp with no remembered anchor", () => {
    expect(decidePlacement({ relocate: false, hasPrior: true })).toEqual({
      kind: "in-place",
    });
  });
});

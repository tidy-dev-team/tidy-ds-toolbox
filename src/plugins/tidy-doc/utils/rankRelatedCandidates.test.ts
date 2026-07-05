import { describe, it, expect } from "vitest";
import { rankRelatedCandidates } from "./rankRelatedCandidates";

describe("rankRelatedCandidates", () => {
  it("matches by distinctive-token containment, not prefix/substring", () => {
    const result = rankRelatedCandidates(
      "Button",
      ["Icon Button", "Link Button", "Severity Button", "Buttonish", "Toggle"],
      new Set(),
    );
    expect(result.map((c) => c.name).sort()).toEqual([
      "Icon Button",
      "Link Button",
      "Severity Button",
    ]);
  });

  it("excludes the source name itself even when present in the scan", () => {
    const result = rankRelatedCandidates(
      "Button",
      ["Button", "Icon Button"],
      new Set(),
    );
    expect(result.map((c) => c.name)).toEqual(["Icon Button"]);
  });

  it("excludes every name in excludeNames (own variants + building blocks)", () => {
    const result = rankRelatedCandidates(
      "Button",
      ["Icon Button", "Link Button", "Icon"],
      new Set(["Icon Button", "Icon"]),
    );
    expect(result.map((c) => c.name)).toEqual(["Link Button"]);
  });

  it("ranks by shared-token count descending", () => {
    const result = rankRelatedCandidates(
      "Icon Button",
      ["Link Button", "Icon Link Button", "Icon"],
      new Set(),
    );
    expect(result.map((c) => c.name)).toEqual([
      "Icon Link Button",
      "Icon",
      "Link Button",
    ]);
  });

  it("breaks ties alphabetically for deterministic output", () => {
    const result = rankRelatedCandidates(
      "Button",
      ["Severity Button", "Link Button", "Icon Button"],
      new Set(),
    );
    expect(result.map((c) => c.name)).toEqual([
      "Icon Button",
      "Link Button",
      "Severity Button",
    ]);
  });

  it("caps the ranked result list", () => {
    const result = rankRelatedCandidates(
      "Button",
      ["A Button", "B Button", "C Button", "D Button"],
      new Set(),
      2,
    );
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name)).toEqual(["A Button", "B Button"]);
  });

  it("dedupes repeated names in the scan input", () => {
    const result = rankRelatedCandidates(
      "Button",
      ["Icon Button", "Icon Button"],
      new Set(),
    );
    expect(result).toHaveLength(1);
  });

  it("returns an empty list when nothing shares a token", () => {
    const result = rankRelatedCandidates("Button", ["Toggle", "Checkbox"], new Set());
    expect(result).toEqual([]);
  });
});

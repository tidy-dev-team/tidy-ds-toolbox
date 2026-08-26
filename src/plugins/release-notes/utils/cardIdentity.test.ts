import { describe, it, expect } from "vitest";
import {
  cardPlacementKey,
  isOwnedCard,
  isLegacyNamedCard,
  isStampedCard,
  parseCardStamp,
  classifyCardCandidate,
  type CardNode,
  type CardStamp,
} from "./cardIdentity";

function stamp(overrides: Partial<CardStamp> = {}): CardStamp {
  return {
    kind: "component-set",
    subjectId: "2733:72",
    builtAt: "2026-07-28T09:15:00.000Z",
    ...overrides,
  };
}

function node(overrides: Partial<CardNode> = {}): CardNode {
  return {
    isFrame: true,
    isTopLevel: true,
    name: "Changelog - Buttons",
    stamp: null,
    ...overrides,
  };
}

describe("parseCardStamp", () => {
  it("reads a stamp", () => {
    expect(parseCardStamp(JSON.stringify(stamp()))).toEqual(stamp());
  });

  it("is null for no data, junk, and a shape without a kind", () => {
    expect(parseCardStamp("")).toBeNull();
    expect(parseCardStamp("{not json")).toBeNull();
    expect(parseCardStamp(JSON.stringify({ subjectId: "x" }))).toBeNull();
  });
});

describe("isStampedCard", () => {
  it("claims a stamped card, whatever it is called or wherever it sits", () => {
    expect(
      isStampedCard(node({ name: "dragged and renamed", stamp: stamp() })),
    ).toBe(true);
  });

  it("claims a card whose Subject is gone, which nothing else can reach", () => {
    // Why a publish sweeps by stamp rather than per live Subject: delete the
    // last note about Buttons and no Subject-shaped rule names its card.
    expect(isStampedCard(node({ stamp: stamp({ subjectId: "410:9" }) }))).toBe(
      true,
    );
  });

  it.each([
    ["a designer frame that ends in the suffix", "client-release-notes"],
    ["a frame named exactly after a Subject", "Buttons-release-notes"],
    ["the pre-stamp aggregate name", "release-notes-frame"],
  ])("refuses %s, because a name is not proof", (_label, name) => {
    // The finding this rule exists for. Any of these three could be a card from
    // an older build or a frame a designer made and named, and nothing can tell
    // them apart. A publish is routine and unconfirmed, so it deletes none of
    // them: a duplicate card is visible and fixable, deleted work is neither.
    expect(isStampedCard(node({ name }))).toBe(false);
    expect(isOwnedCard(node({ name }))).toBe(true);
  });
});

describe("isLegacyNamedCard", () => {
  it("reports the pre-stamp names, so a publish can say what it left", () => {
    expect(isLegacyNamedCard(node({ name: "release-notes-frame" }))).toBe(true);
    expect(isLegacyNamedCard(node({ name: "Buttons-release-notes" }))).toBe(
      true,
    );
  });

  it("is not a stamped card, so a publish counts each frame once", () => {
    expect(
      isLegacyNamedCard(
        node({ name: "Buttons-release-notes", stamp: stamp() }),
      ),
    ).toBe(false);
  });

  it("leaves an ordinary frame out of the count", () => {
    expect(isLegacyNamedCard(node({ name: "Buttons" }))).toBe(false);
    expect(
      isLegacyNamedCard(node({ isFrame: false, name: "release-notes-frame" })),
    ).toBe(false);
  });
});

describe("classifyCardCandidate", () => {
  it("never treats an ordinary designer frame as a candidate", () => {
    expect(
      classifyCardCandidate(node({ name: "Buttons", stamp: null })),
    ).toBeNull();
    expect(
      classifyCardCandidate(
        node({ name: "Buttons-release-notes", isTopLevel: false }),
      ),
    ).toBeNull();
  });

  it.each([
    "client-release-notes",
    "Buttons-release-notes",
    "release-notes-frame",
  ])("classifies %s as an unverified legacy-name match", (name) => {
    expect(classifyCardCandidate(node({ name }))).toBe(
      "unverified-legacy-name",
    );
  });

  it("skips a legacy match after it is renamed", () => {
    expect(classifyCardCandidate(node({ name: "Buttons" }))).toBeNull();
  });

  it("classifies a stamped frame as verified output", () => {
    expect(classifyCardCandidate(node({ stamp: stamp() }))).toBe(
      "verified-stamped",
    );
  });
});

describe("isOwnedCard", () => {
  it("is the union of the two rules for the candidate review", () => {
    const everyShape = [
      node({ stamp: stamp() }),
      node({ stamp: stamp({ kind: "aggregate", subjectId: "" }) }),
      node({ name: "release-notes-frame" }),
      node({ name: "Buttons-release-notes" }),
      node({ name: "client-release-notes" }),
      node({ name: "Buttons" }),
    ];

    for (const candidate of everyShape) {
      expect(isOwnedCard(candidate)).toBe(
        isStampedCard(candidate) || isLegacyNamedCard(candidate),
      );
    }
  });

  it.each([
    ["a stamped Subject card", node({ stamp: stamp() })],
    [
      "the stamped aggregate",
      node({ stamp: stamp({ kind: "aggregate", subjectId: "" }) }),
    ],
    ["a pre-stamp Subject card", node({ name: "Buttons-release-notes" })],
    // The old deletion path swept every *-release-notes frame and every stamp,
    // and left a pre-stamp aggregate on the page for ever.
    ["the pre-stamp aggregate frame", node({ name: "release-notes-frame" })],
  ])("owns %s", (_label, subject) => {
    expect(isOwnedCard(subject)).toBe(true);
  });

  it("leaves a designer's own frames alone", () => {
    expect(isOwnedCard(node({ name: "Release notes (hand drawn)" }))).toBe(
      false,
    );
    expect(isOwnedCard(node({ name: "Buttons" }))).toBe(false);
  });

  it("ignores a non-frame that happens to carry an owned name", () => {
    expect(
      isOwnedCard(node({ isFrame: false, name: "release-notes-frame" })),
    ).toBe(false);
  });

  it("reaches the pre-stamp cards a publish deliberately will not", () => {
    // Every pre-stamp name is indistinguishable from a designer's frame, so
    // removing one is a decision only a designer may take after review.
    expect(isOwnedCard(node({ name: "Retired-release-notes" }))).toBe(true);
    expect(isStampedCard(node({ name: "Retired-release-notes" }))).toBe(false);
  });
});

describe("cardPlacementKey", () => {
  it("tells the aggregate apart from a Subject card", () => {
    expect(
      cardPlacementKey(stamp({ kind: "aggregate", subjectId: "" })),
    ).not.toBe(
      cardPlacementKey(stamp({ kind: "component-set", subjectId: "" })),
    );
  });

  it("tells two Subjects apart", () => {
    expect(cardPlacementKey(stamp({ subjectId: "1:2" }))).not.toBe(
      cardPlacementKey(stamp({ subjectId: "3:4" })),
    );
  });

  it("is the same key for the same Subject on a later publish", () => {
    expect(
      cardPlacementKey(stamp({ kind: "foundation-page", subjectId: "9:9" })),
    ).toBe(
      cardPlacementKey(
        stamp({
          kind: "foundation-page",
          subjectId: "9:9",
          builtAt: "2026-08-26T00:00:00.000Z",
        }),
      ),
    );
  });
});

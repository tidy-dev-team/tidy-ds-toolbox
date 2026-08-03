import { describe, it, expect } from "vitest";
import {
  isOwnedCard,
  isReplaceableCard,
  parseCardStamp,
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

describe("isReplaceableCard", () => {
  const SUBJECTS = ["Buttons", "Divider"];

  it("claims a stamped card, whatever it is called", () => {
    expect(
      isReplaceableCard(
        node({ name: "dragged and renamed", stamp: stamp() }),
        SUBJECTS,
      ),
    ).toBe(true);
  });

  it("claims a card whose Subject is gone, which nothing else can reach", () => {
    // Why a publish sweeps by ownership rather than per live Subject: delete
    // the last note about Buttons and no Subject-shaped rule names its card.
    expect(
      isReplaceableCard(node({ stamp: stamp({ subjectId: "410:9" }) }), []),
    ).toBe(true);
  });

  it("claims the pre-stamp names it can be sure of", () => {
    expect(isReplaceableCard(node({ name: "release-notes-frame" }), [])).toBe(
      true,
    );
    expect(
      isReplaceableCard(node({ name: "Buttons-release-notes" }), SUBJECTS),
    ).toBe(true);
  });

  it("leaves a designer's frame alone even when it ends in the suffix", () => {
    // The regression this rule exists to prevent. A publish is automatic, so a
    // frame it cannot prove is its own must survive. `isOwnedCard` claims this
    // one, and a publish sweeping with that rule would have deleted a
    // designer's work silently, on every publish.
    const theirs = node({ name: "client-release-notes" });

    expect(isReplaceableCard(theirs, SUBJECTS)).toBe(false);
    expect(isOwnedCard(theirs)).toBe(true);
  });

  it("leaves a pre-stamp card for a Subject with no notes left", () => {
    // Unreachable by a publish, on purpose: it cannot tell that frame from a
    // designer's. Clear Canvas is the way out.
    expect(
      isReplaceableCard(node({ name: "Retired-release-notes" }), SUBJECTS),
    ).toBe(false);
  });
});

describe("isOwnedCard", () => {
  it("is a superset of isReplaceableCard, so Clear Canvas strands nothing", () => {
    const subjects = ["Buttons"];
    const everyShape = [
      node({ stamp: stamp() }),
      node({ stamp: stamp({ kind: "aggregate", subjectId: "" }) }),
      node({ name: "release-notes-frame" }),
      node({ name: "Buttons-release-notes" }),
      node({ name: "client-release-notes" }),
    ];

    for (const candidate of everyShape) {
      if (isReplaceableCard(candidate, subjects)) {
        expect(isOwnedCard(candidate)).toBe(true);
      }
    }
  });

  it.each([
    ["a stamped Subject card", node({ stamp: stamp() })],
    [
      "the stamped aggregate",
      node({ stamp: stamp({ kind: "aggregate", subjectId: "" }) }),
    ],
    ["a pre-stamp Subject card", node({ name: "Buttons-release-notes" })],
    // The regression: Clear Canvas swept every *-release-notes frame and every
    // stamp, and left a pre-stamp aggregate on the page for ever.
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
    // The reason Clear Canvas exists as its own action. A pre-stamp card whose
    // Subject was renamed or has no notes left is indistinguishable from a
    // designer's frame, so only an explicit request may remove it.
    expect(isOwnedCard(node({ name: "Retired-release-notes" }))).toBe(true);
    expect(isReplaceableCard(node({ name: "Retired-release-notes" }), [])).toBe(
      false,
    );
  });
});

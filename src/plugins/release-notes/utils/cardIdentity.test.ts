import { describe, it, expect } from "vitest";
import {
  isAggregateCard,
  isCardForSubject,
  isOwnedCard,
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

const BUTTONS = { id: "2733:72", name: "Buttons" };

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

describe("isAggregateCard", () => {
  it("matches the stamped aggregate", () => {
    expect(
      isAggregateCard(
        node({ stamp: stamp({ kind: "aggregate", subjectId: "" }) }),
      ),
    ).toBe(true);
  });

  it("matches the pre-stamp aggregate frame by name", () => {
    expect(isAggregateCard(node({ name: "release-notes-frame" }))).toBe(true);
  });

  it("does not match a Subject card", () => {
    expect(isAggregateCard(node({ stamp: stamp() }))).toBe(false);
    expect(isAggregateCard(node({ name: "Buttons-release-notes" }))).toBe(
      false,
    );
  });
});

describe("isCardForSubject", () => {
  it("matches by stamped subject id, whatever the frame is called", () => {
    expect(
      isCardForSubject(
        node({ name: "dragged and renamed", stamp: stamp() }),
        BUTTONS,
      ),
    ).toBe(true);
  });

  it("matches the pre-stamp name for that Subject", () => {
    expect(
      isCardForSubject(node({ name: "Buttons-release-notes" }), BUTTONS),
    ).toBe(true);
  });

  it("does not match another Subject's card", () => {
    expect(
      isCardForSubject(node({ stamp: stamp({ subjectId: "410:9" }) }), BUTTONS),
    ).toBe(false);
    expect(
      isCardForSubject(node({ name: "Chip-release-notes" }), BUTTONS),
    ).toBe(false);
  });
});

describe("isOwnedCard", () => {
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

  it("is the union of the two narrower rules", () => {
    const everyMatch = [
      node({ stamp: stamp() }),
      node({ stamp: stamp({ kind: "aggregate", subjectId: "" }) }),
      node({ name: "release-notes-frame" }),
      node({ name: "Buttons-release-notes" }),
    ];

    for (const candidate of everyMatch) {
      const claimedByNarrow =
        isAggregateCard(candidate) || isCardForSubject(candidate, BUTTONS);
      expect(claimedByNarrow).toBe(true);
      expect(isOwnedCard(candidate)).toBe(true);
    }
  });
});

import { describe, it, expect } from "vitest";
import {
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

  it("claims a card whose Subject is gone, which nothing else can reach", () => {
    // Why a publish sweeps with this rule rather than one per live Subject:
    // delete the last note about Buttons and no Subject-shaped rule names its
    // card any more. Only ownership does, so only ownership can remove it.
    expect(isOwnedCard(node({ stamp: stamp({ subjectId: "410:9" }) }))).toBe(
      true,
    );
    expect(isOwnedCard(node({ name: "Retired-release-notes" }))).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  cardPlacementKey,
  componentCardPosition,
  pageEdgeSlot,
  resolveCardPlacement,
} from "./placement";

describe("pageEdgeSlot", () => {
  it("puts slot 0 at the origin on an empty page", () => {
    expect(pageEdgeSlot([], 0, 560, 100)).toEqual({ x: 0, y: 0 });
  });

  it("sits left of the leftmost frame, aligned to the topmost", () => {
    const position = pageEdgeSlot(
      [
        { x: 400, y: 300 },
        { x: 1200, y: 120 },
        { x: 900, y: 800 },
      ],
      0,
      560,
      100,
    );

    expect(position).toEqual({ x: 400 - 560 - 100, y: 120 });
  });

  it("handles content already at negative coordinates", () => {
    expect(pageEdgeSlot([{ x: -2000, y: -50 }], 0, 560, 100)).toEqual({
      x: -2660,
      y: -50,
    });
  });

  it("steps one card plus one gap left per slot", () => {
    const content = [{ x: 0, y: 0 }];

    expect(
      [0, 1, 2].map((slot) => pageEdgeSlot(content, slot, 560, 100)),
    ).toEqual([
      { x: -660, y: 0 },
      { x: -1320, y: 0 },
      { x: -1980, y: 0 },
    ]);
  });

  it("does not drift, whichever Subject is published and however often", () => {
    // The bug this rule replaces: position was read off the page, cards
    // included. Publishing sprint A put its card at -660, publishing sprint B
    // measured that card and went to -1320, and publishing A again measured B
    // and moved to -1980. Alternating the two sprints walked both cards left
    // without limit.
    //
    // The content never contains a card and the slot belongs to the Subject, so
    // every publish below is a redraw in place.
    const content = [{ x: 0, y: 0 }];
    const slotOf = { a: 0, b: 1 };

    const publishA = () => pageEdgeSlot(content, slotOf.a, 560, 100);
    const publishB = () => pageEdgeSlot(content, slotOf.b, 560, 100);

    expect([publishA(), publishB(), publishA(), publishB()]).toEqual([
      { x: -660, y: 0 },
      { x: -1320, y: 0 },
      { x: -660, y: 0 },
      { x: -1320, y: 0 },
    ]);
  });

  it("clears the frame a nested component lives in, not the component", () => {
    // A component inside a documentation frame gets this rule rather than
    // componentCardPosition, so the card clears the frame instead of landing
    // inside it. Only page children are measured, so the component's own
    // frame-relative offset never reaches the sum.
    const documentationFrame = { x: 0, y: 0 };

    expect(pageEdgeSlot([documentationFrame], 0, 560, 100)).toEqual({
      x: -660,
      y: 0,
    });
  });
});

describe("componentCardPosition", () => {
  it("sits immediately left of the set, tops aligned", () => {
    expect(componentCardPosition({ x: 1000, y: 250 }, 560, 100)).toEqual({
      x: 340,
      y: 250,
    });
  });
});

describe("cardPlacementKey", () => {
  it("tells the aggregate apart from a Subject card", () => {
    expect(cardPlacementKey("aggregate", "")).not.toBe(
      cardPlacementKey("component-set", ""),
    );
  });

  it("tells two Subjects apart", () => {
    expect(cardPlacementKey("component-set", "1:2")).not.toBe(
      cardPlacementKey("component-set", "3:4"),
    );
  });

  it("is the same key for the same Subject on a later publish", () => {
    expect(cardPlacementKey("foundation-page", "9:9")).toBe(
      cardPlacementKey("foundation-page", "9:9"),
    );
  });
});

describe("resolveCardPlacement", () => {
  it("positions a card that has never been drawn", () => {
    expect(resolveCardPlacement(null, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
    });
  });

  it("leaves a card where the user moved it", () => {
    expect(
      resolveCardPlacement({ pageId: "1:1", x: -300, y: 940 }, { x: 0, y: 0 }),
    ).toEqual({ x: -300, y: 940 });
  });

  it("keeps a remembered origin rather than treating it as unplaced", () => {
    expect(
      resolveCardPlacement({ pageId: "1:1", x: 0, y: 0 }, { x: 500, y: 500 }),
    ).toEqual({ x: 0, y: 0 });
  });
});

import { describe, it, expect } from "vitest";
import { componentCardPosition, foundationCardPosition } from "./placement";

describe("foundationCardPosition", () => {
  it("puts the card at the origin on an empty page", () => {
    expect(foundationCardPosition([], 560, 100)).toEqual({ x: 0, y: 0 });
  });

  it("sits left of the leftmost frame, aligned to the topmost", () => {
    const position = foundationCardPosition(
      [
        { x: 400, y: 300 },
        { x: 1200, y: 120 },
        { x: 900, y: 800 },
      ],
      560,
      100,
    );

    expect(position).toEqual({ x: 400 - 560 - 100, y: 120 });
  });

  it("handles content already at negative coordinates", () => {
    expect(foundationCardPosition([{ x: -2000, y: -50 }], 560, 100)).toEqual({
      x: -2660,
      y: -50,
    });
  });

  it("does not drift when re-run with the same siblings", () => {
    const siblings = [{ x: 0, y: 0 }];
    const first = foundationCardPosition(siblings, 560, 100);
    const second = foundationCardPosition(siblings, 560, 100);

    // The caller excludes the card itself, so a second publish lands in the
    // same place rather than stepping further left.
    expect(second).toEqual(first);
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
